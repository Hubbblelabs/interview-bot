from google import genai
from config import get_settings
from utils.skills import normalize_skill_list
import asyncio
import json
import re
from langchain_core.prompts import PromptTemplate

settings = get_settings()

client = genai.Client(api_key=settings.GEMINI_API_KEY)


def _is_transient_gemini_error(error: Exception) -> bool:
    message = str(error or "").lower()
    transient_markers = [
        "503",
        "unavailable",
        "resource_exhausted",
        "high demand",
        "deadline",
        "timed out",
        "timeout",
    ]
    return any(marker in message for marker in transient_markers)


async def call_gemini(prompt: str, system_instruction: str = None) -> str:
    """Call Gemini API with a prompt and optional system instruction."""
    config = {}
    if system_instruction:
        config["system_instruction"] = system_instruction
    config["response_mime_type"] = "application/json"

    last_error = None
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=config if config else None,
            )
            return (response.text or "").strip()
        except Exception as exc:
            last_error = exc
            if _is_transient_gemini_error(exc) and attempt < max_attempts - 1:
                await asyncio.sleep(0.8 * (attempt + 1))
                continue
            break

    raise RuntimeError(f"Gemini request failed: {last_error}")


def _extract_json_object(text: str) -> str:
    value = (text or "").strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[1]
    if value.endswith("```"):
        value = value.rsplit("```", 1)[0]
    value = value.strip()

    if value.startswith("{") and value.endswith("}"):
        return value

    # Fallback when model wraps JSON with extra text.
    start = value.find("{")
    end = value.rfind("}")
    if start != -1 and end != -1 and end > start:
        return value[start:end + 1]

    return value


def _fallback_skill_scan(resume_text: str) -> list:
    common = [
        "python", "java", "javascript", "typescript", "react", "next.js", "node.js",
        "fastapi", "django", "flask", "spring", "mongodb", "postgresql", "mysql",
        "redis", "docker", "kubernetes", "aws", "gcp", "azure", "git", "linux",
        "rest api", "graphql", "machine learning", "data analysis", "sql",
    ]
    text = (resume_text or "").lower()
    found = []
    for skill in common:
        pattern = r"\b" + re.escape(skill.lower()) + r"\b"
        if re.search(pattern, text):
            found.append(skill)
    return normalize_skill_list(found)


def _is_loose_answer(answer: str) -> bool:
    text = (answer or "").strip().lower()
    if not text:
        return True

    word_count = len(text.split())
    if word_count < 18:
        return True

    weak_markers = [
        "i think",
        "maybe",
        "not sure",
        "dont know",
        "don't know",
        "something like",
        "etc",
        "kind of",
        "sort of",
    ]
    return any(marker in text for marker in weak_markers)


def _collect_loose_qa(qa_pairs: list, limit: int = 4) -> list:
    loose = []
    for qa in reversed(qa_pairs or []):
        question = (qa or {}).get("question", "")
        answer = (qa or {}).get("answer", "")
        if not question or not answer:
            continue
        if _is_loose_answer(answer):
            loose.append({"question": question, "answer": answer})
        if len(loose) >= limit:
            break
    loose.reverse()
    return loose


async def parse_resume_with_gemini(resume_text: str) -> dict:
    """Parse resume text and extract structured data using Gemini."""
    prompt = f"""Analyze the following resume and extract structured information.
CRITICAL INSTRUCTION FOR SKILLS:
1) Extract concrete tools/technologies/frameworks/languages from the resume text.
2) Exclude vague traits such as "hardworking", "leadership", "problem solving", "communication".
3) If a line contains multiple skills (comma-separated), split them into separate list items.
4) Do NOT add skills that are not present in the resume.

Return a JSON object with these exact fields:
- "name": full name of the candidate (string or null)
- "email": candidate's email address (string or null)
- "phone": candidate's phone number (string or null)
- "location": candidate's location/address (string or null)
- "skills": list of technical and soft skills verbatim from the text (array of strings)
- "recommended_roles": list of 3-5 recommended job role titles the user is qualified for based on these skills (array of strings)
- "experience_summary": brief summary of work experience (string)
- "experience": list of dictionaries, each with "company", "role", "duration", and "description"
- "education": list of dictionaries, each with "institution", "degree", "graduation_year"
- "projects": list of dictionaries, each with "name" and "description"

Resume text:
---
{resume_text}
---

Return ONLY valid JSON, no markdown formatting."""

    try:
        result = await call_gemini(prompt)
        result = _extract_json_object(result)
    except Exception:
        return {
            "name": None,
            "email": None,
            "phone": None,
            "location": None,
            "skills": _fallback_skill_scan(resume_text),
            "recommended_roles": [],
            "experience_summary": "Unable to parse with AI right now. Please retry.",
            "experience": [],
            "education": [],
            "projects": [],
        }

    try:
        parsed = json.loads(result)
        parsed.setdefault("name", None)
        parsed.setdefault("email", None)
        parsed.setdefault("phone", None)
        parsed.setdefault("location", None)
        parsed.setdefault("recommended_roles", [])
        parsed.setdefault("experience_summary", "")
        parsed.setdefault("experience", [])
        parsed.setdefault("education", [])
        parsed.setdefault("projects", [])

        parsed["skills"] = normalize_skill_list(parsed.get("skills", []))
        if not parsed["skills"]:
            parsed["skills"] = _fallback_skill_scan(resume_text)
        return parsed
    except json.JSONDecodeError:
        return {
            "name": None,
            "email": None,
            "phone": None,
            "location": None,
            "skills": _fallback_skill_scan(resume_text),
            "recommended_roles": [],
            "experience_summary": result, 
            "experience": [],
            "education": [], 
            "projects": []
        }


