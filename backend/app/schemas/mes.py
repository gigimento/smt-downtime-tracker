from pydantic import BaseModel, Field
from typing import Optional
from app.models.downtime import DowntimeCategory, DowntimeSource


class MESDowntimeEvent(BaseModel):
    machine_code: str = Field(..., min_length=1, max_length=20)
    category: DowntimeCategory
    sub_category: Optional[str] = Field(None, max_length=50)
    problem_description: Optional[str] = Field(None, max_length=500)
    mes_event_id: str = Field(..., min_length=1, max_length=100)
    source: DowntimeSource = DowntimeSource.MES_SIMULATOR


class MESDowntimeResponse(BaseModel):
    success: bool
    downtime_id: Optional[str] = None
    message: str