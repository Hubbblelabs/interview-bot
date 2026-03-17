from pydantic import BaseModel
from typing import Optional, List


class ResumeResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    parsed_text: Optional[str] = None
    skills: List[str] = []
    uploaded_at: str

class UpdateSkillsRequest(BaseModel):
    skills: List[str]
