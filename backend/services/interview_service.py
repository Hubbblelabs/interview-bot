import json
import asyncio
from bson import ObjectId
from database import get_db, get_redis
from models.collections import SESSIONS, JOB_ROLES, SKILLS, QUESTIONS, TOPICS, TOPIC_QUESTIONS, ROLE_REQUIREMENTS
from utils.helpers import generate_id, utc_now, str_objectid
from utils.skills import normalize_skill_list, find_matching_skills, find_missing_skills, build_interview_focus_skills
from services.interview_graph import run_interview_graph
from utils.gemini import generate_interview_question_batch

MAX_QUESTIONS = 20
SESSION_TTL = 7200  # 2 hours
BATCH_SIZE = 5
PREGEN_MIN_PENDING = 2
FOLLOWUP_AI_COUNT = 3
FOLLOWUP_BANK_COUNT = 2

# Local process memory summary requested in workflow.
_LOCAL_SUMMARIES: dict[str, str] = {}
_PREGEN_IN_FLIGHT: set[str] = set()


def _safe_json_list(value: str) -> list:
    try:
        data = json.loads(value or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _update_local_summary(session_id: str, question: str, answer: str) -> None:
    existing = _LOCAL_SUMMARIES.get(session_id, "")
    combined = f"{existing}\nQ: {question}\nA: {answer}".strip()
    # Keep summary bounded in memory.
    _LOCAL_SUMMARIES[session_id] = combined[-1500:]


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _avg_recent_answer_words(qa_pairs: list, window: int = 3) -> int:
    if not qa_pairs:
        return 0
    recent = qa_pairs[-window:]
    lengths = [len((item.get("answer") or "").split()) for item in recent]
    if not lengths:
        return 0
    return sum(lengths) // len(lengths)


def _plan_followup_mix(target: int, qa_pairs: list, has_bank_source: bool) -> tuple[int, int]:
    """Decide AI-vs-bank split for the next batch.

    Baseline: 3 AI + 2 bank. Adaptation:
    - Short answers -> increase bank ratio for stability.
    - Rich answers -> increase AI follow-up ratio for personalization.
    """
    if target <= 0:
        return 0, 0
    if not has_bank_source:
        return target, 0

    avg_words = _avg_recent_answer_words(qa_pairs)

    ai_target = min(FOLLOWUP_AI_COUNT, target)
    if avg_words < 18:
        ai_target = min(2, target)
    elif avg_words > 70:
        ai_target = min(4, target)

    # Keep at least one bank question when a bank source exists and batch size allows.
    if target > 1:
        ai_target = min(ai_target, target - 1)

    bank_target = target - ai_target
    return ai_target, bank_target


async def _get_generated_question_texts(redis, session_id: str) -> list[str]:
    qids = await redis.lrange(f"session:{session_id}:questions", 0, -1)
    questions = []
    for qid in qids:
        q = await redis.hgetall(f"session:{session_id}:q:{qid}")
        if q and q.get("question"):
            questions.append(q["question"])
    return questions


async def _generate_question_batch(
    role_title: str,
    skills: list[str],
    previous_questions: list[str],
    generated_count: int,
    max_questions: int,
    current_difficulty: str,
    local_summary: str | None,
    batch_size: int,
) -> tuple[list[dict], str]:
    remaining = max(0, max_questions - generated_count)
    target = min(batch_size, remaining)
    if target <= 0:
        return [], current_difficulty

    # Initial resume seed: generate the full first batch in one Gemini call.
    if generated_count == 0 and target > 1 and not local_summary:
        seeded = await generate_interview_question_batch(
            skills=skills,
            role_title=role_title,
            count=target,
            start_question_number=1,
            previous_questions=previous_questions,
        )
        if seeded:
            last = seeded[-1].get("difficulty", current_difficulty)
            return seeded, last

    generated: list[dict] = []
    rolling_questions = list(previous_questions)
    rolling_difficulty = current_difficulty
    rolling_count = generated_count

    for i in range(target):
        state = {
            "role_title": role_title,
            "skills": skills,
            "previous_questions": rolling_questions,
            # Feed the local summary once per batch as extra context.
            "previous_answer": local_summary if i == 0 else None,
            "question_count": rolling_count,
            "max_questions": max_questions,
            "current_difficulty": rolling_difficulty,
        }
        graph_result = await run_interview_graph(state)
        q_data = graph_result.get("question_data", {})
        difficulty = q_data.get("difficulty", graph_result.get("current_difficulty", "medium"))
        generated.append(
            {
                "question": q_data.get("question", "Can you explain your approach?"),
                "difficulty": difficulty,
                "category": q_data.get("category", "general"),
            }
        )
        rolling_questions.append(generated[-1]["question"])
        rolling_count += 1
        rolling_difficulty = difficulty

    return generated, rolling_difficulty


async def _append_batch_to_redis(redis, session_id: str, batch: list[dict]) -> list[str]:
    created_ids: list[str] = []
    for item in batch:
        qid = generate_id()
        created_ids.append(qid)
        await redis.hset(
            f"session:{session_id}:q:{qid}",
            mapping={
                "question_id": qid,
                "question": item.get("question", "Can you explain your approach?"),
                "difficulty": item.get("difficulty", "medium"),
                "category": item.get("category", "general"),
            },
        )
        await redis.rpush(f"session:{session_id}:questions", qid)
        await redis.expire(f"session:{session_id}:q:{qid}", SESSION_TTL)
    if created_ids:
        await redis.expire(f"session:{session_id}:questions", SESSION_TTL)
    return created_ids


async def _fetch_question_bank_batch(
    db,
    role_id: str | None,
    excluded_questions: list[str],
    limit: int,
) -> list[dict]:
    if not role_id or limit <= 0:
        return []

    role_candidates = [role_id]
    try:
        oid = ObjectId(role_id)
        role_candidates.append(str(oid))
        role_candidates.append(oid)
    except Exception:
        pass

    query = {"role_id": {"$in": role_candidates}}

    excluded = {q.strip().lower() for q in excluded_questions if q}
    cursor = db[QUESTIONS].find(query).limit(200)
    selected: list[dict] = []

    async for q in cursor:
        text = (q.get("question") or "").strip()
        if not text:
            continue
        if text.lower() in excluded:
            continue
        selected.append(
            {
                "question": text,
                "difficulty": (q.get("difficulty") or "medium").lower(),
                "category": q.get("category") or "question-bank",
            }
        )
        excluded.add(text.lower())
        if len(selected) >= limit:
            break

    return selected


async def _generate_mixed_followup_batch(
    db,
    redis,
    session_id: str,
    session: dict,
    generated_count: int,
    max_questions: int,
) -> tuple[list[dict], str, dict]:
    remaining = max(0, max_questions - generated_count)
    target = min(BATCH_SIZE, remaining)
    if target <= 0:
        return [], session.get("current_difficulty", "medium"), {
            "gemini_calls": 0,
            "gemini_questions": 0,
            "bank_questions": 0,
            "bank_shortfall": 0,
        }

    previous_questions = await _get_generated_question_texts(redis, session_id)
    qa_pairs = await get_session_qa(session_id)
    role_title = session.get("role_title", "Software Developer")
    skills = _safe_json_list(session.get("skills", "[]"))
    current_difficulty = session.get("current_difficulty", "medium")

    ai_target, bank_target = _plan_followup_mix(
        target=target,
        qa_pairs=qa_pairs,
        has_bank_source=bool(session.get("role_id")),
    )

    from utils.gemini import generate_followup_question_batch_from_qa

    gemini_calls = 0
    gemini_questions = 0

    ai_items = await generate_followup_question_batch_from_qa(
        role_title=role_title,
        skills=skills,
        qa_pairs=qa_pairs,
        previous_questions=previous_questions,
        count=ai_target,
        difficulty=current_difficulty,
    )
    if ai_target > 0:
        gemini_calls += 1
    gemini_questions += len(ai_items)

    exclude_pool = list(previous_questions) + [i.get("question", "") for i in ai_items]
    bank_items = await _fetch_question_bank_batch(
        db=db,
        role_id=session.get("role_id"),
        excluded_questions=exclude_pool,
        limit=bank_target,
    )

    if len(bank_items) < bank_target:
        refill = bank_target - len(bank_items)
        refill_ai = await generate_followup_question_batch_from_qa(
            role_title=role_title,
            skills=skills,
            qa_pairs=qa_pairs,
            previous_questions=exclude_pool + [i.get("question", "") for i in bank_items],
            count=refill,
            difficulty=current_difficulty,
        )
        ai_items.extend(refill_ai)
        if refill > 0:
            gemini_calls += 1
        gemini_questions += len(refill_ai)

    mixed = (ai_items + bank_items)[:target]
    last_difficulty = mixed[-1].get("difficulty", current_difficulty) if mixed else current_difficulty
    return mixed, last_difficulty, {
        "gemini_calls": gemini_calls,
        "gemini_questions": gemini_questions,
        "bank_questions": len(bank_items),
        "bank_shortfall": max(0, bank_target - len(bank_items)),
    }


async def _start_topic_interview(user_id: str, topic_id: str) -> dict:
    """Start a topic-wise interview with admin-created questions."""
    db = get_db()
    redis = get_redis()

    topic = await db[TOPICS].find_one({"_id": __import__("bson").ObjectId(topic_id)})
    if not topic:
        raise ValueError("Topic not found")
    if not topic.get("is_published", False):
        raise ValueError("This topic interview is not published yet")

    topic_questions = await db[TOPIC_QUESTIONS].find({"topic_id": topic_id}).sort("created_at", -1).to_list(length=200)
    if not topic_questions:
        raise ValueError("No questions found for selected topic")

    timer_enabled = bool(topic.get("timer_enabled", False))
    timer_seconds = topic.get("timer_seconds") if timer_enabled else None

    total_questions = min(MAX_QUESTIONS, len(topic_questions))
    selected = topic_questions[:total_questions]

    session_id = generate_id()
    _LOCAL_SUMMARIES[session_id] = ""

    session_doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role_id": None,
        "role_title": topic.get("name", "Topic Interview"),
        "topic_id": topic_id,
        "interview_type": "topic",
        "status": "in_progress",
        "question_count": 1,
        "max_questions": total_questions,
        "current_difficulty": selected[0].get("difficulty", "medium"),
        "metrics_gemini_calls": 0,
        "metrics_gemini_questions": 0,
        "metrics_bank_questions": 0,
        "metrics_bank_shortfall": 0,
        "metrics_generation_batches": 0,
        "timer_enabled": timer_enabled,
        "timer_seconds": timer_seconds,
        "started_at": utc_now(),
    }
    await db[SESSIONS].insert_one(session_doc)

    session_state = {
        "user_id": user_id,
        "role_title": topic.get("name", "Topic Interview"),
        "topic_id": topic_id,
        "interview_type": "topic",
        "skills": json.dumps([topic.get("name", "general")]),
        "user_skills": json.dumps([]),
        "required_skills": json.dumps([]),
        "matched_skills": json.dumps([]),
        "missing_skills": json.dumps([]),
        "question_count": 1,
        "answered_count": 0,
        "served_count": 1,
        "generated_count": total_questions,
        "max_questions": total_questions,
        "current_difficulty": selected[0].get("difficulty", "medium"),
        "timer_enabled": str(timer_enabled),
        "timer_seconds": str(timer_seconds or ""),
        "status": "in_progress",
        "metrics_gemini_calls": 0,
        "metrics_gemini_questions": 0,
        "metrics_bank_questions": 0,
        "metrics_bank_shortfall": 0,
        "metrics_generation_batches": 0,
    }
    await redis.hset(f"session:{session_id}", mapping=session_state)
    await redis.expire(f"session:{session_id}", SESSION_TTL)

    created_ids = []
    for q in selected:
        qid = generate_id()
        created_ids.append(qid)
        await redis.hset(
            f"session:{session_id}:q:{qid}",
            mapping={
                "question_id": qid,
                "question": q.get("question", "Can you explain this concept?"),
                "difficulty": q.get("difficulty", "medium"),
                "category": q.get("category", topic.get("name", "topic")),
            },
        )
        await redis.rpush(f"session:{session_id}:questions", qid)
        await redis.expire(f"session:{session_id}:q:{qid}", SESSION_TTL)
    await redis.expire(f"session:{session_id}:questions", SESSION_TTL)

    first_id = created_ids[0]
    pending_ids = created_ids[1:]
    if pending_ids:
        await redis.rpush(f"session:{session_id}:pending_questions", *pending_ids)
        await redis.expire(f"session:{session_id}:pending_questions", SESSION_TTL)

    first_q_data = await redis.hgetall(f"session:{session_id}:q:{first_id}")
    return {
        "session_id": session_id,
        "interview_type": "topic",
        "topic": {
            "topic_id": topic_id,
            "name": topic.get("name", "Topic Interview"),
            "description": topic.get("description", ""),
        },
        "skill_alignment": {
            "user_skills": [],
            "required_skills": [topic.get("name", "")],
            "matched_skills": [],
            "missing_skills": [],
            "interview_focus": [topic.get("name", "")],
        },
        "question": {
            "question_id": first_id,
            "question": first_q_data.get("question", "Can you explain this concept?"),
            "difficulty": first_q_data.get("difficulty", "medium"),
            "question_number": 1,
            "total_questions": total_questions,
        },
        "timer": {
            "enabled": timer_enabled,
            "seconds": timer_seconds,
        },
        "message": "Topic interview started. Good luck!",
    }


