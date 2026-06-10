from pydantic import BaseModel, Field
from typing import Optional
import uuid
from app.models.user import UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    user_id: uuid.UUID
    badge_code: str
    role: UserRole
    team_id: Optional[uuid.UUID] = None


class LoginRequest(BaseModel):
    badge_code: str = Field(..., min_length=1, max_length=50)
    pin_code: Optional[str] = Field(None, max_length=20)


class RefreshTokenRequest(BaseModel):
    refresh_token: str