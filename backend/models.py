from pydantic import BaseModel
from typing import Optional, List


class CreativeBrief(BaseModel):
    overall_energy: str
    music_style_direction: str
    references_text: Optional[str] = ""


class SectionUpdate(BaseModel):
    section_type: Optional[str] = None
    emotional_tone: Optional[str] = None


class MergeRequest(BaseModel):
    section_ids: List[str]  # exactly 2, must be adjacent


class ResizeRequest(BaseModel):
    new_start_time: Optional[float] = None
    new_end_time: Optional[float] = None


class SplitRequest(BaseModel):
    split_at_clip_id: Optional[str] = None  # Legacy: split at clip boundary
    split_at_time: Optional[float] = None   # Split at exact timestamp (seconds)


class RegenerateRequest(BaseModel):
    feedback: str


class ReorderRequest(BaseModel):
    clip_ids: List[str]
