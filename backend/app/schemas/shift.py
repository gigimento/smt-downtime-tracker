"""
Pydantic schemas for ShiftOverride.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time, datetime
import uuid


class ShiftOverrideBase(BaseModel):
    date: date
    override_type: str = Field(..., pattern="^(force_workday|force_free_shift|force_weekend)$")
    work_start: Optional[time] = None
    work_end: Optional[time] = None
    note: Optional[str] = Field(None, max_length=200)


class ShiftOverrideCreate(ShiftOverrideBase):
    pass


class ShiftOverrideUpdate(BaseModel):
    override_type: Optional[str] = Field(None, pattern="^(force_workday|force_free_shift|force_weekend)$")
    work_start: Optional[time] = None
    work_end: Optional[time] = None
    note: Optional[str] = Field(None, max_length=200)


class ShiftOverrideResponse(ShiftOverrideBase):
    id: uuid.UUID
    created_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
