"""
Shift planning - auto-generate work calendar for upcoming periods.
Rules:
- Saturday/Sunday = non-working (weekend)
- Serbian holidays = non-working
- Work hours 08-16 (env override)
- Admin can manually override (ShiftOverride)

Functions:
- generate_month_plan(year, month): generates proposal for full month
- apply_plan(year, month): creates ShiftOverride entries for all non-working days
- preview_plan(year, month): returns what would be generated, without writing to DB
"""
from datetime import date, timedelta
from typing import Optional
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.shift import ShiftOverride
from app.config import settings
from app.services.serbian_holidays import get_serbian_holidays, is_serbian_holiday
import calendar


DAY_NAMES = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}


def _is_workday_default(target_date: date) -> bool:
    """By default work days are Mon-Fri from WORK_DAYS env."""
    if target_date.weekday() not in settings.WORK_DAYS:
        return False
    return True


def _classify_day(target_date: date) -> dict:
    """Return day classification."""
    weekday = target_date.weekday()
    is_weekend = weekday in (5, 6)
    holiday = is_serbian_holiday(target_date)
    is_workday_default = weekday in settings.WORK_DAYS and holiday is None

    return {
        "date": target_date.isoformat(),
        "day_name": DAY_NAMES.get(weekday, ""),
        "weekday": weekday,
        "is_weekend": is_weekend,
        "is_holiday": holiday is not None,
        "holiday_name": holiday["name"] if holiday else None,
        "is_workday_by_default": is_workday_default,
        "default_category": (
            "weekend" if is_weekend
            else None
        ),
    }


async def preview_month_plan(year: int, month: int) -> dict:
    """
    Preview month plan - what the system would auto-generate.
    Does not write to database.
    """
    _, days_in_month = calendar.monthrange(year, month)
    days = []
    workday_count = 0

    for day_num in range(1, days_in_month + 1):
        target = date(year, month, day_num)
        classification = _classify_day(target)
        # Check if override already exists
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ShiftOverride).where(ShiftOverride.date == target)
            )
            existing = result.scalar_one_or_none()

        item = {
            **classification,
            "has_override": existing is not None,
            "override_type": existing.override_type if existing else None,
            "override_note": existing.note if existing else None,
        }
        if item["is_workday_by_default"] and not existing:
            workday_count += 1
        days.append(item)

    return {
        "year": year,
        "month": month,
        "month_name": [
            "", "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ][month],
        "total_days": days_in_month,
        "workday_count": workday_count,
        "weekend_count": sum(1 for d in days if d["is_weekend"]),
        "holiday_count": sum(1 for d in days if d["is_holiday"]),
        "work_hours": f"{settings.WORK_DAY_START_HOUR:02d}:00 - {settings.WORK_DAY_END_HOUR:02d}:00",
        "days": days,
    }


async def apply_month_plan(
    year: int,
    month: int,
    user_id,
    include_holidays: bool = True,
    dry_run: bool = False,
) -> dict:
    """
    Generate ShiftOverride entries for all non-working days in month.
    - Weekend (Sat/Sun) → override_type=force_weekend
    - Holidays → override_type=force_free_shift
    """
    _, days_in_month = calendar.monthrange(year, month)
    created = []
    skipped = []

    for day_num in range(1, days_in_month + 1):
        target = date(year, month, day_num)
        classification = _classify_day(target)

        # Only non-working days (weekend or holiday) get override
        if not classification["is_weekend"] and not (include_holidays and classification["is_holiday"]):
            continue

        # Check if already exists
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ShiftOverride).where(ShiftOverride.date == target)
            )
            existing = result.scalar_one_or_none()
            if existing:
                skipped.append({"date": target.isoformat(), "reason": "already_exists"})
                continue

            if classification["is_holiday"]:
                override_type = "force_free_shift"
                note = f"Holiday: {classification['holiday_name']}"
            else:
                override_type = "force_weekend"
                note = f"{classification['day_name']} (weekend)"

            if dry_run:
                created.append({
                    "date": target.isoformat(),
                    "override_type": override_type,
                    "note": note,
                })
            else:
                override = ShiftOverride(
                    date=target,
                    override_type=override_type,
                    note=note,
                    created_by_user_id=user_id,
                )
                db.add(override)
                await db.commit()
                created.append({
                    "date": target.isoformat(),
                    "override_type": override_type,
                    "note": note,
                })

    return {
        "created_count": len(created),
        "skipped_count": len(skipped),
        "created": created,
        "skipped": skipped,
    }
