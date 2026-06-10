from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
import uuid
from app.database import get_db
from app.core.dependencies import get_current_active_user, require_admin
from app.models.user import User, UserRole, Team
from app.schemas.user import UserCreate, UserUpdate, UserResponse, TeamCreate, TeamUpdate, TeamResponse
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    role: Optional[UserRole] = Query(None),
    team_id: Optional[uuid.UUID] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    query = select(User).options(selectinload(User.team))
    conditions = []
    if role:
        conditions.append(User.role == role)
    if team_id:
        conditions.append(User.team_id == team_id)
    if is_active is not None:
        conditions.append(User.is_active == is_active)
    if conditions:
        query = query.where(*conditions)
    query = query.order_by(User.full_name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(User).options(selectinload(User.team)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Check unique badge_code
    result = await db.execute(select(User).where(User.badge_code == request.badge_code))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Badge code already exists")
    
    # Hash PIN if provided
    user_data = request.model_dump()
    if user_data.get("pin_code"):
        user_data["pin_code"] = get_password_hash(user_data["pin_code"])
    
    user = User(**user_data)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    request: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = request.model_dump(exclude_unset=True)
    if "pin_code" in update_data and update_data["pin_code"]:
        update_data["pin_code"] = get_password_hash(update_data["pin_code"])
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.delete(user)
    await db.commit()


# Team routes
@router.get("/teams/", response_model=list[TeamResponse])
async def list_teams(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Team).order_by(Team.code))
    return result.scalars().all()


@router.post("/teams/", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    request: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Hash PIN if provided
    team_data = request.model_dump()
    if team_data.get("pin_code"):
        team_data["pin_code"] = get_password_hash(team_data["pin_code"])
    
    team = Team(**team_data)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.patch("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: uuid.UUID,
    request: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    update_data = request.model_dump(exclude_unset=True)
    if "pin_code" in update_data and update_data["pin_code"]:
        update_data["pin_code"] = get_password_hash(update_data["pin_code"])
    
    for field, value in update_data.items():
        setattr(team, field, value)
    
    await db.commit()
    await db.refresh(team)
    return team