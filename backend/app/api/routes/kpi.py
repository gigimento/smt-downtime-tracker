from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.downtime import DowntimeEvent, DowntimeCategory
from app.models.machine import Machine

router = APIRouter(prefix="/kpi", tags=["kpi"])


@router.get("/daily")
async def get_daily_kpi(
    date: str = Query(None, description="YYYY-MM-DD format"),
    line: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    target_date = datetime.strptime(date, "%Y-%m-%d") if date else datetime.utcnow().date()
    period_start = datetime.combine(target_date, datetime.min.time())
    period_end = period_start + timedelta(days=1)
    
    conditions = [
        DowntimeEvent.started_at >= period_start,
        DowntimeEvent.started_at < period_end,
        DowntimeEvent.resolved_at.is_not(None),
        DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
    ]
    
    if line:
        conditions.append(Machine.line == line)
    
    query = select(
        DowntimeEvent.category,
        func.count(DowntimeEvent.id),
        func.sum(DowntimeEvent.duration_seconds)
    ).join(Machine).where(and_(*conditions)).group_by(DowntimeEvent.category)
    
    result = await db.execute(query)
    data = result.all()
    
    total_seconds = sum(d[2] or 0 for d in data)
    
    return {
        "date": target_date.isoformat(),
        "total_hours": total_seconds / 3600.0,
        "total_events": sum(d[1] for d in data),
        "by_category": [
            {"category": d[0].value, "count": d[1], "hours": (d[2] or 0) / 3600.0}
            for d in data
        ],
    }


@router.get("/shift")
async def get_shift_kpi(
    date: str = Query(..., description="YYYY-MM-DD format"),
    shift: str = Query(..., pattern="^(1|2|3)$"),
    line: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Shift times: 1=06:00-14:00, 2=14:00-22:00, 3=22:00-06:00
    target_date = datetime.strptime(date, "%Y-%m-%d")
    shift_start_hour = {1: 6, 2: 14, 3: 22}[int(shift)]
    shift_end_hour = {1: 14, 2: 22, 3: 6}[int(shift)]
    
    period_start = target_date.replace(hour=shift_start_hour, minute=0, second=0)
    if shift == 3:
        period_end = (target_date + timedelta(days=1)).replace(hour=shift_end_hour, minute=0, second=0)
    else:
        period_end = target_date.replace(hour=shift_end_hour, minute=0, second=0)
    
    conditions = [
        DowntimeEvent.started_at >= period_start,
        DowntimeEvent.started_at < period_end,
        DowntimeEvent.resolved_at.is_not(None),
        DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
    ]
    
    if line:
        conditions.append(Machine.line == line)
    
    query = select(
        DowntimeEvent.category,
        func.count(DowntimeEvent.id),
        func.sum(DowntimeEvent.duration_seconds)
    ).join(Machine).where(and_(*conditions)).group_by(DowntimeEvent.category)
    
    result = await db.execute(query)
    data = result.all()
    
    total_seconds = sum(d[2] or 0 for d in data)
    shift_hours = 8  # 8 hours per shift
    
    return {
        "date": target_date.date().isoformat(),
        "shift": int(shift),
        "shift_hours": shift_hours,
        "total_hours": total_seconds / 3600.0,
        "availability_pct": max(0, 100 - (total_seconds / (shift_hours * 3600) * 100)),
        "total_events": sum(d[1] for d in data),
        "by_category": [
            {"category": d[0].value, "count": d[1], "hours": (d[2] or 0) / 3600.0}
            for d in data
        ],
    }


@router.get("/top-causes")
async def get_top_causes(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    line: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    period_start = datetime.utcnow() - timedelta(days=days)
    
    conditions = [
        DowntimeEvent.started_at >= period_start,
        DowntimeEvent.resolved_at.is_not(None),
        DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
        DowntimeEvent.sub_category.is_not(None),
    ]
    
    if line:
        conditions.append(Machine.line == line)
    
    query = select(
        DowntimeEvent.sub_category,
        DowntimeEvent.category,
        func.count(DowntimeEvent.id),
        func.sum(DowntimeEvent.duration_seconds)
    ).join(Machine).where(and_(*conditions)).group_by(
        DowntimeEvent.sub_category, DowntimeEvent.category
    ).order_by(func.sum(DowntimeEvent.duration_seconds).desc()).limit(limit)
    
    result = await db.execute(query)
    data = result.all()
    
    return {
        "period_days": days,
        "top_causes": [
            {
                "sub_category": d[0],
                "category": d[1].value,
                "count": d[2],
                "total_hours": (d[3] or 0) / 3600.0,
            }
            for d in data
        ],
    }