async def analyze_resume_vs_job_description(
    role_title: str,
    resume_skills: list,
    resume_summary: str,
    jd_title: str,
    jd_description: str,
    jd_required_skills: list | None = None,
) -> dict:
    """Compare resume and job description to produce interview guidance."""
    jd_required_skills = jd_required_skills or []
    prompt = f"""You are an interview coach helping a student prepare for a job.

Role title: {role_title}
Job Description Title: {jd_title}
Job Description Text:
---
{jd_description}
---

Job Description Required Skills (if provided): {json.dumps(jd_required_skills)}

Student Resume Skills: {json.dumps(resume_skills)}
Student Resume Summary:
---
{resume_summary}
---

Return ONLY valid JSON with this structure:
{{
  "meeting_expectations": ["..."],
  "missing_expectations": ["..."],
  "improvement_suggestions": ["..."],
  "fit_summary": "short summary"
}}

Rules:
1) Be practical and concise.
2) Mention what already matches first.
3) Missing expectations should be specific and skill/experience-oriented.
4) Suggestions should be actionable and student-friendly.
5) Avoid harsh wording.
"""

    try:
        result = _extract_json_object(await call_gemini(prompt))
        parsed = json.loads(result)
        return {
            "meeting_expectations": parsed.get("meeting_expectations", [])[:10],
            "missing_expectations": parsed.get("missing_expectations", [])[:10],
            "improvement_suggestions": parsed.get("improvement_suggestions", [])[:10],
            "fit_summary": parsed.get("fit_summary", ""),
        }
    except Exception:
        resume_set = {s.lower() for s in normalize_skill_list(resume_skills)}
        required = normalize_skill_list(jd_required_skills)
        missing = [s for s in required if s.lower() not in resume_set]
        met = [s for s in required if s.lower() in resume_set]
        return {
            "meeting_expectations": met[:6],
            "missing_expectations": missing[:6],
            "improvement_suggestions": [
                "Build 1-2 focused projects aligned with missing JD skills.",
                "Use STAR-style examples for your strongest matching skills.",
                "Revise resume bullets to highlight measurable impact.",
            ],
            "fit_summary": "You match some expectations and can improve fit by addressing the missing skills.",
        }


async def generate_interview_question(
    skills: list,
    role_title: str,
    previous_questions: list = None,
    previous_answer: str = None,
    difficulty: str = "medium",
    question_stage: str = "deep",
    foundation_limit: int = 3,
) -> dict:
    """Generate an interview question using Gemini."""
    context = f"Role: {role_title}\nCandidate Skill Focus Areas: {', '.join(skills)}\nDifficulty: {difficulty}"
    context += f"\nCurrent Stage: {question_stage}"
    context += f"\nFoundation Question Limit: {foundation_limit}"

    if previous_questions:
        context += f"\n\nPrevious questions asked (do NOT repeat these):\n"
        for i, q in enumerate(previous_questions, 1):
            context += f"{i}. {q}\n"

    if previous_answer:
        context += f"\nCandidate's last answer: {previous_answer}"
        context += "\nGenerate a follow-up question based on this answer to probe deeper."

    prompt_template = PromptTemplate.from_template(
        """{context}

Generate ONE interview question for this candidate. The question should:
1. Be relevant to the role and candidate's skills
2. Match the {difficulty} difficulty level
3. Be clear and specific
4. Test practical knowledge
5. If a skill is a cluster label like "Deep Learning (CNN, LSTM)", pick one member skill from that cluster and ask a concrete question on it
6. Rotate topics to avoid repeatedly asking from the same cluster
7. If Current Stage is "foundation": ask only core/fundamental basics
8. If Current Stage is "deep": DO NOT ask basic definition/foundation questions; ask applied, scenario-based, debugging, optimization, or trade-off questions only
9. Treat Foundation Question Limit as a strict cap: once foundation stage is done, never return to foundation-style prompts

Return ONLY a JSON object with:
- "question": the interview question text
- "difficulty": "{difficulty}"
- "category": the skill category this tests

Return ONLY valid JSON, no markdown formatting."""
    )
    prompt = prompt_template.format(context=context, difficulty=difficulty)

    try:
        result = _extract_json_object(await call_gemini(prompt))
        return json.loads(result)
    except Exception:
        return {
            "question": f"Tell me about your experience with {skills[0] if skills else 'software development'}.",
            "difficulty": difficulty,
            "category": "general",
        }


