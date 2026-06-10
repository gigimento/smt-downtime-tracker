"""
ShiftOverride model - admin can override auto-detection
of free_shift/weekend for a specific date.
"""
import uuid
from datetime import datetime, date as date_type, time as time_type
from typing import Optional
from sqlalchemy import String, Date, DateTime, ForeignKey, Boolean, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ShiftOverride(Base):
    """
    Admin override for work hours auto-detection.
    If an override exists for a date, the system uses the override instead of
    auto-detection.

    Three override types:
    - 'force_workday': Treat as work day (even on weekends)
    - 'force_free_shift': Force free_shift category
    - 'force_weekend': Force weekend category
    """
    __tablename__ = "shift_overrides"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date_type] = mapped_column(Date, nullable=False, index=True)
    override_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Optional: custom work hours for that day (e.g. Saturday 08-14)
    work_start: Mapped[Optional[time_type]] = mapped_column(Time, nullable=True)
    work_end: Mapped[Optional[time_type]] = mapped_column(Time, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint('date', name='uq_shift_override_date'),
    )
