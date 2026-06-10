"""
Escalation - periodically checks active downtimes and sends escalations
via Telegram if no one has responded.
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.config import settings
from app.models.downtime import DowntimeEvent, DowntimeCategory
from app.models.user import Team
from app.services.telegram import _get_responsible_teams, bot

logger = logging.getLogger(__name__)

# Tracked escalations: {downtime_id: set of seconds-already-escalated}
_escalation_state: dict[str, set[int]] = {}
# {downtime_id: last known state (acknowledged/resolved)} -> for cancel


def _format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    elif seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    else:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m"


def _format_escalation_message(downtime, machine, opened_by, minutes_elapsed: int, level: int) -> str:
    """Format escalation alert."""
    level_emoji = "🟡" if level == 1 else "🟠" if level == 2 else "🔴"
    level_text = f"{minutes_elapsed} minutes"
    if level == 3:
        level_text = f"{minutes_elapsed}+ minutes (CRITICAL)"

    category_labels = {
        DowntimeCategory.MACHINE_FAULT: "🔧 Machine Fault",
        DowntimeCategory.MATERIAL_SHORTAGE: "📦 Material Shortage",
        DowntimeCategory.PROGRAM_SETUP: "💻 Program / Setup",
        DowntimeCategory.PLANNED_MAINTENANCE: "📅 Planned Maintenance",
        DowntimeCategory.QUALITY_ISSUE: "🔍 Quality Issue",
        DowntimeCategory.UNPLANNED_OTHER: "❓ Other",
    }
    cat_label = category_labels.get(downtime.category, downtime.category.value)

    return (
        f"{level_emoji} <b>ESCALATION - LEVEL {level}</b>\n\n"
        f"⏰ <b>Downtime ongoing: {level_text}</b>\n"
        f"🤖 <b>Machine:</b> {machine.code} – {machine.name}\n"
        f"📋 <b>Category:</b> {cat_label}\n"
        f"👤 <b>Reported by:</b> {opened_by.full_name}\n"
        f"🕒 <b>Started:</b> {downtime.started_at.strftime('%H:%M:%S')}\n\n"
        f"⚠️ <b>Urgent response required!</b>\n"
        f"🆔 <code>{str(downtime.id)[:8].upper()}</code>"
    )


async def _send_escalation(downtime, machine, opened_by, minutes_elapsed: int, level: int):
    """Send escalation alert to responsible teams + admins."""
    if not bot or not settings.TELEGRAM_FORUM_CHAT_ID:
        return

    # Get all teams that should be notified
    responsible_team_codes = _get_responsible_teams(downtime.category)
    # For escalation levels 2 and 3, also notify PROCESS
    if level >= 2 and "PROCESS" not in responsible_team_codes:
        responsible_team_codes.append("PROCESS")
    # For level 3, notify all teams
    if level >= 3:
        responsible_team_codes = ["MAINT", "PROCESS", "PROD", "QUALITY"]

    message = _format_escalation_message(downtime, machine, opened_by, minutes_elapsed, level)
    keyboard = None  # Escalations don't have buttons, just alert

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.code.in_(responsible_team_codes))
        )
        teams = result.scalars().all()

        for team in teams:
            if team.telegram_topic_id:
                try:
                    await bot.send_message(
                        chat_id=settings.TELEGRAM_FORUM_CHAT_ID,
                        message_thread_id=team.telegram_topic_id,
                        text=message,
                        parse_mode="HTML",
                    )
                    logger.info(f"Escalation L{level} sent to {team.code} for {downtime.id}")
                except Exception as e:
                    logger.error(f"Failed to send escalation to {team.code}: {e}")


async def check_escalations():
    """Check all active downtimes and send escalations if needed."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DowntimeEvent)
            .where(DowntimeEvent.resolved_at.is_(None))
        )
        active = result.scalars().all()

        now = datetime.utcnow()
        for dt in active:
            elapsed = int((now - dt.started_at).total_seconds())
            dt_id = str(dt.id)

            # Initialize tracking
            if dt_id not in _escalation_state:
                _escalation_state[dt_id] = set()

            sent_levels = _escalation_state[dt_id]

            # Skip if already acknowledged (no need to escalate)
            if dt.acknowledged_at:
                # Clean up state to free memory
                _escalation_state.pop(dt_id, None)
                continue

            # Check each escalation interval
            for level, threshold in enumerate(settings.ESCALATION_INTERVALS, start=1):
                if elapsed >= threshold and threshold not in sent_levels:
                    # Load related entities
                    from app.models.machine import Machine
                    from app.models.user import User

                    machine_res = await db.execute(select(Machine).where(Machine.id == dt.machine_id))
                    machine = machine_res.scalar_one_or_none()

                    user_res = await db.execute(select(User).where(User.id == dt.opened_by_user_id))
                    opened_by = user_res.scalar_one_or_none()

                    if machine and opened_by:
                        minutes = elapsed // 60
                        await _send_escalation(dt, machine, opened_by, minutes, level)
                        sent_levels.add(threshold)

            # Cleanup if resolved (caller should call cleanup_resolved)
            if dt.resolved_at:
                _escalation_state.pop(dt_id, None)


def cleanup_resolved(downtime_id: str):
    """Remove tracking for a resolved downtime."""
    _escalation_state.pop(str(downtime_id), None)


async def escalation_worker():
    """Background worker that runs every ESCALATION_CHECK_INTERVAL seconds."""
    logger.info("Escalation worker started")
    while True:
        try:
            await check_escalations()
        except Exception as e:
            logger.error(f"Escalation worker error: {e}")
        await asyncio.sleep(settings.ESCALATION_CHECK_INTERVAL)


_worker_task: Optional[asyncio.Task] = None


async def start_escalation_worker():
    """Start the escalation worker as a background task."""
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(escalation_worker())
        logger.info("Escalation worker scheduled")
