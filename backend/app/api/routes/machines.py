from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
import uuid
from app.database import get_db
from app.core.dependencies import get_current_active_user, require_admin
from app.models.user import User
from app.models.machine import Machine, MachineType
from app.schemas.machine import MachineCreate, MachineUpdate, MachineResponse

router = APIRouter(prefix="/machines", tags=["machines"])


@router.get("", response_model=list[MachineResponse])
async def list_machines(
    line: Optional[str] = Query(None),
    type: Optional[MachineType] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = select(Machine)
    conditions = []
    if line:
        conditions.append(Machine.line == line)
    if type:
        conditions.append(Machine.type == type)
    if is_active is not None:
        conditions.append(Machine.is_active == is_active)
    if conditions:
        query = query.where(*conditions)
    query = query.order_by(Machine.line, Machine.code)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
async def create_machine(
    request: MachineCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Check unique code
    result = await db.execute(select(Machine).where(Machine.code == request.code))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Machine code already exists")
    
    machine = Machine(**request.model_dump())
    db.add(machine)
    await db.commit()
    await db.refresh(machine)
    return machine


@router.patch("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: uuid.UUID,
    request: MachineUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(machine, field, value)
    
    await db.commit()
    await db.refresh(machine)
    return machine


@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine(
    machine_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    machine = result.scalar_one_or_none()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    await db.delete(machine)
    await db.commit()