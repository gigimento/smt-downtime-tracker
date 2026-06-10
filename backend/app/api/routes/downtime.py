from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import selectinload
from typing import Optional
import uuid
from datetime import datetime, timedelta
from app.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.core.security import verify_password
from app.models.user import User, UserRole
from app.models.downtime import DowntimeEvent, DowntimeCategory, DowntimeSource
from app.models.machine import Machine
from app.models.audit import AuditLog, AuditAction
from app.schemas.downtime import (
    DowntimeOpen, DowntimeClose, DowntimeResponse, DowntimeListItem,
    DowntimeFilter, KPIMonthlyResponse, KPICategoryStat, KPITopCause
)
from app.services.telegram import send_downtime_alert, send_downtime_closed_notification
from app.services.escalation import cleanup_resolved
from app.services.shift_detector import detect_category_async
from app.api.routes.websocket import broadcast_downtime_change
import json

router = APIRouter(prefix="/downtime", tags=["downtime"])


def format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    else:
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        return f"{hours}h {minutes}m"


@router.post("/open", response_model=DowntimeResponse, status_code=status.HTTP_201_CREATED)
async def open_downtime(
    request: DowntimeOpen,
    db: AsyncSession = Depends(get_db),
):
    # Find user by badge_code
    result = await db.execute(select(User).where(User.badge_code == request.badge_code))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Operator not found or inactive")

    # Find machine by code
    result = await db.execute(select(Machine).where(Machine.code == request.machine_code))
    machine = result.scalar_one_or_none()
    if not machine or not machine.is_active:
        raise HTTPException(status_code=404, detail="Machine not found or inactive")

    # Auto-detect shift category with admin override support
    auto_category = await detect_category_async(datetime.utcnow())
    if auto_category and request.category == DowntimeCategory.UNPLANNED_OTHER:
        # Only auto-override if the operator chose "other" (catch-all)
        final_category = auto_category
    else:
        final_category = request.category

    # Create downtime event
    downtime = DowntimeEvent(
        machine_id=machine.id,
        opened_by_user_id=user.id,
        category=final_category,
        sub_category=request.sub_category,
        problem_description=request.problem_description,
        source=DowntimeSource.MANUAL,
    )
    db.add(downtime)
    await db.flush()
    
    # Audit log
    audit = AuditLog(
        entity_type="downtime_event",
        entity_id=downtime.id,
        action=AuditAction.OPEN,
        user_id=user.id,
        user_name=user.full_name,
        changes=json.dumps({
            "machine_code": machine.code,
            "category": request.category.value,
            "sub_category": request.sub_category,
            "problem_description": request.problem_description,
        }),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(downtime)
    
    # Send Telegram alert (background)
    await send_downtime_alert(downtime, machine, user, db)

    # Broadcast to WebSocket clients
    await broadcast_downtime_change("downtime_opened", str(downtime.id))

    return await _build_downtime_response(downtime, machine, user, None, db)


@router.get("/active", response_model=list[DowntimeListItem])
async def get_active_downtimes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DowntimeEvent)
        .options(
            selectinload(DowntimeEvent.machine),
            selectinload(DowntimeEvent.opened_by)
        )
        .where(DowntimeEvent.resolved_at.is_(None))
        .order_by(DowntimeEvent.started_at)
    )
    downtimes = result.scalars().all()
    
    return [
        DowntimeListItem(
            id=dt.id,
            machine_code=dt.machine.code,
            machine_name=dt.machine.name,
            line=dt.machine.line,
            opened_by_name=dt.opened_by.full_name,
            category=dt.category,
            sub_category=dt.sub_category,
            problem_description=dt.problem_description,
            started_at=dt.started_at,
            duration_seconds=dt.duration_seconds,
            duration_formatted=format_duration(dt.duration_seconds),
            is_active=True,
        )
        for dt in downtimes
    ]


