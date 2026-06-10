"""
WebSocket endpoint for real-time push of active downtimes and notifications.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models.downtime import DowntimeEvent
from app.models.user import User
from app.models.machine import Machine
from app.core.security import verify_token
from app.services.websocket_manager import get_manager
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


async def _build_active_payload() -> dict:
    """Build current active downtimes payload."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DowntimeEvent, User, Machine)
            .join(User, User.id == DowntimeEvent.opened_by_user_id)
            .join(Machine, Machine.id == DowntimeEvent.machine_id)
            .where(DowntimeEvent.resolved_at.is_(None))
            .order_by(DowntimeEvent.started_at)
        )
        items = []
        for dt, user, machine in result.all():
            elapsed = int((datetime.utcnow() - dt.started_at).total_seconds())
            items.append({
                "id": str(dt.id),
                "machine_code": machine.code,
                "category": dt.category.value,
                "sub_category": dt.sub_category,
                "problem_description": dt.problem_description,
                "started_at": dt.started_at.isoformat(),
                "elapsed_seconds": elapsed,
                "opened_by_name": user.full_name,
                "is_acknowledged": dt.acknowledged_at is not None,
            })
    return {"type": "active_update", "items": items, "count": len(items)}


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(None),
):
    """WebSocket endpoint. Pass ?token=<JWT> for auth."""
    if not token:
        await websocket.close(code=4001)
        return

    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    manager = get_manager()
    await manager.connect(websocket)

    # Send initial snapshot
    try:
        snapshot = await _build_active_payload()
        await websocket.send_json(snapshot)
    except Exception as e:
        logger.error(f"Failed to send initial snapshot: {e}")

    # Keep connection alive and listen for client pings
    try:
        while True:
            try:
                # Wait for client message (e.g., ping or request_refresh)
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_json({"type": "pong", "ts": datetime.utcnow().isoformat()})
                elif msg == "refresh":
                    snapshot = await _build_active_payload()
                    await websocket.send_json(snapshot)
            except asyncio.TimeoutError:
                # Send keepalive
                try:
                    await websocket.send_json({"type": "keepalive"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error: {e}")
    finally:
        await manager.disconnect(websocket)


async def broadcast_downtime_change(event_type: str, downtime_id: str = None, extra: dict = None):
    """Helper to broadcast a downtime change to all clients."""
    manager = get_manager()
    message = {"type": event_type, "downtime_id": downtime_id, **(extra or {})}
    if event_type in ("downtime_opened", "downtime_closed", "downtime_acknowledged"):
        # Include fresh snapshot (without overwriting our event_type)
        snapshot = await _build_active_payload()
        # Remove type from snapshot to avoid clobbering
        snapshot.pop("type", None)
        message.update(snapshot)
    logger.info(f"WS broadcast: type={message.get('type')}, downtime_id={downtime_id}, items={len(message.get('items', []))}")
    await manager.broadcast(message)
