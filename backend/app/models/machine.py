import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List
from sqlalchemy import String, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
import enum

if TYPE_CHECKING:
    from app.models.downtime import DowntimeEvent


class MachineType(str, enum.Enum):
    DECAN_S2 = "DECAN_S2"
    DECAN_L2 = "DECAN_L2"
    CONVEYOR = "CONVEYOR"
    STF100S = "STF100S"
    SPI = "SPI"
    AOI = "AOI"
    REFLOW = "REFLOW"
    PRINTER = "PRINTER"
    OTHER = "OTHER"


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    line: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    type: Mapped[MachineType] = mapped_column(SQLEnum(MachineType), default=MachineType.OTHER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    downtimes: Mapped[List["DowntimeEvent"]] = relationship("DowntimeEvent", back_populates="machine")