import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum

if TYPE_CHECKING:
    from app.models.downtime import DowntimeEvent


class UserRole(str, enum.Enum):
    OPERATOR = "operator"
    MAINTENANCE = "maintenance"
    PROCESS = "process"
    PLANNER = "planner"
    QUALITY = "quality"
    ADMIN = "admin"


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    telegram_topic_id: Mapped[Optional[int]] = mapped_column(nullable=True)
    pin_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    users: Mapped[List["User"]] = relationship(back_populates="team")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    badge_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("teams.id"), nullable=True)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.OPERATOR, nullable=False)
    pin_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    team: Mapped[Optional[Team]] = relationship(back_populates="users")
    opened_downtimes: Mapped[List["DowntimeEvent"]] = relationship(
        "DowntimeEvent", foreign_keys="DowntimeEvent.opened_by_user_id", back_populates="opened_by"
    )
    closed_downtimes: Mapped[List["DowntimeEvent"]] = relationship(
        "DowntimeEvent", foreign_keys="DowntimeEvent.closed_by_user_id", back_populates="closed_by"
    )