import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from auth.jwt import require_role, get_current_user
from schemas.admin import (
    JobRoleCreate, JobRoleUpdate,
    QuestionCreate, QuestionUpdate,
    RoleRequirementCreate,
    TopicCreate, TopicUpdate, TopicPublishUpdate,
)
from services.admin_service import (
    create_role, update_role, delete_role, list_roles,
    create_question, update_question, delete_question, list_questions, get_question_by_id,
    create_topic, list_topics, update_topic, delete_topic, set_topic_publish_status,
    import_questions_from_pdf,
    create_requirement, list_requirements, delete_requirement,
    list_quit_interviews, list_admin_reports, get_admin_report_detail,
    list_admin_users, delete_admin_user,
)
from services.job_description_service import (
    create_job_description,
    list_admin_job_descriptions,
    update_admin_job_description,
    delete_admin_job_description,
)
from services.analytics_service import get_admin_analytics

router = APIRouter()


# ─── Job Roles ───

@router.get("/roles")
async def get_roles(current_user: dict = Depends(get_current_user)):
    """List all job roles (accessible by all authenticated users for interview selection)."""
    roles = await list_roles()
    return {"roles": roles}


@router.post("/roles")
async def create_role_endpoint(
    request: JobRoleCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a new job role (admin only)."""
    result = await create_role(
        title=request.title,
        description=request.description,
        department=request.department,
    )
    return result


@router.put("/roles/{role_id}")
async def update_role_endpoint(
    role_id: str,
    request: JobRoleUpdate,
    current_user: dict = Depends(require_role("admin")),
):
    """Update a job role (admin only)."""
    try:
        result = await update_role(role_id, request.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/roles/{role_id}")
async def delete_role_endpoint(
    role_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete a job role (admin only)."""
    success = await delete_role(role_id)
    if not success:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"message": "Role deleted"}


# ─── Questions ───

@router.get("/questions")
async def get_questions(
    role_id: str = Query(None),
    topic_id: str = Query(None),
    interview_type: str = Query(None),
    difficulty: str = Query(None),
    current_user: dict = Depends(require_role("admin")),
):
    """List questions, optionally filtered by role."""
    questions = await list_questions(
        role_id=role_id,
        topic_id=topic_id,
        interview_type=interview_type,
        difficulty=difficulty,
    )
    return {"questions": questions}


