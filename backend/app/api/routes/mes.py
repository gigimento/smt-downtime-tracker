from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from app.database import get_db
from app.models.downtime import DowntimeEvent, DowntimeCategory, DowntimeSource
from app.models.machine import Machine
from app.models.user import User, UserRole
from app.schemas.mes import MESDowntimeEvent, MESDowntimeResponse
from app.services.telegram import send_downtime_alert
from app.services.shift_detector import detect_category_async
from app.config import settings
import json

router = APIRouter(prefix="/mes", tags=["mes"])
mes_api_key_header = APIKeyHeader(name="X-MES-API-Key", auto_error=False)


async def require_mes_api_key(api_key: str | None = Depends(mes_api_key_header)) -> None:
    if not settings.ENABLE_MES_ENDPOINT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MES endpoint is disabled")

    if settings.MES_API_KEY and api_key != settings.MES_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MES API key")


@router.post("/downtime", response_model=MESDowntimeResponse)
async def create_mes_downtime(
    request: MESDowntimeEvent,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_mes_api_key),
):
    # Find machine by code
    result = await db.execute(select(Machine).where(Machine.code == request.machine_code))
    machine = result.scalar_one_or_none()
    if not machine or not machine.is_active:
        raise HTTPException(status_code=404, detail="Machine not found or inactive")
    
    # Check for duplicate mes_event_id
    result = await db.execute(
        select(DowntimeEvent).where(DowntimeEvent.mes_event_id == request.mes_event_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="MES event ID already exists")
    
    # For MES events, we need a system user or the machine's default operator
    # Create a "system" user if not exists, or use first active user
    result = await db.execute(select(User).where(User.badge_code == "MES_SYSTEM"))
    system_user = result.scalar_one_or_none()
    if not system_user:
        system_user = User(
            badge_code="MES_SYSTEM",
            full_name="MES Simulator",
            role=UserRole.OPERATOR,
            is_active=True,
        )
        db.add(system_user)
        await db.flush()
    
    # Auto-detect shift with admin override
    auto_category = await detect_category_async(datetime.utcnow())
    final_category = (
        auto_category if auto_category and request.category == DowntimeCategory.UNPLANNED_OTHER
        else request.category
    )

    # Create downtime event
    downtime = DowntimeEvent(
        machine_id=machine.id,
        opened_by_user_id=system_user.id,
        category=final_category,
        sub_category=request.sub_category,
        problem_description=request.problem_description,
        mes_event_id=request.mes_event_id,
        source=request.source,
    )
    db.add(downtime)
    await db.flush()
    
    # Audit log
    from app.models.audit import AuditLog, AuditAction
    audit = AuditLog(
        entity_type="downtime_event",
        entity_id=downtime.id,
        action=AuditAction.OPEN,
        user_id=system_user.id,
        user_name="MES Simulator",
        changes=json.dumps({
            "machine_code": machine.code,
            "category": request.category.value,
            "sub_category": request.sub_category,
            "problem_description": request.problem_description,
            "mes_event_id": request.mes_event_id,
        }),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(downtime)
    
    # Send Telegram alert
    await send_downtime_alert(downtime, machine, system_user, db)
    
    return MESDowntimeResponse(
        success=True,
        downtime_id=str(downtime.id),
        message="Downtime event created successfully"
    )


@router.get("/status")
async def mes_status():
    return {"status": "ok", "service": "mes-downtime-endpoint", "enabled": settings.ENABLE_MES_ENDPOINT}