@router.get("/history", response_model=list[DowntimeListItem])
async def get_downtime_history(
    filter: DowntimeFilter = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    query = select(DowntimeEvent).options(selectinload(DowntimeEvent.machine), selectinload(DowntimeEvent.opened_by))
    
    conditions = []
    if filter.only_active:
        conditions.append(DowntimeEvent.resolved_at.is_(None))
    else:
        conditions.append(DowntimeEvent.resolved_at.is_not(None))
    
    if filter.machine_id:
        conditions.append(DowntimeEvent.machine_id == filter.machine_id)
    if filter.category:
        conditions.append(DowntimeEvent.category == filter.category)
    if filter.sub_category:
        conditions.append(DowntimeEvent.sub_category.ilike(f"%{filter.sub_category}%"))
    if filter.opened_by_user_id:
        conditions.append(DowntimeEvent.opened_by_user_id == filter.opened_by_user_id)
    if filter.date_from:
        conditions.append(DowntimeEvent.started_at >= filter.date_from)
    if filter.date_to:
        conditions.append(DowntimeEvent.started_at <= filter.date_to)
    
    if conditions:
        query = query.where(and_(*conditions))
    
    query = query.order_by(desc(DowntimeEvent.started_at))
    query = query.offset((filter.page - 1) * filter.page_size).limit(filter.page_size)
    
    result = await db.execute(query)
    downtimes = result.scalars().all()
    
    return [
        DowntimeListItem(
            id=dt.id,
            machine_code=dt.machine.code,
            machine_name=dt.machine.name,
            line=dt.machine.line,
            opened_by_name=dt.opened_by.full_name,
            category=dt.category,
            sub_category=dt.sub_category,
            problem_description=dt.problem_description,
            started_at=dt.started_at,
            duration_seconds=dt.duration_seconds,
            duration_formatted=format_duration(dt.duration_seconds),
            is_active=dt.resolved_at is None,
        )
        for dt in downtimes
    ]


@router.get("/{downtime_id}", response_model=DowntimeResponse)
async def get_downtime(
    downtime_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DowntimeEvent)
        .options(
            selectinload(DowntimeEvent.machine),
            selectinload(DowntimeEvent.opened_by),
            selectinload(DowntimeEvent.closed_by),
        )
        .where(DowntimeEvent.id == downtime_id)
    )
    downtime = result.scalar_one_or_none()
    if not downtime:
        raise HTTPException(status_code=404, detail="Downtime not found")
    
    return await _build_downtime_response(downtime, downtime.machine, downtime.opened_by, downtime.closed_by, db)


@router.post("/{downtime_id}/acknowledge", response_model=DowntimeResponse)
async def acknowledge_downtime(
    downtime_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DowntimeEvent)
        .options(selectinload(DowntimeEvent.machine), selectinload(DowntimeEvent.opened_by))
        .where(DowntimeEvent.id == downtime_id)
    )
    downtime = result.scalar_one_or_none()
    if not downtime:
        raise HTTPException(status_code=404, detail="Downtime not found")
    
    if downtime.acknowledged_at:
        raise HTTPException(status_code=400, detail="Already acknowledged")
    
    downtime.acknowledged_at = datetime.utcnow()
    
    audit = AuditLog(
        entity_type="downtime_event",
        entity_id=downtime.id,
        action=AuditAction.ACKNOWLEDGE,
        user_id=current_user.id,
        user_name=current_user.full_name,
    )
    db.add(audit)
    await db.commit()
    await db.refresh(downtime)

    # Broadcast to WebSocket clients
    await broadcast_downtime_change("downtime_acknowledged", str(downtime.id))

    return await _build_downtime_response(downtime, downtime.machine, downtime.opened_by, None, db)


