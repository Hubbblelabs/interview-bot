import os
import aiofiles
from database import get_db
from models.collections import RESUMES, SKILLS
from utils.helpers import utc_now, str_objectid
from utils.gemini import parse_resume_with_gemini
from utils.resume_text import extract_resume_text
from utils.skills import normalize_skill_list
from config import get_settings

settings = get_settings()


async def upload_and_parse_resume(user_id: str, filename: str, file_content: bytes) -> dict:
    """Upload resume file, parse with Gemini, extract skills."""
    db = get_db()

    # Save file locally
    safe_filename = f"{user_id}_{filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_content)

    # Extract readable text by file type before sending to Gemini.
    resume_text = extract_resume_text(filename, file_content)

    # Parse with Gemini
    parsed_data = await parse_resume_with_gemini(resume_text)
    raw_skills = parsed_data.get("skills", [])
    skills = normalize_skill_list(raw_skills)
    parsed_data["skills"] = skills

    # Upsert resume document
    resume_doc = {
        "user_id": user_id,
        "filename": safe_filename,
        "original_filename": filename,
        "file_path": file_path,
        "parsed_text": parsed_data.get("experience_summary", ""),
        "parsed_data": parsed_data,
        "uploaded_at": utc_now(),
    }

    await db[RESUMES].update_one(
        {"user_id": user_id},
        {"$set": resume_doc},
        upsert=True,
    )

    # Upsert skills
    await db[SKILLS].update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "skills": skills,
            "raw_skills": raw_skills,
            "updated_at": utc_now(),
        }},
        upsert=True,
    )

    result = await db[RESUMES].find_one({"user_id": user_id})
    return {
        "id": str(result["_id"]),
        "user_id": user_id,
        "filename": filename,
        "parsed_text": resume_doc["parsed_text"],
        "skills": skills,
        "uploaded_at": resume_doc["uploaded_at"],
    }


async def get_user_skills(user_id: str) -> list:
    """Get extracted skills for a user."""
    db = get_db()
    skills_doc = await db[SKILLS].find_one({"user_id": user_id})
    if skills_doc:
        return skills_doc.get("skills", [])
    return []