async def generate_interview_question_batch(
    skills: list,
    role_title: str,
    count: int,
    start_question_number: int = 1,
    previous_questions: list = None,
    foundation_limit: int = 3,
) -> list:
    """Generate a batch of interview questions in a single Gemini call."""
    previous_questions = previous_questions or []
    count = max(0, int(count or 0))
    if count == 0:
        return []

    plan = []
    for i in range(count):
        qn = start_question_number + i
        difficulty = "easy" if qn <= foundation_limit else ("medium" if qn <= foundation_limit + 3 else "hard")
        stage = "foundation" if qn <= foundation_limit else "deep"
        plan.append({"question_number": qn, "difficulty": difficulty, "stage": stage})

    context = (
        f"Role: {role_title}\n"
        f"Candidate Skill Focus Areas: {', '.join(skills)}\n"
        f"Question Plan: {json.dumps(plan)}\n"
        f"Foundation Question Limit: {foundation_limit}"
    )

    if previous_questions:
        context += "\n\nPrevious questions asked (do NOT repeat these):\n"
        for i, q in enumerate(previous_questions, 1):
            context += f"{i}. {q}\n"

    prompt_template = PromptTemplate.from_template(
        """{context}

Generate exactly {count} interview questions as a JSON array where each item follows the corresponding Question Plan entry.

Rules:
1. Questions must be relevant to the role and listed skills.
2. Do not repeat or rephrase previous questions.
3. If stage is "foundation": ask only core fundamentals.
4. If stage is "deep": ask applied/scenario/debugging/trade-off questions only.
5. Rotate topics across skills to avoid repetitive focus.
6. If a skill is a cluster label like "Deep Learning (CNN, LSTM)", ask about one concrete member skill.

Return ONLY valid JSON array with objects of shape:
- "question": string
- "difficulty": one of "easy" | "medium" | "hard"
- "category": string

Return ONLY JSON, no markdown."""
    )
    prompt = prompt_template.format(context=context, count=count)

    try:
        result = (await call_gemini(prompt)).strip()
        data = json.loads(result)
        if not isinstance(data, list):
            raise ValueError("Batch response is not a list")
        normalized = []
        for i, item in enumerate(data[:count]):
            spec = plan[i]
            if not isinstance(item, dict):
                item = {}
            normalized.append(
                {
                    "question": item.get("question") or f"Explain your approach for {skills[0] if skills else 'this topic'}.",
                    "difficulty": item.get("difficulty") if item.get("difficulty") in {"easy", "medium", "hard"} else spec["difficulty"],
                    "category": item.get("category") or "general",
                }
            )
        while len(normalized) < count:
            spec = plan[len(normalized)]
            normalized.append(
                {
                    "question": f"Tell me about your experience with {skills[0] if skills else 'software development'}.",
                    "difficulty": spec["difficulty"],
                    "category": "general",
                }
            )
        return normalized
    except Exception:
        fallback = []
        for i in range(count):
            spec = plan[i]
            fallback.append(
                {
                    "question": f"Tell me about your experience with {skills[0] if skills else 'software development'}.",
                    "difficulty": spec["difficulty"],
                    "category": "general",
                }
            )
        return fallback


