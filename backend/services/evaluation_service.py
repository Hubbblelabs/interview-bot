from database import get_db, get_redis
from models.collections import RESULTS, ANSWERS, SESSIONS
from utils.helpers import utc_now
from utils.gemini import evaluate_interview
from services.interview_service import get_session_qa


async def generate_report(session_id: str, user_id: str) -> dict:
    """Generate final evaluation report from Redis Q&A data using Gemini."""
    db = get_db()
    redis = get_redis()

    # Check if report already exists
    existing = await db[RESULTS].find_one({"session_id": session_id})
    if existing:
        existing["id"] = str(existing["_id"])
        del existing["_id"]
        return existing

    # Get session info
    session = await db[SESSIONS].find_one({"session_id": session_id})
    if not session:
        raise ValueError("Session not found")

    if session.get("user_id") != user_id:
        raise ValueError("Unauthorized access to session")

    role_title = session.get("role_title", "Software Developer")

    # Get all Q&A from Redis
    qa_pairs = await get_session_qa(session_id)
    if not qa_pairs:
        raise ValueError("No Q&A data found for this session")

    # Batch evaluate with Gemini
    evaluation = await evaluate_interview(qa_pairs, role_title)

    # Store results in MongoDB
    result_doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role_title": role_title,
        "overall_score": evaluation.get("overall_score", 0),
        "total_questions": len(qa_pairs),
        "detailed_scores": evaluation.get("detailed_scores", []),
        "strengths": evaluation.get("strengths", []),
        "weaknesses": evaluation.get("weaknesses", []),
        "recommendations": evaluation.get("recommendations", []),
        "completed_at": utc_now(),
    }
    await db[RESULTS].insert_one(result_doc)

    # Store final answers in MongoDB
    for qa in qa_pairs:
        answer_doc = {
            "session_id": session_id,
            "user_id": user_id,
            "question_id": qa["question_id"],
            "question": qa["question"],
            "answer": qa["answer"],
            "difficulty": qa["difficulty"],
            "category": qa["category"],
            "stored_at": utc_now(),
        }
        await db[ANSWERS].insert_one(answer_doc)

    # Clean up Redis session data
    question_ids = await redis.lrange(f"session:{session_id}:questions", 0, -1)
    keys_to_delete = [
        f"session:{session_id}",
        f"session:{session_id}:questions",
        f"session:{session_id}:answers",
    ]
    for qid in question_ids:
        keys_to_delete.append(f"session:{session_id}:q:{qid}")
        keys_to_delete.append(f"session:{session_id}:a:{qid}")

    if keys_to_delete:
        await redis.delete(*keys_to_delete)

    result_doc["id"] = str(result_doc["_id"])
    del result_doc["_id"]
    return result_doc