@router.post("/{downtime_id}/close", response_model=DowntimeResponse)
async def close_downtime(
    downtime_id: uuid.UUID,
    request: DowntimeClose,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DowntimeEvent)
        .options(selectinload(DowntimeEvent.machine), selectinload(DowntimeEvent.opened_by))
        .where(DowntimeEvent.id == downtime_id)
    )
    downtime = result.scalar_one_or_none()
    if not downtime:
        raise HTTPException(status_code=404, detail="Downtime not found")
    
    if downtime.resolved_at:
        raise HTTPException(status_code=400, detail="Already closed")
    
    # Validate closure code: team PIN or personal PIN
    code_valid = False
    if current_user.pin_code and verify_password(request.closure_code, current_user.pin_code):
        code_valid = True
    elif current_user.team and current_user.team.pin_code and verify_password(request.closure_code, current_user.team.pin_code):
        code_valid = True
    
    if not code_valid:
        raise HTTPException(status_code=403, detail="Invalid closure code")
    
    # Check authorization: only responsible team can close
    responsible_teams = _get_responsible_teams(downtime.category)
    user_team_code = current_user.team.code if current_user.team else None
    if user_team_code not in responsible_teams and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail=f"Only {', '.join(responsible_teams)} can close this category"
        )
    
    downtime.resolved_at = datetime.utcnow()
    downtime.closed_by_user_id = current_user.id
    downtime.closure_code = request.closure_code
    downtime.closure_comment = request.closure_comment
    downtime.duration_seconds = int((downtime.resolved_at - downtime.started_at).total_seconds())
    
    audit = AuditLog(
        entity_type="downtime_event",
        entity_id=downtime.id,
        action=AuditAction.CLOSE,
        user_id=current_user.id,
        user_name=current_user.full_name,
        changes=json.dumps({
            "closure_comment": request.closure_comment,
            "duration_seconds": downtime.duration_seconds,
        }),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(downtime)

    # Cleanup escalation state
    cleanup_resolved(str(downtime.id))

    # Send Telegram closed notification (background)
    await send_downtime_closed_notification(downtime, downtime.machine, current_user)

    # Broadcast to WebSocket clients
    await broadcast_downtime_change("downtime_closed", str(downtime.id))

    return await _build_downtime_response(downtime, downtime.machine, downtime.opened_by, current_user, db)


@router.get("/kpi/monthly", response_model=KPIMonthlyResponse)
async def get_monthly_kpi(
    year: int = Query(None, ge=2020, le=2030),
    month: int = Query(None, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    now = datetime.utcnow()
    year = year or now.year
    month = month or now.month
    
    period_start = datetime(year, month, 1)
    if month == 12:
        period_end = datetime(year + 1, 1, 1)
    else:
        period_end = datetime(year, month + 1, 1)
    
    # Base query for closed events in period (exclude free_shift and weekend from KPI)
    base_query = select(DowntimeEvent).where(
        and_(
            DowntimeEvent.started_at >= period_start,
            DowntimeEvent.started_at < period_end,
            DowntimeEvent.resolved_at.is_not(None),
            DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
        )
    )
    
    # Total downtime hours
    result = await db.execute(
        select(func.sum(DowntimeEvent.duration_seconds)).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
            )
        )
    )
    total_seconds = result.scalar() or 0
    total_hours = total_seconds / 3600.0
    
    # Total events
    result = await db.execute(
        select(func.count(DowntimeEvent.id)).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
            )
        )
    )
    total_events = result.scalar() or 0
    
    # By category
    result = await db.execute(
        select(
            DowntimeEvent.category,
            func.count(DowntimeEvent.id),
            func.sum(DowntimeEvent.duration_seconds)
        ).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
            )
        ).group_by(DowntimeEvent.category)
    )
    by_category = [
        KPICategoryStat(
            category=cat,
            count=cnt,
            total_hours=secs / 3600.0,
            percentage=(secs / total_seconds * 100) if total_seconds > 0 else 0
        )
        for cat, cnt, secs in result.all()
    ]
    
    # Top causes (sub_category)
    result = await db.execute(
        select(
            DowntimeEvent.sub_category,
            func.count(DowntimeEvent.id),
            func.sum(DowntimeEvent.duration_seconds)
        ).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
                DowntimeEvent.sub_category.is_not(None),
            )
        ).group_by(DowntimeEvent.sub_category).order_by(func.sum(DowntimeEvent.duration_seconds).desc()).limit(10)
    )
    top_causes = [
        KPITopCause(sub_category=sub, count=cnt, total_hours=secs / 3600.0)
        for sub, cnt, secs in result.all()
    ]
    
    # By machine
    result = await db.execute(
        select(
            Machine.code,
            Machine.name,
            func.count(DowntimeEvent.id),
            func.sum(DowntimeEvent.duration_seconds)
        ).join(Machine).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
            )
        ).group_by(Machine.code, Machine.name).order_by(func.sum(DowntimeEvent.duration_seconds).desc())
    )
    by_machine = [
        {"code": code, "name": name, "count": cnt, "total_hours": secs / 3600.0}
        for code, name, cnt, secs in result.all()
    ]
    
    # By line
    result = await db.execute(
        select(
            Machine.line,
            func.count(DowntimeEvent.id),
            func.sum(DowntimeEvent.duration_seconds)
        ).join(Machine).where(
            and_(
                DowntimeEvent.started_at >= period_start,
                DowntimeEvent.started_at < period_end,
                DowntimeEvent.resolved_at.is_not(None),
                DowntimeEvent.category.not_in([DowntimeCategory.FREE_SHIFT, DowntimeCategory.WEEKEND]),
                Machine.line.is_not(None),
            )
        ).group_by(Machine.line).order_by(func.sum(DowntimeEvent.duration_seconds).desc())
    )
    by_line = [
        {"line": line, "count": cnt, "total_hours": secs / 3600.0}
        for line, cnt, secs in result.all()
    ]
    
    # Availability loss based on work schedule (not 24/7)
    # Calculate total available work hours in period
    from app.config import settings
    work_days_in_period = 0
    current_date = period_start
    while current_date < period_end:
        if current_date.weekday() in settings.WORK_DAYS:
            work_days_in_period += 1
        current_date = current_date + __import__('datetime').timedelta(days=1)
    
    work_hours_per_day = settings.WORK_DAY_END_HOUR - settings.WORK_DAY_START_HOUR
    total_available_hours = work_days_in_period * work_hours_per_day
    total_available_seconds = total_available_hours * 3600
    
    availability_loss = (total_seconds / total_available_seconds * 100) if total_available_seconds > 0 else 0
    
    return KPIMonthlyResponse(
        period_start=period_start,
        period_end=period_end,
        total_downtime_hours=total_hours,
        total_events=total_events,
        availability_loss_pct=availability_loss,
        by_category=by_category,
        top_causes=top_causes,
        by_machine=by_machine,
        by_line=by_line,
    )


