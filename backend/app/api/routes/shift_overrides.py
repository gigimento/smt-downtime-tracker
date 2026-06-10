"""
Admin endpoints for ShiftOverride - manage work hours by date.
Only admin role can create/modify overrides.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc
from typing import Optional
from datetime import date
import uuid

from app.database import get_db
from app.core.dependencies import get_current_active_user, require_admin
from app.models.user import User
from app.models.shift import ShiftOverride
from app.models.audit import AuditLog, AuditAction
from app.schemas.shift import ShiftOverrideCreate, ShiftOverrideUpdate, ShiftOverrideResponse
import json

router = APIRouter(prefix="/shift-overrides", tags=["shift-overrides"])


@router.get("", response_model=list[ShiftOverrideResponse])
async def list_overrides(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all overrides (optionally filtered by date range)."""
    query = select(ShiftOverride)
    conditions = []
    if date_from:
        conditions.append(ShiftOverride.date >= date_from)
    if date_to:
        conditions.append(ShiftOverride.date <= date_to)
    if conditions:
        query = query.where(and_(*conditions))
    query = query.order_by(desc(ShiftOverride.date))
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/check/{target_date}")
async def check_override(
    target_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Check what the system thinks about a given date.
    Returns override if exists + auto-detection info.
    """
    result = await db.execute(
        select(ShiftOverride).where(ShiftOverride.date == target_date)
    )
    override = result.scalar_one_or_none()

    from app.services.shift_detector import _is_weekend, _get_default_work_hours
    from datetime import datetime
    dt = datetime.combine(target_date, datetime.min.time())
    is_weekend = _is_weekend(dt)
    work_start, work_end = _get_default_work_hours()

    return {
        "date": target_date.isoformat(),
        "day_of_week": dt.strftime("%A"),
        "is_weekend": is_weekend,
        "default_work_hours": {"start": work_start, "end": work_end},
        "override": ShiftOverrideResponse.model_validate(override) if override else None,
        "effective_category": (
            "weekend" if is_weekend else None
        ),
    }


@router.post("", response_model=ShiftOverrideResponse, status_code=status.HTTP_201_CREATED)
async def create_override(
    request: ShiftOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create shift override (admin only)."""
    # Check if already exists for that date
    result = await db.execute(
        select(ShiftOverride).where(ShiftOverride.date == request.date)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Override for date {request.date} already exists. Use PATCH to update."
        )

    override = ShiftOverride(
        **request.model_dump(),
        created_by_user_id=current_user.id,
    )
    db.add(override)

    audit = AuditLog(
        entity_type="shift_override",
        entity_id=override.id,
        action=AuditAction.CREATE,
        user_id=current_user.id,
        user_name=current_user.full_name,
        changes=json.dumps({"created": request.model_dump(mode="json")}, default=str),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(override)
    return override


@router.patch("/{override_id}", response_model=ShiftOverrideResponse)
async def update_override(
    override_id: uuid.UUID,
    request: ShiftOverrideUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update existing override (admin only)."""
    result = await db.execute(
        select(ShiftOverride).where(ShiftOverride.id == override_id)
    )
    override = result.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")

    old_values = {
        "override_type": override.override_type,
        "work_start": str(override.work_start) if override.work_start else None,
        "work_end": str(override.work_end) if override.work_end else None,
        "note": override.note,
    }

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(override, field, value)

    audit = AuditLog(
        entity_type="shift_override",
        entity_id=override.id,
        action=AuditAction.UPDATE,
        user_id=current_user.id,
        user_name=current_user.full_name,
        changes=json.dumps({
            "old": old_values,
            "new": update_data,
        }, default=str),
    )
    db.add(audit)

    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_override(
    override_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete override (admin only)."""
    result = await db.execute(
        select(ShiftOverride).where(ShiftOverride.id == override_id)
    )
    override = result.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")

    audit = AuditLog(
        entity_type="shift_override",
        entity_id=override.id,
        action=AuditAction.DELETE,
        user_id=current_user.id,
        user_name=current_user.full_name,
        changes=json.dumps({
            "deleted": {
                "date": override.date.isoformat(),
                "override_type": override.override_type,
            }
        }),
    )
    db.add(audit)

    await db.delete(override)
    await db.commit()


# --- Shift Planning endpoints ---

@router.get("/plan/preview")
async def preview_plan(
    year: int = Query(..., ge=2020, le=2030),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_active_user),
):
    """Preview month plan - what would be generated."""
    from app.services.shift_planner import preview_month_plan
    return await preview_month_plan(year, month)


@router.get("/plan/holidays")
async def get_holidays(
    year: int = Query(..., ge=2020, le=2030),
    current_user: User = Depends(get_current_active_user),
):
    """Returns list of Serbian holidays for the year."""
    from app.services.serbian_holidays import get_serbian_holidays
    holidays = get_serbian_holidays(year)
    return [
        {"date": h["date"].isoformat(), "name": h["name"]}
        for h in holidays
    ]


@router.post("/plan/apply")
async def apply_plan(
    year: int = Query(..., ge=2020, le=2030),
    month: int = Query(..., ge=1, le=12),
    include_holidays: bool = Query(True),
    dry_run: bool = Query(False),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate ShiftOverride entries for all non-working days in month."""
    from app.services.shift_planner import apply_month_plan
    return await apply_month_plan(
        year=year,
        month=month,
        user_id=current_user.id,
        include_holidays=include_holidays,
        dry_run=dry_run,
    )
