from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

# Get the directory where this config.py file is located (backend/app)
CONFIG_DIR = Path(__file__).parent
# .env is in the backend directory (one level up)
ENV_FILE = CONFIG_DIR.parent / ".env"
# Database file is in backend/data/ - use absolute path
DB_FILE = (CONFIG_DIR.parent / "data" / "downtime_tracker.db").resolve()
DATABASE_URL_DEFAULT = f"sqlite+aiosqlite:///{DB_FILE.as_posix()}"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = DATABASE_URL_DEFAULT
    
    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_FORUM_CHAT_ID: int = 0
    
    # Topic IDs (configured after creating topics in Telegram)
    TOPIC_MAINTENANCE: int = 0
    TOPIC_PROCESS: int = 0
    TOPIC_PRODUCTION: int = 0
    TOPIC_QUALITY: int = 0
    
    # JWT
    JWT_SECRET: str = "change-me-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # App
    APP_NAME: str = "SMT Downtime Tracker"
    DEBUG: bool = True
    
    # Work schedule (default 08-16, Monday-Friday only)
    WORK_DAY_START_HOUR: int = 8
    WORK_DAY_END_HOUR: int = 16
    WORK_DAYS: list[int] = [0, 1, 2, 3, 4]  # Monday=0, Friday=4 (weekday())
    
    # Escalation (seconds)
    ESCALATION_INTERVALS: list[int] = [300, 900, 1800]  # 5, 15, 30 min
    ESCALATION_CHECK_INTERVAL: int = 30  # seconds between checks
    
    class Config:
        env_file = str(ENV_FILE)
        case_sensitive = True


settings = Settings()


# Category to topic mapping
CATEGORY_TOPIC_MAP = {
    "machine_fault": ["maintenance", "process"],
    "material_shortage": ["production"],
    "program_setup": ["process"],
    "planned_maintenance": ["maintenance"],
    "quality_issue": ["quality"],
    "free_shift": [],  # No alert, just log
    "weekend": [],     # No alert, just log
    "unplanned_other": ["process"],
}


def get_topics_for_category(category: str) -> list[str]:
    """Return list of team codes that should receive alert for category."""
    return CATEGORY_TOPIC_MAP.get(category, ["process"])