import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum

if TYPE_CHECKING:
    from app.models.machine import Machine
    from app.models.user import User


class DowntimeCategory(str, enum.Enum):
    MACHINE_FAULT = "machine_fault"
    MATERIAL_SHORTAGE = "material_shortage"
    PROGRAM_SETUP = "program_setup"
    PLANNED_MAINTENANCE = "planned_maintenance"
    QUALITY_ISSUE = "quality_issue"
    FREE_SHIFT = "free_shift"
    WEEKEND = "weekend"
    UNPLANNED_OTHER = "unplanned_other"


class DowntimeSource(str, enum.Enum):
    MANUAL = "manual"
    MES_SIMULATOR = "mes_simulator"
    AUTO = "auto"


class DowntimeEvent(Base):
    __tablename__ = "downtime_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    machine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("machines.id"), nullable=False, index=True)
    opened_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    closed_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)

    category: Mapped[DowntimeCategory] = mapped_column(SQLEnum(DowntimeCategory), nullable=False, index=True)
    sub_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    problem_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    closure_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    closure_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    mes_event_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    source: Mapped[DowntimeSource] = mapped_column(SQLEnum(DowntimeSource), default=DowntimeSource.MANUAL, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    machine: Mapped["Machine"] = relationship("Machine", back_populates="downtimes")
    opened_by: Mapped["User"] = relationship("User", foreign_keys=[opened_by_user_id], back_populates="opened_downtimes")
    closed_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[closed_by_user_id], back_populates="closed_downtimes")

    __table_args__ = (
        Index("idx_downtime_machine_time", "machine_id", "started_at"),
        Index("idx_downtime_category_time", "category", "started_at"),
        Index("idx_downtime_open", "resolved_at"),
    )