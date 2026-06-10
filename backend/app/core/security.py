from datetime import datetime, timedelta
from typing import Optional
import uuid
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings
from app.models.user import UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def create_token_for_user(user_id: uuid.UUID, badge_code: str, role: UserRole, team_id: Optional[uuid.UUID] = None) -> str:
    data = {
        "sub": str(user_id),
        "badge_code": badge_code,
        "role": role.value,
        "team_id": str(team_id) if team_id else None,
    }
    return create_access_token(data)