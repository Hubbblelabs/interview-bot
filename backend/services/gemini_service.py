import json
import re

from utils.gemini import call_gemini


def _extract_json_object(text: str) -> str:
    value = (text or "").strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[1]
    if value.endswith("```"):
        value = value.rsplit("```", 1)[0]
    value = value.strip()

    if value.startswith("{") and value.endswith("}"):
        return value

    start = value.find("{")
    end = value.rfind("}")
    if start != -1 and end != -1 and end > start:
        return value[start:end + 1]

    return value


def _extract_json_array(text: str) -> str:
    value = (text or "").strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[1]
    if value.endswith("```"):
        value = value.rsplit("```", 1)[0]
    value = value.strip()

    if value.startswith("[") and value.endswith("]"):
        return value

    start = value.find("[")
    end = value.rfind("]")
    if start != -1 and end != -1 and end > start:
        return value[start:end + 1]

    return value


def _fallback_score(answer: str) -> int:
    text = (answer or "").strip().lower()
    words = len(text.split())
    weak = any(marker in text for marker in ["not sure", "maybe", "i think", "dont know", "don't know"])

    if words < 10:
        return 35
    if words < 25:
        return 55
    if weak:
        return 50
    if words > 80:
        return 75
    return 65


async def generate_resume_seed_questions(
    role_title: str,
    resume_summary: str,
    resume_skills: list[str],
    jd_title: str,
    jd_description: str,
    jd_required_skills: list[str],
    excluded_questions: list[str],
    count: int = 2,
) -> list[dict]:
    count = max(1, int(count or 2))

    payload = {
        "role_title": role_title,
        "resume_summary": resume_summary,
        "resume_skills": resume_skills,
        "jd_title": jd_title,
        "jd_description": jd_description,
        "jd_required_skills": jd_required_skills,
        "excluded_questions": excluded_questions[-25:] if excluded_questions else [],
        "count": count,
    }

    prompt = f"""Generate exactly {count} resume interview questions.

Input JSON:
{json.dumps(payload, ensure_ascii=True)}

Rules:
1) Questions must be strictly from JD required skills and role context.
2) Use resume context for relevance.
3) Do not repeat or paraphrase excluded_questions.
4) Keep questions concise and practical.

Return ONLY valid JSON array with objects:
- question (string)
- difficulty (easy|medium|hard)
- category (string)
"""

    try:
        result = _extract_json_array(
            await call_gemini(
                prompt,
                max_attempts=1,
                request_timeout_seconds=3.5,
            )
        )
        data = json.loads(result)
        if not isinstance(data, list):
            raise ValueError("seed output is not a list")

        output = []
        for item in data[:count]:
            if not isinstance(item, dict):
                item = {}
            output.append(
                {
                    "question": (item.get("question") or "").strip(),
                    "difficulty": item.get("difficulty") if item.get("difficulty") in {"easy", "medium", "hard"} else "medium",
                    "category": item.get("category") or "resume-seed",
                }
            )
        return [q for q in output if q.get("question")]
    except Exception:
        base_skill = jd_required_skills[0] if jd_required_skills else (resume_skills[0] if resume_skills else "this role")
        fallback = []
        for i in range(count):
            fallback.append(
                {
                    "question": (
                        f"Explain your hands-on experience with {base_skill} in a project relevant to {role_title}."
                        if i == 0
                        else f"What trade-offs did you consider when working with {base_skill}?"
                    ),
                    "difficulty": "medium",
                    "category": "resume-seed",
                }
            )
        return fallback


async def evaluate_and_generate_followup(
    role_title: str,
    required_skills: list[str],
    recent_context: list[dict],
    current_question: str,
    current_answer: str,
    excluded_questions: list[str],
) -> dict:
    payload = {
        "role_title": role_title,
        "required_skills": required_skills,
        "recent_context": recent_context[-3:] if recent_context else [],
        "current_question": current_question,
        "current_answer": current_answer,
        "excluded_questions": excluded_questions[-25:] if excluded_questions else [],
    }

    prompt = f"""You are a strict technical interviewer.

Input JSON:
{json.dumps(payload, ensure_ascii=True)}

Task:
1) Evaluate current_answer for current_question.
2) Generate one non-duplicate follow-up question.

Rules:
1) Follow-up must stay within required_skills only.
2) Use recent_context for continuity.
3) Do not repeat/paraphrase excluded_questions.
4) Score should reflect conceptual correctness, not verbosity.

Return ONLY valid JSON object:
{{
  "score": 0-100,
  "feedback": "short technical feedback",
  "followup_question": "...",
  "difficulty": "easy|medium|hard",
  "category": "..."
}}
"""

    try:
        result = _extract_json_object(
            await call_gemini(
                prompt,
                max_attempts=1,
                request_timeout_seconds=2.8,
            )
        )
        data = json.loads(result)
        followup = (data.get("followup_question") or "").strip()
        return {
            "score": int(data.get("score", 0)),
            "feedback": (data.get("feedback") or "").strip() or "Answer reviewed.",
            "followup_question": followup,
            "difficulty": data.get("difficulty") if data.get("difficulty") in {"easy", "medium", "hard"} else "medium",
            "category": data.get("category") or "follow-up",
        }
    except Exception:
        fallback_skill = required_skills[0] if required_skills else "the selected role requirement"
        return {
            "score": _fallback_score(current_answer),
            "feedback": "Try to explain the mechanism, trade-offs, and one concrete example.",
            "followup_question": f"Can you walk me through a real scenario where you applied {fallback_skill} and what trade-offs you handled?",
            "difficulty": "medium",
            "category": "follow-up",
        }


async def generate_topic_followup_batch(
    topic_name: str,
    qa_pairs: list[dict],
    excluded_questions: list[str],
    count: int = 3,
) -> list[dict]:
    count = max(1, int(count or 3))

    payload = {
        "topic": topic_name,
        "qa_pairs": qa_pairs,
        "excluded_questions": excluded_questions[-30:] if excluded_questions else [],
        "count": count,
    }

    prompt = f"""Generate exactly {count} topic-focused technical follow-up questions.

Input JSON:
{json.dumps(payload, ensure_ascii=True)}

Rules:
1) Stay in topic scope only.
2) Build on candidate weak points from qa_pairs.
3) Do not repeat/paraphrase excluded_questions.

Return ONLY valid JSON array with objects:
- question (string)
- difficulty (easy|medium|hard)
- category (string)
"""

    try:
        result = _extract_json_array(
            await call_gemini(
                prompt,
                max_attempts=1,
                request_timeout_seconds=3.5,
            )
        )
        data = json.loads(result)
        if not isinstance(data, list):
            raise ValueError("topic output is not a list")

        out = []
        for item in data[:count]:
            if not isinstance(item, dict):
                item = {}
            text = (item.get("question") or "").strip()
            if not text:
                continue
            out.append(
                {
                    "question": text,
                    "difficulty": item.get("difficulty") if item.get("difficulty") in {"easy", "medium", "hard"} else "medium",
                    "category": item.get("category") or topic_name,
                }
            )
        return out
    except Exception:
        fallback = []
        for i in range(count):
            fallback.append(
                {
                    "question": f"In {topic_name}, explain how you would solve a real production issue and why.",
                    "difficulty": "medium" if i < 2 else "hard",
                    "category": topic_name,
                }
            )
        return fallback
