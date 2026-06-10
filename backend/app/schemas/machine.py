from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid
from app.models.machine import MachineType


class MachineBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=50)
    line: Optional[str] = Field(None, max_length=20)
    type: MachineType = MachineType.OTHER


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    line: Optional[str] = Field(None, max_length=20)
    type: Optional[MachineType] = None
    is_active: Optional[bool] = None


class MachineResponse(MachineBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True