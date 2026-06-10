import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Text, Enum as SQLEnum, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


class AuditAction(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    OPEN = "open"
    ACKNOWLEDGE = "acknowledge"
    CLOSE = "close"
    LOGIN = "login"
    LOGOUT = "logout"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    action: Mapped[AuditAction] = mapped_column(SQLEnum(AuditAction), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(nullable=True, index=True)
    user_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    changes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
        Index("idx_audit_user_time", "user_id", "created_at"),
    )