@router.post("/questions")
async def create_question_endpoint(
    request: QuestionCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a new question (admin only)."""
    result = await create_question(
        role_id=request.role_id,
        topic_id=request.topic_id,
        interview_type=request.interview_type,
        question=request.question,
        difficulty=request.difficulty,
        category=request.category,
        expected_answer=request.expected_answer,
    )
    return result


@router.get("/questions/{question_id}")
async def get_question_by_id_endpoint(
    question_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Get one question by id (admin only)."""
    try:
        question = await get_question_by_id(question_id)
        return question
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/questions/upload")
async def upload_questions_pdf_endpoint(
    interview_type: str = Form("resume"),
    role_id: str | None = Form(None),
    topic_id: str | None = Form(None),
    subjects: str | None = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    """Upload a PDF and extract interview questions (admin only)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for question import")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 10MB")

    parsed_subjects = []
    if subjects:
        try:
            parsed_subjects = json.loads(subjects)
            if not isinstance(parsed_subjects, list):
                raise ValueError
        except Exception:
            parsed_subjects = [s.strip() for s in subjects.split(",") if s.strip()]

    try:
        result = await import_questions_from_pdf(
            role_id=role_id,
            topic_id=topic_id,
            interview_type=interview_type,
            subjects=parsed_subjects,
            filename=file.filename,
            file_content=content,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import questions from PDF: {str(e)}")


@router.put("/questions/{question_id}")
async def update_question_endpoint(
    question_id: str,
    request: QuestionUpdate,
    current_user: dict = Depends(require_role("admin")),
):
    """Update a question (admin only)."""
    try:
        result = await update_question(question_id, request.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/questions/{question_id}")
async def delete_question_endpoint(
    question_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete a question (admin only)."""
    success = await delete_question(question_id)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"message": "Question deleted"}


# ─── Role Requirements ───

@router.get("/requirements/{role_id}")
async def get_requirements(
    role_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """List requirements for a role."""
    requirements = await list_requirements(role_id)
    return {"requirements": requirements}


# ─── Topics ───

@router.get("/topics")
async def get_topics(current_user: dict = Depends(get_current_user)):
    """List all topic categories (accessible by all authenticated users)."""
    only_published = current_user.get("role") != "admin"
    topics = await list_topics(only_published=only_published)
    return {"topics": topics}


@router.post("/topics")
async def create_topic_endpoint(
    request: TopicCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a topic category (admin only)."""
    try:
        result = await create_topic(name=request.name, description=request.description)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/topics/{topic_id}")
async def update_topic_endpoint(
    topic_id: str,
    request: TopicUpdate,
    current_user: dict = Depends(require_role("admin")),
):
    """Update a topic category (admin only)."""
    try:
        result = await update_topic(topic_id, request.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/topics/{topic_id}")
async def delete_topic_endpoint(
    topic_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete a topic category and its topic questions (admin only)."""
    success = await delete_topic(topic_id)
    if not success:
        raise HTTPException(status_code=404, detail="Topic not found")
    return {"message": "Topic deleted"}


@router.put("/topics/{topic_id}/publish")
async def publish_topic_endpoint(
    topic_id: str,
    request: TopicPublishUpdate,
    current_user: dict = Depends(require_role("admin")),
):
    """Publish/unpublish a topic for student interview selection (admin only)."""
    try:
        result = await set_topic_publish_status(
            topic_id,
            request.is_published,
            timer_enabled=request.timer_enabled,
            timer_seconds=request.timer_seconds,
        )
        return result
    except ValueError as e:
        detail = str(e)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail)


@router.post("/requirements")
async def create_requirement_endpoint(
    request: RoleRequirementCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a role requirement (admin only)."""
    result = await create_requirement(
        role_id=request.role_id,
        skill=request.skill,
        level=request.level,
    )
    return result


@router.delete("/requirements/{req_id}")
async def delete_requirement_endpoint(
    req_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete a role requirement (admin only)."""
    success = await delete_requirement(req_id)
    if not success:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return {"message": "Requirement deleted"}


# ─── Analytics ───

@router.get("/analytics")
async def get_analytics(
    current_user: dict = Depends(require_role("admin")),
):
    """Get admin analytics dashboard data."""
    analytics = await get_admin_analytics()
    return analytics


@router.get("/quit-interviews")
async def get_quit_interviews(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_role("admin")),
):
    """Get full details about interviews quit by users."""
    items = await list_quit_interviews(limit=limit)
    return {"items": items}


@router.get("/reports")
async def get_admin_reports(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_role("admin")),
):
    """Get all interview report summaries for admin."""
    items = await list_admin_reports(limit=limit)
    return {"items": items}


@router.get("/reports/{session_id}")
async def get_admin_report_by_session(
    session_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Get full report details for a specific interview session (admin only)."""
    try:
        item = await get_admin_report_detail(session_id=session_id)
        return item
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/users")
async def get_admin_users(
    limit: int = Query(500, ge=1, le=1000),
    current_user: dict = Depends(require_role("admin")),
):
    """List users for admin management."""
    items = await list_admin_users(limit=limit)
    return {"items": items}


@router.get("/job-descriptions")
async def get_admin_job_descriptions(
    owner_user_id: str = Query(None),
    current_user: dict = Depends(require_role("admin")),
):
    """List job descriptions for admin management."""
    items = await list_admin_job_descriptions(owner_user_id=owner_user_id)
    return {"items": items}


@router.post("/job-descriptions")
async def create_admin_job_description_endpoint(
    request_data: dict,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a job description as admin."""
    try:
        item = await create_job_description(
            user_id=current_user["user_id"],
            owner_role="admin",
            title=request_data.get("title"),
            company=request_data.get("company"),
            description=request_data.get("description"),
            required_skills=request_data.get("required_skills"),
        )
        return item
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/job-descriptions/{jd_id}")
async def update_admin_job_description_endpoint(
    jd_id: str,
    request_data: dict,
    current_user: dict = Depends(require_role("admin")),
):
    """Update any job description (admin only)."""
    try:
        item = await update_admin_job_description(jd_id, request_data)
        return item
    except ValueError as e:
        status_code = 404 if "not found" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/job-descriptions/{jd_id}")
async def delete_admin_job_description_endpoint(
    jd_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete any job description (admin only)."""
    success = await delete_admin_job_description(jd_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job description not found")
    return {"message": "Job description deleted"}


@router.delete("/users/{user_id}")
async def delete_admin_user_endpoint(
    user_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    """Delete a student user and related records (admin only)."""
    try:
        success = await delete_admin_user(user_id, current_user["user_id"])
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted"}
    except ValueError as e:
        detail = str(e)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail)
