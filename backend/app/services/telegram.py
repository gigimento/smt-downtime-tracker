import asyncio
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from app.config import settings
from app.models.downtime import DowntimeEvent, DowntimeCategory
from app.models.machine import Machine
from app.models.user import User, Team

logger = logging.getLogger(__name__)

# Global bot instance
bot: Optional[Bot] = None
dp = Dispatcher()


async def init_telegram_bot():
    """Initialize Telegram bot."""
    global bot
    if settings.TELEGRAM_BOT_TOKEN:
        bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
        logger.info("Telegram bot initialized")
    else:
        logger.warning("Telegram bot token not configured")


async def close_telegram_bot():
    """Close Telegram bot session."""
    global bot
    if bot:
        await bot.session.close()
        bot = None


async def send_downtime_alert(
    downtime: DowntimeEvent,
    machine: Machine,
    opened_by: User,
    db: AsyncSession,
):
    """Send Telegram alert for new downtime event."""
    if not bot or not settings.TELEGRAM_FORUM_CHAT_ID:
        logger.warning("Telegram bot not configured, skipping alert")
        return

    # Get responsible teams for this category
    responsible_teams = _get_responsible_teams(downtime.category)
    if not responsible_teams:
        return  # No alert needed (free_shift, weekend)

    # Get topic IDs for responsible teams
    result = await db.execute(
        select(Team).where(Team.code.in_(responsible_teams))
    )
    teams = result.scalars().all()

    category_labels = {
        DowntimeCategory.MACHINE_FAULT: "🔧 Machine Fault",
        DowntimeCategory.MATERIAL_SHORTAGE: "📦 Material Shortage",
        DowntimeCategory.PROGRAM_SETUP: "💻 Program / Setup",
        DowntimeCategory.PLANNED_MAINTENANCE: "📅 Planned Maintenance",
        DowntimeCategory.QUALITY_ISSUE: "🔍 Quality Issue",
        DowntimeCategory.FREE_SHIFT: "⏸ Free Shift",
        DowntimeCategory.WEEKEND: "🗓 Weekend",
        DowntimeCategory.UNPLANNED_OTHER: "❓ Other",
    }

    category_label = category_labels.get(downtime.category, downtime.category.value)
    sub_cat = f" ({downtime.sub_category.replace('_', ' ')})" if downtime.sub_category else ""
    desc = f"\n📝 {downtime.problem_description}" if downtime.problem_description else ""

    teams_str = " + ".join([t.name for t in teams]) if teams else "Unknown"

    message = (
        f"🔴 <b>DOWNTIME OPENED</b>\n\n"
        f"🏭 <b>Line:</b> {machine.line or 'N/A'}\n"
        f"🤖 <b>Machine:</b> {machine.code} – {machine.name}\n"
        f"📋 <b>Category:</b> {category_label}{sub_cat}\n"
        f"👤 <b>Operator:</b> {opened_by.full_name}\n"
        f"⏰ <b>Time:</b> {downtime.started_at.strftime('%d.%m.%Y %H:%M:%S')}"
        f"{desc}\n\n"
        f"👥 <b>Responsible team:</b> {teams_str}\n"
        f"🆔 <code>{str(downtime.id)[:8].upper()}</code>"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="✅ Acknowledge",
                callback_data=f"ack_{downtime.id}"
            ),
        ]
    ])

    # Send to each responsible team's topic
    for team in teams:
        if team.telegram_topic_id:
            try:
                await bot.send_message(
                    chat_id=settings.TELEGRAM_FORUM_CHAT_ID,
                    message_thread_id=team.telegram_topic_id,
                    text=message,
                    parse_mode="HTML",
                    reply_markup=keyboard,
                )
                logger.info(f"Alert sent to team {team.code} (topic {team.telegram_topic_id})")
            except Exception as e:
                logger.error(f"Failed to send alert to team {team.code}: {e}")
        else:
            logger.warning(f"Team {team.code} has no telegram_topic_id configured")