async def _async_pregenerate_next_batch(session_id: str) -> None:
    redis = get_redis()
    try:
        session = await redis.hgetall(f"session:{session_id}")
        if not session or session.get("status") != "in_progress":
            return

        pending_len = await redis.llen(f"session:{session_id}:pending_questions")
        generated_count = int(session.get("generated_count", 0))
        max_questions = int(session.get("max_questions", MAX_QUESTIONS))

        if pending_len >= PREGEN_MIN_PENDING or generated_count >= max_questions:
            return

        previous_questions = await _get_generated_question_texts(redis, session_id)
        skills = _safe_json_list(session.get("skills", "[]"))
        role_title = session.get("role_title", "Software Developer")
        current_difficulty = session.get("current_difficulty", "medium")
        local_summary = _LOCAL_SUMMARIES.get(session_id)

        batch, last_difficulty = await _generate_question_batch(
            role_title=role_title,
            skills=skills,
            previous_questions=previous_questions,
            generated_count=generated_count,
            max_questions=max_questions,
            current_difficulty=current_difficulty,
            local_summary=local_summary,
            batch_size=BATCH_SIZE,
        )
        if not batch:
            return

        new_ids = await _append_batch_to_redis(redis, session_id, batch)
        if new_ids:
            await redis.rpush(f"session:{session_id}:pending_questions", *new_ids)
            await redis.expire(f"session:{session_id}:pending_questions", SESSION_TTL)
            await redis.hset(
                f"session:{session_id}",
                mapping={
                    "generated_count": str(generated_count + len(new_ids)),
                    "current_difficulty": last_difficulty,
                },
            )
    finally:
        _PREGEN_IN_FLIGHT.discard(session_id)


