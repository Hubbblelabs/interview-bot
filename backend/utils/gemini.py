from google import genai
from config import get_settings

settings = get_settings()

client = genai.Client(api_key=settings.GEMINI_API_KEY)


async def call_gemini(prompt: str, system_instruction: str = None) -> str:
    """Call Gemini API with a prompt and optional system instruction."""
    config = {}
    if system_instruction:
        config["system_instruction"] = system_instruction

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=config if config else None,
    )
    return response.text


async def parse_resume_with_gemini(resume_text: str) -> dict:
    """Parse resume text and extract structured data using Gemini."""
    prompt = f"""Analyze the following resume and extract structured information.
Return a JSON object with these fields:
- "skills": list of technical and soft skills
- "experience_summary": brief summary of work experience
- "education": list of educational qualifications
- "projects": list of notable projects

Resume text:
---
{resume_text}
---

Return ONLY valid JSON, no markdown formatting."""

    result = await call_gemini(prompt)
    # Clean up markdown code blocks if present
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1]
    if result.endswith("```"):
        result = result.rsplit("```", 1)[0]
    result = result.strip()

    import json
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {"skills": [], "experience_summary": result, "education": [], "projects": []}


async def generate_interview_question(
    skills: list,
    role_title: str,
    previous_questions: list = None,
    previous_answer: str = None,
    difficulty: str = "medium",
) -> dict:
    """Generate an interview question using Gemini."""
    context = f"Role: {role_title}\nCandidate Skills: {', '.join(skills)}\nDifficulty: {difficulty}"

    if previous_questions:
        context += f"\n\nPrevious questions asked (do NOT repeat these):\n"
        for i, q in enumerate(previous_questions, 1):
            context += f"{i}. {q}\n"

    if previous_answer:
        context += f"\nCandidate's last answer: {previous_answer}"
        context += "\nGenerate a follow-up question based on this answer to probe deeper."

    prompt = f"""{context}

Generate ONE interview question for this candidate. The question should:
1. Be relevant to the role and candidate's skills
2. Match the {difficulty} difficulty level
3. Be clear and specific
4. Test practical knowledge

Return ONLY a JSON object with:
- "question": the interview question text
- "difficulty": "{difficulty}"
- "category": the skill category this tests

Return ONLY valid JSON, no markdown formatting."""

    result = await call_gemini(prompt)
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1]
    if result.endswith("```"):
        result = result.rsplit("```", 1)[0]
    result = result.strip()

    import json
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

    prompt = f"""You are an expert technical interviewer evaluating a candidate for the role: {role_title}

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

    result = await call_gemini(prompt)
    result = result.strip()
    if result.startswith("```"):
        result = result.split("\n", 1)[1]
    if result.endswith("```"):
        result = result.rsplit("```", 1)[0]
    result = result.strip()

    import json
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
