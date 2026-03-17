from fastapi import APIRouter, Depends, HTTPException, Query
from auth.jwt import require_role, get_current_user
from schemas.admin import (
    JobRoleCreate, JobRoleUpdate,
    QuestionCreate, QuestionUpdate,
    RoleRequirementCreate,
)
from services.admin_service import (
    create_role, update_role, delete_role, list_roles,
    create_question, update_question, delete_question, list_questions,
    create_requirement, list_requirements, delete_requirement,
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
    current_user: dict = Depends(require_role("admin")),
):
    """List questions, optionally filtered by role."""
    questions = await list_questions(role_id)
    return {"questions": questions}


@router.post("/questions")
async def create_question_endpoint(
    request: QuestionCreate,
    current_user: dict = Depends(require_role("admin")),
):
    """Create a new question (admin only)."""
    result = await create_question(
        role_id=request.role_id,
        question=request.question,
        difficulty=request.difficulty,
        category=request.category,
        expected_answer=request.expected_answer,
    )
    return result


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