def _schedule_pregen(session_id: str, answered_count: int) -> None:
    # Start pre-generation after user answers Q1 and Q2, then keep it topped up.
    if answered_count < 2:
        return
    if session_id in _PREGEN_IN_FLIGHT:
        return
    _PREGEN_IN_FLIGHT.add(session_id)
    asyncio.create_task(_async_pregenerate_next_batch(session_id))


async def start_interview(
    user_id: str,
    role_id: str = None,
    custom_role: str = None,
    interview_type: str = "resume",
    topic_id: str = None,
) -> dict:
    """Start a new interview session."""
    interview_type = (interview_type or "resume").strip().lower()
    if interview_type == "topic":
        if not topic_id:
            raise ValueError("topic_id is required for topic interviews")
        return await _start_topic_interview(user_id=user_id, topic_id=topic_id)

    db = get_db()
    redis = get_redis()

    # Get user skills
    skills_doc = await db[SKILLS].find_one({"user_id": user_id})
    user_skills = skills_doc.get("skills", ["general"]) if skills_doc else ["general"]
    user_skills = normalize_skill_list(user_skills)

    # Get role
    role_title = "Software Developer"
    if custom_role:
        role_title = custom_role
    elif role_id:
        from bson import ObjectId
        try:
            role = await db[JOB_ROLES].find_one({"_id": ObjectId(role_id)})
            if role:
                role_title = role["title"]
        except Exception:
            # If it's not a valid ObjectId, assume it's a raw generic title passed from frontend
            role_title = role_id

    # Compare role requirements with user skills when admin role requirements exist.
    required_skills = []
    if role_id and not custom_role:
        req_cursor = db[ROLE_REQUIREMENTS].find({"role_id": role_id})
        req_docs = await req_cursor.to_list(length=100)
        required_skills = [d.get("skill", "") for d in req_docs if d.get("skill")]

    matched_role_skills = find_matching_skills(user_skills, required_skills)
    missing_role_skills = find_missing_skills(user_skills, required_skills)

    # Prioritize matched required skills and compress them into cluster-aware focus areas.
    base_skills_for_interview = matched_role_skills if matched_role_skills else user_skills
    skills_for_interview = build_interview_focus_skills(base_skills_for_interview)
    if not skills_for_interview:
        skills_for_interview = ["general"]

    # Workflow: generate first batch upfront, store in Redis, serve Q1.
    initial_batch, last_difficulty = await _generate_question_batch(
        role_title=role_title,
        skills=skills_for_interview,
        previous_questions=[],
        generated_count=0,
        max_questions=MAX_QUESTIONS,
        current_difficulty="medium",
        local_summary=None,
        batch_size=BATCH_SIZE,
    )
    if not initial_batch:
        raise ValueError("Failed to generate initial interview questions")

    session_id = generate_id()
    _LOCAL_SUMMARIES[session_id] = ""

    # Create session in MongoDB
    session_doc = {
        "session_id": session_id,
        "user_id": user_id,
        "role_id": role_id,
        "role_title": role_title,
        "status": "in_progress",
        "interview_type": "resume",
        "question_count": 1,
        "max_questions": MAX_QUESTIONS,
        "current_difficulty": initial_batch[0].get("difficulty", "medium"),
        "metrics_gemini_calls": 1,
        "metrics_gemini_questions": len(initial_batch),
        "metrics_bank_questions": 0,
        "metrics_bank_shortfall": 0,
        "metrics_generation_batches": 1,
        "started_at": utc_now(),
    }
    await db[SESSIONS].insert_one(session_doc)

    # Store session state in Redis
    session_state = {
        "user_id": user_id,
        "role_id": role_id or "",
        "role_title": role_title,
        "skills": json.dumps(skills_for_interview),
        "user_skills": json.dumps(user_skills),
        "required_skills": json.dumps(normalize_skill_list(required_skills)),
        "matched_skills": json.dumps(matched_role_skills),
        "missing_skills": json.dumps(missing_role_skills),
        "question_count": 1,
        "answered_count": 0,
        "served_count": 1,
        "generated_count": len(initial_batch),
        "max_questions": MAX_QUESTIONS,
        "current_difficulty": last_difficulty,
        "interview_type": "resume",
        "status": "in_progress",
        "metrics_gemini_calls": 1,
        "metrics_gemini_questions": len(initial_batch),
        "metrics_bank_questions": 0,
        "metrics_bank_shortfall": 0,
        "metrics_generation_batches": 1,
    }
    await redis.hset(f"session:{session_id}", mapping=session_state)
    await redis.expire(f"session:{session_id}", SESSION_TTL)

    # Store batch in Redis and queue remaining for later serving.
    new_ids = await _append_batch_to_redis(redis, session_id, initial_batch)
    first_id = new_ids[0]
    pending_ids = new_ids[1:]
    if pending_ids:
        await redis.rpush(f"session:{session_id}:pending_questions", *pending_ids)
        await redis.expire(f"session:{session_id}:pending_questions", SESSION_TTL)

    first_q_data = await redis.hgetall(f"session:{session_id}:q:{first_id}")

    return {
        "session_id": session_id,
        "skill_alignment": {
            "user_skills": user_skills,
            "required_skills": normalize_skill_list(required_skills),
            "matched_skills": matched_role_skills,
            "missing_skills": missing_role_skills,
            "interview_focus": skills_for_interview,
        },
        "question": {
            "question_id": first_id,
            "question": first_q_data.get("question", "Tell me about yourself."),
            "difficulty": first_q_data.get("difficulty", "medium"),
            "question_number": 1,
            "total_questions": MAX_QUESTIONS,
        },
        "timer": {
            "enabled": False,
            "seconds": None,
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
    answered_count = int(session.get("answered_count", 0)) + 1
    served_count = int(session.get("served_count", 1))
    generated_count = int(session.get("generated_count", 0))
    max_questions = int(session.get("max_questions", MAX_QUESTIONS))
    interview_type = session.get("interview_type", "resume")

    # Update local summary in-memory (requested local summary step).
    current_q = await redis.hgetall(f"session:{session_id}:q:{question_id}")
    _update_local_summary(session_id, current_q.get("question", ""), answer)

    # Check if interview is complete
    if answered_count >= max_questions:
        # Mark session as completed
        await redis.hset(
            f"session:{session_id}",
            mapping={"status": "completed", "answered_count": str(answered_count)},
        )
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

    # Serve from pending queue first.
    next_question_id = await redis.lpop(f"session:{session_id}:pending_questions")
    metrics_delta = {
        "gemini_calls": 0,
        "gemini_questions": 0,
        "bank_questions": 0,
        "bank_shortfall": 0,
        "generation_batches": 0,
    }

    # If queue is empty, generate only for resume interviews.
    if not next_question_id:
        if interview_type == "topic":
            await redis.hset(
                f"session:{session_id}",
                mapping={"status": "completed", "answered_count": str(answered_count)},
            )
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

        sync_batch, last_difficulty, batch_metrics = await _generate_mixed_followup_batch(
            db=db,
            redis=redis,
            session_id=session_id,
            session=session,
            generated_count=generated_count,
            max_questions=max_questions,
        )
        new_ids = await _append_batch_to_redis(redis, session_id, sync_batch)
        generated_count += len(new_ids)
        if new_ids:
            next_question_id = new_ids[0]
            if len(new_ids) > 1:
                await redis.rpush(f"session:{session_id}:pending_questions", *new_ids[1:])
                await redis.expire(f"session:{session_id}:pending_questions", SESSION_TTL)
            await redis.hset(
                f"session:{session_id}",
                mapping={
                    "generated_count": str(generated_count),
                    "current_difficulty": last_difficulty,
                    "metrics_gemini_calls": str(_safe_int(session.get("metrics_gemini_calls", 0)) + batch_metrics.get("gemini_calls", 0)),
                    "metrics_gemini_questions": str(_safe_int(session.get("metrics_gemini_questions", 0)) + batch_metrics.get("gemini_questions", 0)),
                    "metrics_bank_questions": str(_safe_int(session.get("metrics_bank_questions", 0)) + batch_metrics.get("bank_questions", 0)),
                    "metrics_bank_shortfall": str(_safe_int(session.get("metrics_bank_shortfall", 0)) + batch_metrics.get("bank_shortfall", 0)),
                    "metrics_generation_batches": str(_safe_int(session.get("metrics_generation_batches", 0)) + 1),
                },
            )
            await db[SESSIONS].update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "metrics_gemini_calls": _safe_int(session.get("metrics_gemini_calls", 0)) + batch_metrics.get("gemini_calls", 0),
                        "metrics_gemini_questions": _safe_int(session.get("metrics_gemini_questions", 0)) + batch_metrics.get("gemini_questions", 0),
                        "metrics_bank_questions": _safe_int(session.get("metrics_bank_questions", 0)) + batch_metrics.get("bank_questions", 0),
                        "metrics_bank_shortfall": _safe_int(session.get("metrics_bank_shortfall", 0)) + batch_metrics.get("bank_shortfall", 0),
                        "metrics_generation_batches": _safe_int(session.get("metrics_generation_batches", 0)) + 1,
                    }
                },
            )
            metrics_delta = {
                "gemini_calls": batch_metrics.get("gemini_calls", 0),
                "gemini_questions": batch_metrics.get("gemini_questions", 0),
                "bank_questions": batch_metrics.get("bank_questions", 0),
                "bank_shortfall": batch_metrics.get("bank_shortfall", 0),
                "generation_batches": 1,
            }
            print(
                f"[interview-metrics] session={session_id} "
                f"batch_size={len(new_ids)} gemini_calls+={batch_metrics.get('gemini_calls', 0)} "
                f"gemini_questions+={batch_metrics.get('gemini_questions', 0)} "
                f"bank_questions+={batch_metrics.get('bank_questions', 0)} "
                f"bank_shortfall+={batch_metrics.get('bank_shortfall', 0)}"
            )

    if not next_question_id:
        raise ValueError("Unable to fetch or generate next question")

    q_data = await redis.hgetall(f"session:{session_id}:q:{next_question_id}")
    next_difficulty = q_data.get("difficulty", session.get("current_difficulty", "medium"))
    new_count = question_count + 1
    new_served_count = served_count + 1

    # Update session state
    await redis.hset(f"session:{session_id}", mapping={
        "question_count": str(new_count),
        "answered_count": str(answered_count),
        "served_count": str(new_served_count),
        "current_difficulty": next_difficulty,
    })

    effective_stats = {
        "gemini_calls": _safe_int(session.get("metrics_gemini_calls", 0)) + metrics_delta["gemini_calls"],
        "gemini_questions": _safe_int(session.get("metrics_gemini_questions", 0)) + metrics_delta["gemini_questions"],
        "bank_questions": _safe_int(session.get("metrics_bank_questions", 0)) + metrics_delta["bank_questions"],
        "bank_shortfall": _safe_int(session.get("metrics_bank_shortfall", 0)) + metrics_delta["bank_shortfall"],
        "generation_batches": _safe_int(session.get("metrics_generation_batches", 0)) + metrics_delta["generation_batches"],
    }

    return {
        "session_id": session_id,
        "next_question": {
            "question_id": next_question_id,
            "question": q_data.get("question", "Can you elaborate further?"),
            "difficulty": q_data.get("difficulty", "medium"),
            "question_number": new_served_count,
            "total_questions": max_questions,
        },
        "is_complete": False,
        "message": f"Question {new_served_count} of {max_questions}",
        "generation_stats": effective_stats,
    }