async def _build_downtime_response(
    downtime: DowntimeEvent,
    machine: Machine,
    opened_by: User,
    closed_by: User | None,
    db: AsyncSession,
) -> DowntimeResponse:
    return DowntimeResponse(
        id=downtime.id,
        machine_id=machine.id,
        machine_code=machine.code,
        machine_name=machine.name,
        line=machine.line,
        opened_by_user_id=opened_by.id,
        opened_by_name=opened_by.full_name,
        opened_by_badge=opened_by.badge_code,
        closed_by_user_id=closed_by.id if closed_by else None,
        closed_by_name=closed_by.full_name if closed_by else None,
        category=downtime.category,
        sub_category=downtime.sub_category,
        problem_description=downtime.problem_description,
        started_at=downtime.started_at,
        acknowledged_at=downtime.acknowledged_at,
        resolved_at=downtime.resolved_at,
        duration_seconds=downtime.duration_seconds,
        duration_formatted=format_duration(downtime.duration_seconds),
        closure_code=downtime.closure_code,
        closure_comment=downtime.closure_comment,
        mes_event_id=downtime.mes_event_id,
        source=downtime.source,
        is_active=downtime.resolved_at is None,
    )


def _get_responsible_teams(category: DowntimeCategory) -> list[str]:
    mapping = {
        DowntimeCategory.MACHINE_FAULT: ["MAINT", "PROCESS"],
        DowntimeCategory.MATERIAL_SHORTAGE: ["PROD"],
        DowntimeCategory.PROGRAM_SETUP: ["PROCESS"],
        DowntimeCategory.PLANNED_MAINTENANCE: ["MAINT"],
        DowntimeCategory.QUALITY_ISSUE: ["QUALITY"],
        DowntimeCategory.FREE_SHIFT: ["PLANNER"],
        DowntimeCategory.WEEKEND: ["PLANNER"],
        DowntimeCategory.UNPLANNED_OTHER: ["PROCESS"],
    }
    return mapping.get(category, ["PROCESS"])