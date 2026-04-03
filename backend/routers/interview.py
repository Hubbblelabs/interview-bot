from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from schemas.interview import (
    StartInterviewRequest,
    VerifyResumeJdRequest,
    SubmitAnswerRequest,
    QuitInterviewRequest,
    InterviewStartResponse,
    AnswerResponse,
)
from services.interview_service import (
    start_interview,
    verify_resume_job_description,
    submit_answer,
    quit_interview,
)
from services.evaluation_service import generate_report

router = APIRouter()


@router.post("/start")
async def start_interview_endpoint(
    request: StartInterviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """Start a new interview session."""
    try:
        result = await start_interview(
            user_id=current_user["user_id"],
            role_id=request.role_id,
            custom_role=request.custom_role,
            interview_type=request.interview_type,
            topic_id=request.topic_id,
            job_description_id=request.job_description_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify")
async def verify_resume_job_description_endpoint(
    request: VerifyResumeJdRequest,
    current_user: dict = Depends(get_current_user),
):
    """Verify resume vs selected job description before starting interview."""
    try:
        result = await verify_resume_job_description(
            user_id=current_user["user_id"],
            role_id=request.role_id,
            custom_role=request.custom_role,
            job_description_id=request.job_description_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/answer")
async def submit_answer_endpoint(
    request: SubmitAnswerRequest,
    current_user: dict = Depends(get_current_user),
):
    """Submit an answer and get next question."""
    try:
        result = await submit_answer(
            session_id=request.session_id,
            question_id=request.question_id,
            answer=request.answer,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quit")
async def quit_interview_endpoint(
    request: QuitInterviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """Quit an in-progress interview and generate a partial report if answers exist."""
    try:
        quit_result = await quit_interview(
            session_id=request.session_id,
            user_id=current_user["user_id"],
        )

        report = None
        if quit_result.get("report_generated"):
            report = await generate_report(
                session_id=request.session_id,
                user_id=current_user["user_id"],
            )

        return {
            "session_id": request.session_id,
            "report_generated": bool(report),
            "report": report,
            "message": quit_result.get("message", "Interview quit"),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report")
async def get_interview_report(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Generate and retrieve interview report."""
    try:
        result = await generate_report(
            session_id=session_id,
            user_id=current_user["user_id"],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