async def generate_followup_question_batch_from_qa(
    role_title: str,
    skills: list,
    qa_pairs: list,
    previous_questions: list,
    count: int,
    difficulty: str = "medium",
) -> list:
    """Generate follow-up questions from interview Q&A context in a single Gemini call."""
    count = max(0, int(count or 0))
    if count == 0:
        return []

    compact_qa = []
    for qa in qa_pairs[-8:]:
        q = (qa or {}).get("question", "")
        a = (qa or {}).get("answer", "")
        if q and a:
            compact_qa.append({"question": q, "answer": a})

    payload = {
        "role_title": role_title,
        "skills": skills,
        "difficulty": difficulty,
        "count": count,
        "answered_qa": compact_qa,
        "loose_qa": _collect_loose_qa(qa_pairs),
        "previous_questions": previous_questions,
    }

    prompt_template = PromptTemplate.from_template(
        """You are generating strict, concept-focused technical interview follow-up questions.

Input JSON:
{payload}

Instructions:
1. Generate exactly {count} follow-up questions using answered_qa context.
    2. Questions must continue naturally from candidate's previous answers.
3. Do not repeat or paraphrase any question in previous_questions.
    4. Prioritize loose_qa first: if any answer is vague/short/uncertain, ask a direct follow-up that probes missing concept depth.
    5. Focus on concept validation (why, how, trade-offs, failure modes), not memorized definitions.
    6. Keep questions practical and role-relevant.
    7. Use difficulty {difficulty}. Do not output easy/basic-level questions.

Return ONLY valid JSON array with objects:
- "question": string
- "difficulty": "easy" | "medium" | "hard"
- "category": string

No markdown, no extra text."""
    )
    prompt = prompt_template.format(
        payload=json.dumps(payload, ensure_ascii=True),
        count=count,
        difficulty=difficulty,
    )

    try:
        result = (await call_gemini(prompt)).strip()
        data = json.loads(result)
        if not isinstance(data, list):
            raise ValueError("Follow-up batch response is not a list")

        normalized = []
        for item in data[:count]:
            if not isinstance(item, dict):
                item = {}
            normalized.append(
                {
                    "question": item.get("question") or f"Can you explain your approach for {skills[0] if skills else 'this scenario'}?",
                    "difficulty": item.get("difficulty") if item.get("difficulty") in {"easy", "medium", "hard"} else difficulty,
                    "category": item.get("category") or "follow-up",
                }
            )

        while len(normalized) < count:
            normalized.append(
                {
                    "question": f"Can you explain your approach for {skills[0] if skills else 'this scenario'}?",
                    "difficulty": difficulty,
                    "category": "follow-up",
                }
            )
        return normalized
    except Exception:
        fallback = []
        for _ in range(count):
            fallback.append(
                {
                    "question": f"Can you explain your approach for {skills[0] if skills else 'this scenario'}?",
                    "difficulty": difficulty,
                    "category": "follow-up",
                }
            )
        return fallback


async def evaluate_interview(questions_and_answers: list, role_title: str) -> dict:
    """Batch evaluate all interview Q&A pairs using Gemini."""
    qa_text = ""
    for i, qa in enumerate(questions_and_answers, 1):
        qa_text += f"\nQ{i}: {qa['question']}\nA{i}: {qa['answer']}\n"

    prompt_template = PromptTemplate.from_template(
                """You are a strict technical interviewer evaluating a candidate for the role: {role_title}.

Here are the interview questions and the candidate's answers:
{qa_text}

Scoring policy (concept-first, strict):
1. Score primarily on conceptual correctness, depth, and reasoning quality.
2. Do NOT reward answer length, confidence, or communication style when concepts are wrong.
3. Penalize vague, hand-wavy, or uncertain answers.
4. Penalize technically incorrect claims even if explanation sounds fluent.
5. Reward precise mechanisms, trade-offs, edge cases, and debugging logic.

Score rubric per answer:
- 90-100: conceptually correct, deep, and accurate with strong reasoning
- 70-89: mostly correct with minor conceptual gaps
- 50-69: partially correct but misses key mechanisms
- 30-49: shallow/vague with major conceptual gaps
- 0-29: incorrect or off-topic

Return a JSON object with:
- "overall_score": integer from 0-100
- "detailed_scores": list of objects, each with:
    - "question": the question text
    - "answer": the answer text
    - "score": integer 0-100
    - "feedback": concise concept-focused feedback for this answer
- "strengths": list of 3-5 strength areas
- "weaknesses": list of 3-5 concept gaps
- "recommendations": list of 3-5 actionable concept-improvement recommendations

Return ONLY valid JSON, no markdown formatting."""
        )
    prompt = prompt_template.format(role_title=role_title, qa_text=qa_text)

    try:
        result = _extract_json_object(await call_gemini(prompt))
        return json.loads(result)
    except Exception:
        return {
            "overall_score": 50,
            "detailed_scores": [],
            "strengths": ["Unable to evaluate"],
            "weaknesses": ["Unable to evaluate"],
            "recommendations": ["Please retry the interview"],
        }
