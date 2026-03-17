import json
from database import get_db, get_redis
from models.collections import SESSIONS, JOB_ROLES, SKILLS, QUESTIONS
from utils.helpers import generate_id, utc_now, str_objectid
from utils.gemini import generate_interview_question

MAX_QUESTIONS = 10
SESSION_TTL = 7200  # 2 hours


async def start_interview(user_id: str, role_id: str = None) -> dict:
    """Start a new interview session."""
    db = get_db()
    redis = get_redis()

    # Get user skills
    skills_doc = await db[SKILLS].find_one({"user_id": user_id})
    skills = skills_doc.get("skills", ["general"]) if skills_doc else ["general"]

    # Get role
    role_title = "Software Developer"
    if role_id:
        from bson import ObjectId
        role = await db[JOB_ROLES].find_one({"_id": ObjectId(role_id)})
        if role:
            role_title = role["title"]

    # Check for existing questions in question bank
    bank_questions = []
    if role_id:
        cursor = db[QUESTIONS].find({"role_id": role_id}).limit(5)
        async for q in cursor:
            bank_questions.append(q["question"])

    # Generate first question
    question_data = await generate_interview_question(
        skills=skills,
        role_title=role_title,
        difficulty="medium",
    )

    session_id = generate_id()
    question_id = generate_id()

    # Create session in MongoDB
    session_doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role_id": role_id,
        "role_title": role_title,
        "status": "in_progress",
        "question_count": 1,
        "max_questions": MAX_QUESTIONS,
        "current_difficulty": "medium",
        "started_at": utc_now(),
    }
    await db[SESSIONS].insert_one(session_doc)

    # Store session state in Redis
    session_state = {
        "user_id": user_id,
        "role_title": role_title,
        "skills": json.dumps(skills),
        "question_count": 1,
        "max_questions": MAX_QUESTIONS,
        "current_difficulty": "medium",
        "status": "in_progress",
    }
    await redis.hset(f"session:{session_id}", mapping=session_state)
    await redis.expire(f"session:{session_id}", SESSION_TTL)

    # Store question in Redis
    q_data = {
        "question_id": question_id,
        "question": question_data.get("question", "Tell me about yourself."),
        "difficulty": question_data.get("difficulty", "medium"),
        "category": question_data.get("category", "general"),
    }
    await redis.hset(f"session:{session_id}:q:{question_id}", mapping=q_data)
    await redis.rpush(f"session:{session_id}:questions", question_id)
    await redis.expire(f"session:{session_id}:q:{question_id}", SESSION_TTL)
    await redis.expire(f"session:{session_id}:questions", SESSION_TTL)

    return {
        "session_id": session_id,
        "question": {
            "question_id": question_id,
            "question": q_data["question"],
            "difficulty": q_data["difficulty"],
            "question_number": 1,
            "total_questions": MAX_QUESTIONS,
        },
        "message": "Interview started. Good luck!",
    }


async def submit_answer(session_id: str, question_id: str, answer: str) -> dict:
    """Submit an answer and generate next question."""
    db = get_db()
    redis = get_redis()

    # Get session state from Redis
    session = await redis.hgetall(f"session:{session_id}")
    if not session:
        raise ValueError("Interview session not found or expired")

    if session.get("status") != "in_progress":
        raise ValueError("Interview is not in progress")

    # Store answer in Redis
    await redis.hset(f"session:{session_id}:a:{question_id}", mapping={
        "question_id": question_id,
        "answer": answer,
        "submitted_at": utc_now(),
    })
    await redis.rpush(f"session:{session_id}:answers", question_id)
    await redis.expire(f"session:{session_id}:a:{question_id}", SESSION_TTL)
    await redis.expire(f"session:{session_id}:answers", SESSION_TTL)

    question_count = int(session.get("question_count", 1))
    max_questions = int(session.get("max_questions", MAX_QUESTIONS))

    # Check if interview is complete
    if question_count >= max_questions:
        # Mark session as completed
        await redis.hset(f"session:{session_id}", "status", "completed")
        await db[SESSIONS].update_one(
            {"session_id": session_id},
            {"$set": {"status": "completed", "completed_at": utc_now()}},
        )
        return {
            "session_id": session_id,
            "next_question": None,
            "is_complete": True,
            "message": "Interview complete! Generating your report...",
        }

    # Adjust difficulty based on question count
    difficulty = _adjust_difficulty(question_count, session.get("current_difficulty", "medium"))

    # Get previous questions from Redis
    question_ids = await redis.lrange(f"session:{session_id}:questions", 0, -1)
    previous_questions = []
    for qid in question_ids:
        q = await redis.hgetall(f"session:{session_id}:q:{qid}")
        if q:
            previous_questions.append(q.get("question", ""))

    # Get the current question text for context
    current_q = await redis.hgetall(f"session:{session_id}:q:{question_id}")

    skills = json.loads(session.get("skills", "[]"))
    role_title = session.get("role_title", "Software Developer")

    # Generate next question
    next_question_data = await generate_interview_question(
        skills=skills,
        role_title=role_title,
        previous_questions=previous_questions,
        previous_answer=answer,
        difficulty=difficulty,
    )

    new_question_id = generate_id()
    new_count = question_count + 1

    # Store new question in Redis
    q_data = {
        "question_id": new_question_id,
        "question": next_question_data.get("question", "Can you elaborate further?"),
        "difficulty": next_question_data.get("difficulty", difficulty),
        "category": next_question_data.get("category", "general"),
    }
    await redis.hset(f"session:{session_id}:q:{new_question_id}", mapping=q_data)
    await redis.rpush(f"session:{session_id}:questions", new_question_id)
    await redis.expire(f"session:{session_id}:q:{new_question_id}", SESSION_TTL)

    # Update session state
    await redis.hset(f"session:{session_id}", mapping={
        "question_count": str(new_count),
        "current_difficulty": difficulty,
    })

    return {
        "session_id": session_id,
        "next_question": {
            "question_id": new_question_id,
            "question": q_data["question"],
            "difficulty": q_data["difficulty"],
            "question_number": new_count,
            "total_questions": max_questions,
        },
        "is_complete": False,
        "message": f"Question {new_count} of {max_questions}",
    }


def _adjust_difficulty(question_number: int, current: str) -> str:
    """Dynamically adjust difficulty based on progress."""
    if question_number <= 3:
        return "easy"
    elif question_number <= 6:
        return "medium"
    else:
        return "hard"


async def get_session_qa(session_id: str) -> list:
    """Get all Q&A pairs from Redis for a session."""
    redis = get_redis()

    question_ids = await redis.lrange(f"session:{session_id}:questions", 0, -1)
    qa_pairs = []

    for qid in question_ids:
        q = await redis.hgetall(f"session:{session_id}:q:{qid}")
        a = await redis.hgetall(f"session:{session_id}:a:{qid}")
        if q and a:
            qa_pairs.append({
                "question_id": qid,
                "question": q.get("question", ""),
                "answer": a.get("answer", ""),
                "difficulty": q.get("difficulty", "medium"),
                "category": q.get("category", "general"),
            })

    return qa_pairs