async def send_downtime_closed_notification(
    downtime: DowntimeEvent,
    machine: Machine,
    closed_by: User,
):
    """Send notification when downtime is closed."""
    if not bot or not settings.TELEGRAM_FORUM_CHAT_ID:
        return

    duration_min = downtime.duration_seconds // 60
    duration_sec = downtime.duration_seconds % 60
    duration_str = f"{duration_min}m {duration_sec}s" if duration_min > 0 else f"{duration_sec}s"

    message = (
        f"✅ <b>DOWNTIME CLOSED</b>\n\n"
        f"🤖 <b>Machine:</b> {machine.code} – {machine.name}\n"
        f"⏱ <b>Total duration:</b> {duration_str}\n"
        f"👤 <b>Closed by:</b> {closed_by.full_name}\n"
        f"💬 <b>Comment:</b> {downtime.closure_comment or 'No comment'}\n"
        f"🆔 <code>{str(downtime.id)[:8].upper()}</code>"
    )

    # Get responsible teams to notify them it's resolved
    responsible_teams = _get_responsible_teams(downtime.category)
    if not responsible_teams:
        return

    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Team).where(Team.code.in_(responsible_teams))
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
                except Exception as e:
                    logger.error(f"Failed to send close notification to {team.code}: {e}")


def _get_responsible_teams(category: DowntimeCategory) -> list[str]:
    mapping = {
        DowntimeCategory.MACHINE_FAULT: ["MAINT", "PROCESS"],
        DowntimeCategory.MATERIAL_SHORTAGE: ["PROD"],
        DowntimeCategory.PROGRAM_SETUP: ["PROCESS"],
        DowntimeCategory.PLANNED_MAINTENANCE: ["MAINT"],
        DowntimeCategory.QUALITY_ISSUE: ["QUALITY"],
        DowntimeCategory.FREE_SHIFT: [],
        DowntimeCategory.WEEKEND: [],
        DowntimeCategory.UNPLANNED_OTHER: ["PROCESS"],
    }
    return mapping.get(category, ["PROCESS"])


# Message handler to log topic IDs
@dp.message()
async def log_message(message: types.Message):
    """Log incoming messages to get topic IDs."""
    logger.warning(f"Message received: chat_id={message.chat.id}, thread_id={message.message_thread_id}, text={message.text}, type={message.content_type}")


# Catch-all handler for debugging
@dp.update()
async def log_all_updates(update: types.Update):
    """Log all updates for debugging."""
    logger.warning(f"Update received: {update.model_dump_json(exclude_none=True)[:500]}")


# Callback handlers for inline buttons
@dp.callback_query(lambda c: c.data.startswith("ack_"))
async def handle_acknowledge(callback: types.CallbackQuery):
    """Handle acknowledge button press - writes to database."""
    import uuid
    from app.database import AsyncSessionLocal
    from app.models.audit import AuditLog, AuditAction

    raw_id = callback.data.split("_", 1)[1]
    try:
        downtime_id = uuid.UUID(raw_id)
    except ValueError:
        await callback.answer("Invalid downtime ID.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DowntimeEvent).where(DowntimeEvent.id == downtime_id)
        )
        downtime = result.scalar_one_or_none()

        if not downtime:
            await callback.answer("Downtime not found.")
            return

        if downtime.acknowledged_at:
            await callback.answer("Downtime already acknowledged.")
            return

        # Mark as acknowledged
        downtime.acknowledged_at = datetime.utcnow()

        tg_user = callback.from_user
        tg_name = f"{tg_user.first_name or ''} {tg_user.last_name or ''}".strip() or "Telegram user"

        # Audit log
        audit = AuditLog(
            entity_type="downtime_event",
            entity_id=downtime.id,
            action=AuditAction.ACKNOWLEDGE,
            user_id=None,
            user_name=f"[Telegram] {tg_name}",
        )
        db.add(audit)
        await db.commit()

    await callback.answer("✅ Acknowledged!")
    try:
        await callback.message.edit_text(
            callback.message.html_text + f"\n\n✅ <b>ACKNOWLEDGED</b> by: {tg_name}",
            parse_mode="HTML",
            reply_markup=None,
        )
    except Exception:
        pass


async def start_bot_polling():
    """Start bot polling in background."""
    if bot:
        try:
            await dp.start_polling(bot, allowed_updates=["message", "callback_query"])
        except Exception as e:
            logger.error(f"Bot polling error: {e}")