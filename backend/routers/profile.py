from fastapi import APIRouter, Depends
from auth.jwt import get_current_user
from database import get_db
from models.collections import USERS, RESUMES, SKILLS
from utils.helpers import str_objectid
from bson import ObjectId

router = APIRouter()


@router.get("")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile with skills and resume info."""
    db = get_db()

    user = await db[USERS].find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        # Fallback: try finding by email
        user = await db[USERS].find_one({"email": current_user["email"]})

    profile = {
        "user_id": current_user["user_id"],
        "name": current_user.get("name", ""),
        "email": current_user.get("email", ""),
        "role": current_user.get("role", "student"),
    }

    # Get resume info
    resume = await db[RESUMES].find_one({"user_id": current_user["user_id"]})
    if resume:
        profile["resume"] = {
            "filename": resume.get("original_filename", ""),
            "uploaded_at": resume.get("uploaded_at", ""),
            "parsed_text": resume.get("parsed_text", ""),
        }
    else:
        profile["resume"] = None

    # Get skills
    skills_doc = await db[SKILLS].find_one({"user_id": current_user["user_id"]})
    profile["skills"] = skills_doc.get("skills", []) if skills_doc else []

    return profile

@router.put("/skills")
async def update_user_skills(
    request_data: dict,  # Or use UpdateSkillsRequest if imported
    current_user: dict = Depends(get_current_user)
):
    """Update the current user's extracted skills."""
    db = get_db()
    skills = request_data.get("skills", [])
    
    # Upsert the skills document for this user
    await db[SKILLS].update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"skills": skills, "user_id": current_user["user_id"]}},
        upsert=True
    )
    
    return {"message": "Skills updated successfully", "skills": skills}
