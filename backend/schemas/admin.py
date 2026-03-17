from pydantic import BaseModel
from typing import Optional, List


class JobRoleCreate(BaseModel):
    title: str
    description: str
    department: Optional[str] = None


class JobRoleUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None


class JobRoleResponse(BaseModel):
    id: str
    title: str
    description: str
    department: Optional[str] = None
    created_at: str


class QuestionCreate(BaseModel):
    role_id: str
    question: str
    difficulty: str = "medium"
    category: Optional[str] = None
    expected_answer: Optional[str] = None


class QuestionUpdate(BaseModel):
    question: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None
    expected_answer: Optional[str] = None


class QuestionResponse(BaseModel):
    id: str
    role_id: str
    question: str
    difficulty: str
    category: Optional[str] = None
    created_at: str


class RoleRequirementCreate(BaseModel):
    role_id: str
    skill: str
    level: str = "intermediate"


class RoleRequirementResponse(BaseModel):
    id: str
    role_id: str
    skill: str
    level: str
