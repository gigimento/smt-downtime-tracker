"""
Auto-detection of free_shift / weekend categories.
- Weekend (Saturday/Sunday) → WEEKEND
- Outside work hours → FREE_SHIFT
- Admin override via ShiftOverride table (by date)
- Env vars WORK_DAY_START_HOUR, WORK_DAY_END_HOUR for default work hours
- Env var AUTO_DETECT_SHIFT for global enable/disable
"""
import os
from datetime import datetime, time
from typing import Optional
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.downtime import DowntimeCategory
from app.models.shift import ShiftOverride


def _get_default_work_hours() -> tuple[int, int]:
    try:
        start_h = int(os.getenv("WORK_DAY_START_HOUR", "6"))
        end_h = int(os.getenv("WORK_DAY_END_HOUR", "22"))
    except ValueError:
        start_h, end_h = 6, 22
    return start_h, end_h


def _is_weekend(dt: datetime) -> bool:
    return dt.weekday() in (5, 6)


def _is_free_shift(dt: datetime, work_start_h: int, work_end_h: int) -> bool:
    return dt.hour < work_start_h or dt.hour >= work_end_h


async def get_override_for_date(dt: datetime) -> Optional[ShiftOverride]:
    """Fetch override for given date (if exists)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ShiftOverride).where(ShiftOverride.date == dt.date())
        )
        return result.scalar_one_or_none()


async def detect_category_async(dt: datetime) -> Optional[DowntimeCategory]:
    """
    Async version - checks both override and auto-detection.
    Returns None if not free_shift/weekend (proceed normally).
    """
    override = await get_override_for_date(dt)
    if override:
        if override.override_type == "force_workday":
            return None
        elif override.override_type == "force_free_shift":
            return DowntimeCategory.FREE_SHIFT
        elif override.override_type == "force_weekend":
            return DowntimeCategory.WEEKEND

    if _is_weekend(dt):
        return DowntimeCategory.WEEKEND
    work_start_h, work_end_h = _get_default_work_hours()
    if _is_free_shift(dt, work_start_h, work_end_h):
        return DowntimeCategory.FREE_SHIFT
    return None


def should_auto_assign(dt: datetime, admin_override: bool = False) -> Optional[DowntimeCategory]:
    """
    Sync wrapper - returns category only if:
    - Auto-detect is enabled (env AUTO_DETECT_SHIFT=true)
    - Admin has not manually overridden (admin_override=False)

    This version does NOT check database (for fast sync calls).
    For full logic with override use `detect_category_async`.
    """
    if admin_override:
        return None
    enabled = os.getenv("AUTO_DETECT_SHIFT", "true").lower() in ("1", "true", "yes")
    if not enabled:
        return None
    if _is_weekend(dt):
        return DowntimeCategory.WEEKEND
    work_start_h, work_end_h = _get_default_work_hours()
    if _is_free_shift(dt, work_start_h, work_end_h):
        return DowntimeCategory.FREE_SHIFT
    return None
