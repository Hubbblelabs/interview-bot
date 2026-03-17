from fastapi import APIRouter, Depends, HTTPException
from auth.jwt import get_current_user
from schemas.interview import (
    StartInterviewRequest,
    SubmitAnswerRequest,
    InterviewStartResponse,
    AnswerResponse,
)
from services.interview_service import start_interview, submit_answer
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
        )
        return result
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
