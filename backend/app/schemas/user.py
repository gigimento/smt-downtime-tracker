from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
import uuid
from app.models.user import UserRole


class TeamBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=50)
    telegram_topic_id: Optional[int] = None


class TeamCreate(TeamBase):
    pin_code: Optional[str] = Field(None, max_length=20)


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    telegram_topic_id: Optional[int] = None
    pin_code: Optional[str] = Field(None, max_length=20)


class TeamResponse(TeamBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    badge_code: str = Field(..., min_length=1, max_length=50)
    full_name: str = Field(..., min_length=1, max_length=100)
    team_id: Optional[uuid.UUID] = None
    role: UserRole = UserRole.OPERATOR


class UserCreate(UserBase):
    pin_code: Optional[str] = Field(None, max_length=20)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    team_id: Optional[uuid.UUID] = None
    role: Optional[UserRole] = None
    pin_code: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime
    team: Optional[TeamResponse] = None

    class Config:
        from_attributes = True


class UserWithTeam(UserResponse):
    team: Optional[TeamResponse] = None