async def quit_interview(session_id: str, user_id: str) -> dict:
    """Mark an interview as quit and indicate whether a partial report can be generated."""
    db = get_db()
    redis = get_redis()

    session = await db[SESSIONS].find_one({"session_id": session_id})
    if not session:
        raise ValueError("Session not found")
    if session.get("user_id") != user_id:
        raise ValueError("Unauthorized access to session")

    if session.get("status") in {"completed", "quit", "quit_with_report"}:
        return {
            "session_id": session_id,
            "report_generated": session.get("status") == "quit_with_report",
            "message": "Interview already finalized",
        }

    quit_at = utc_now()

    # Update Redis state if still present.
    redis_session_key = f"session:{session_id}"
    redis_session = await redis.hgetall(redis_session_key)
    answered_count = int(redis_session.get("answered_count", 0)) if redis_session else 0
    if redis_session:
        await redis.hset(
            redis_session_key,
            mapping={
                "status": "quit",
                "quit_at": quit_at,
            },
        )
        await redis.expire(redis_session_key, SESSION_TTL)

    # Persist quit metadata for admin visibility.
    await db[SESSIONS].update_one(
        {"session_id": session_id},
        {
            "$set": {
                "status": "quit",
                "quit_at": quit_at,
                "quit_reason": "user_requested",
                "answered_count": answered_count,
            }
        },
    )

    has_answers = answered_count > 0
    return {
        "session_id": session_id,
        "report_generated": has_answers,
        "message": "Interview quit successfully" if has_answers else "Interview quit. No answers to evaluate yet.",
    }


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


def cleanup_interview_local_state(session_id: str) -> None:
    """Cleanup process-local state for a completed session."""
    _LOCAL_SUMMARIES.pop(session_id, None)
    _PREGEN_IN_FLIGHT.discard(session_id)
