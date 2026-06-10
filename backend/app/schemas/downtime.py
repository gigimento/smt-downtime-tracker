from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid
from app.models.downtime import DowntimeCategory, DowntimeSource


class DowntimeOpen(BaseModel):
    badge_code: str = Field(..., min_length=1, max_length=50)
    machine_code: str = Field(..., min_length=1, max_length=20)
    category: DowntimeCategory
    sub_category: Optional[str] = Field(None, max_length=50)
    problem_description: Optional[str] = Field(None, max_length=500)


class DowntimeAcknowledge(BaseModel):
    pass  # Just needs the downtime_id in path


class DowntimeClose(BaseModel):
    closure_code: str = Field(..., min_length=1, max_length=20)
    closure_comment: Optional[str] = Field(None, max_length=1000)


class DowntimeResponse(BaseModel):
    id: uuid.UUID
    machine_id: uuid.UUID
    machine_code: str
    machine_name: str
    line: Optional[str]
    opened_by_user_id: uuid.UUID
    opened_by_name: str
    opened_by_badge: str
    closed_by_user_id: Optional[uuid.UUID]
    closed_by_name: Optional[str]
    category: DowntimeCategory
    sub_category: Optional[str]
    problem_description: Optional[str]
    started_at: datetime
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    duration_seconds: int
    duration_formatted: str
    closure_code: Optional[str]
    closure_comment: Optional[str]
    mes_event_id: Optional[str]
    source: DowntimeSource
    is_active: bool

    class Config:
        from_attributes = True


class DowntimeListItem(BaseModel):
    id: uuid.UUID
    machine_code: str
    machine_name: str
    line: Optional[str]
    opened_by_name: str
    category: DowntimeCategory
    sub_category: Optional[str]
    problem_description: Optional[str]
    started_at: datetime
    duration_seconds: int
    duration_formatted: str
    is_active: bool

    class Config:
        from_attributes = True


class DowntimeFilter(BaseModel):
    machine_id: Optional[uuid.UUID] = None
    category: Optional[DowntimeCategory] = None
    sub_category: Optional[str] = None
    opened_by_user_id: Optional[uuid.UUID] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    only_active: bool = False
    page: int = 1
    page_size: int = 50


class KPICategoryStat(BaseModel):
    category: DowntimeCategory
    count: int
    total_hours: float
    percentage: float


class KPITopCause(BaseModel):
    sub_category: str
    count: int
    total_hours: float


class KPIMonthlyResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    total_downtime_hours: float
    total_events: int
    availability_loss_pct: float
    by_category: List[KPICategoryStat]
    top_causes: List[KPITopCause]
    by_machine: List[dict]
    by_line: List[dict]