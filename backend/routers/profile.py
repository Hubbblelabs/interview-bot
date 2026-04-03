from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from database import get_db
from models.collections import USERS, RESUMES, SKILLS
from utils.helpers import str_objectid
from utils.skills import normalize_skill_list, cluster_skills
from bson import ObjectId
from services.job_description_service import (
    create_job_description,
    list_my_job_descriptions,
    update_my_job_description,
    delete_my_job_description,
)

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
        "speech_settings": {
            "voice_gender": (user or {}).get("speech_settings", {}).get("voice_gender", "female"),
        },
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


@router.put("/speech-settings")
async def update_speech_settings(
    request_data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update user's speech assistant preferences."""
    db = get_db()
    voice_gender = (request_data.get("voice_gender") or "female").strip().lower()
    if voice_gender not in {"male", "female", "auto"}:
        raise HTTPException(status_code=400, detail="voice_gender must be one of: male, female, auto")

    await db[USERS].update_one(
        {"_id": ObjectId(current_user["user_id"])},
        {"$set": {"speech_settings.voice_gender": voice_gender}},
    )
    return {
        "message": "Speech settings updated successfully",
        "speech_settings": {"voice_gender": voice_gender},
    }

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


@router.get("/job-descriptions")
async def get_my_job_descriptions(
    current_user: dict = Depends(get_current_user),
):
    """List current user's job descriptions."""
    items = await list_my_job_descriptions(current_user["user_id"])
    return {"items": items}


@router.post("/job-descriptions")
async def create_my_job_description(
    request_data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Create a new job description for current user."""
    try:
        item = await create_job_description(
            user_id=current_user["user_id"],
            owner_role=current_user.get("role", "student"),
            title=request_data.get("title"),
            company=request_data.get("company"),
            description=request_data.get("description"),
            required_skills=request_data.get("required_skills"),
        )
        return item
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/job-descriptions/{jd_id}")
async def update_my_job_description_endpoint(
    jd_id: str,
    request_data: dict,
    current_user: dict = Depends(get_current_user),
):
    """Update a current user's job description."""
    try:
        item = await update_my_job_description(current_user["user_id"], jd_id, request_data)
        return item
    except ValueError as e:
        status_code = 404 if "not found" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/job-descriptions/{jd_id}")
async def delete_my_job_description_endpoint(
    jd_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a current user's job description."""
    success = await delete_my_job_description(current_user["user_id"], jd_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job description not found")
    return {"message": "Job description deleted"}
