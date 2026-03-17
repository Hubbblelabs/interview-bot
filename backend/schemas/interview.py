from pydantic import BaseModel
from typing import Optional, List, Dict


class StartInterviewRequest(BaseModel):
    role_id: Optional[str] = None


class SubmitAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str


class InterviewQuestion(BaseModel):
    question_id: str
    question: str
    difficulty: str = "medium"
    question_number: int = 1
    total_questions: int = 10


class InterviewStartResponse(BaseModel):
    session_id: str
    question: InterviewQuestion
    message: str = "Interview started"


class AnswerResponse(BaseModel):
    session_id: str
    next_question: Optional[InterviewQuestion] = None
    is_complete: bool = False
    message: str = ""


class QuestionScore(BaseModel):
    question: str
    answer: str
    score: int
    feedback: str


class InterviewReport(BaseModel):
    session_id: str
    overall_score: int
    total_questions: int
    strengths: List[str]
    weaknesses: List[str]
    detailed_scores: List[QuestionScore]
    recommendations: List[str]
    completed_at: str
