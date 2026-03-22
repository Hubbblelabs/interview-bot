from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from database import get_db
from models.collections import USERS, RESUMES, SKILLS
from utils.helpers import str_objectid
from utils.skills import normalize_skill_list, cluster_skills
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
            "parsed_data": resume.get("parsed_data", {}),
        }
    else:
        profile["resume"] = None

    # Get skills
    skills_doc = await db[SKILLS].find_one({"user_id": current_user["user_id"]})
    profile["skills"] = skills_doc.get("skills", []) if skills_doc else []
    profile["clustered_skills"] = cluster_skills(profile["skills"])

    return profile

@router.put("/skills")
async def update_user_skills(
    request_data: dict,  # Or use UpdateSkillsRequest if imported
    current_user: dict = Depends(get_current_user)
):
    """Update the current user's extracted skills."""
    db = get_db()
    skills = normalize_skill_list(request_data.get("skills", []))
    
    # Upsert the skills document for this user
    await db[SKILLS].update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"skills": skills, "user_id": current_user["user_id"]}},
        upsert=True
    )
    
    return {"message": "Skills updated successfully", "skills": skills}


@router.put("/resume-data")
async def update_resume_data(
    request_data: dict, 
    current_user: dict = Depends(get_current_user)
):
    """Update the detailed parsed data of the user's resume."""
    db = get_db()
    parsed_data = request_data.get("parsed_data", {})
    
    # Update only the parsed_data property inside the RESUMES collection
    result = await db[RESUMES].update_one(
        {"user_id": current_user["user_id"]},
        {"$set": {"parsed_data": parsed_data}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Resume not found. Upload a resume first.")

    return {"message": "Resume details updated successfully", "parsed_data": parsed_data}
