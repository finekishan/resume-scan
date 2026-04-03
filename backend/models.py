from pydantic import BaseModel
from typing import List

class CandidateResult(BaseModel):
    name: str
    score: int
    strengths: List[str]
    gaps: List[str]
    summary: str
