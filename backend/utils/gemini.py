from google import genai
from config import get_settings
from utils.skills import normalize_skill_list
import json
import re
from langchain_core.prompts import PromptTemplate

settings = get_settings()

client = genai.Client(api_key=settings.GEMINI_API_KEY)


async def call_gemini(prompt: str, system_instruction: str = None) -> str:
    """Call Gemini API with a prompt and optional system instruction."""
    config = {}
    if system_instruction:
        config["system_instruction"] = system_instruction
    config["response_mime_type"] = "application/json"

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=config if config else None,
    )
    return response.text


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

    result = await call_gemini(prompt)
    result = _extract_json_object(result)

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

    result = _extract_json_object(await call_gemini(prompt))
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            "question": f"Tell me about your experience with {skills[0] if skills else 'software development'}.",
            "difficulty": difficulty,
            "category": "general",
        }


async def evaluate_interview(questions_and_answers: list, role_title: str) -> dict:
    """Batch evaluate all interview Q&A pairs using Gemini."""
    qa_text = ""
    for i, qa in enumerate(questions_and_answers, 1):
        qa_text += f"\nQ{i}: {qa['question']}\nA{i}: {qa['answer']}\n"

    prompt_template = PromptTemplate.from_template(
        """You are an expert technical interviewer evaluating a candidate for the role: {role_title}

Here are the interview questions and the candidate's answers:
{qa_text}

Evaluate the candidate and return a JSON object with:
- "overall_score": integer from 0-100
- "detailed_scores": list of objects, each with:
  - "question": the question text
  - "answer": the answer text
  - "score": integer 0-100
  - "feedback": specific feedback for this answer
- "strengths": list of 3-5 strength areas
- "weaknesses": list of 3-5 areas for improvement
- "recommendations": list of 3-5 actionable recommendations

Be fair but thorough. Return ONLY valid JSON, no markdown formatting."""
    )
    prompt = prompt_template.format(role_title=role_title, qa_text=qa_text)

    result = _extract_json_object(await call_gemini(prompt))
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            "overall_score": 50,
            "detailed_scores": [],
            "strengths": ["Unable to evaluate"],
            "weaknesses": ["Unable to evaluate"],
            "recommendations": ["Please retry the interview"],
        }
