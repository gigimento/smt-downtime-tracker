from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import uuid
from app.database import get_db
from app.core.security import get_password_hash, verify_password, create_token_for_user
from app.core.dependencies import get_current_active_user
from app.config import settings
from app.models.user import User, UserRole
from app.schemas.auth import Token, LoginRequest
from app.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).options(selectinload(User.team)).where(User.badge_code == request.badge_code)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid badge code or PIN",
        )
    
    # Verify PIN when required, or when provided voluntarily.
    if settings.REQUIRE_PIN_FOR_LOGIN and not request.pin_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid badge code or PIN",
        )

    if request.pin_code:
        pin_valid = False
        if user.pin_code and verify_password(request.pin_code, user.pin_code):
            pin_valid = True
        elif user.team and user.team.pin_code and verify_password(request.pin_code, user.team.pin_code):
            pin_valid = True
        
        if not pin_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid badge code or PIN",
            )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    
    access_token = create_token_for_user(user.id, user.badge_code, user.role, user.team_id)
    
    return Token(
        access_token=access_token,
        expires_in=7 * 24 * 60 * 60,  # 7 days in seconds
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: User = Depends(get_current_active_user)):
    access_token = create_token_for_user(
        current_user.id, current_user.badge_code, current_user.role, current_user.team_id
    )
    return Token(access_token=access_token, expires_in=7 * 24 * 60 * 60)
