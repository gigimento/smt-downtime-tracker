from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from pathlib import Path
from urllib.parse import unquote, urlparse


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent_dir(database_url: str) -> None:
    if not database_url.startswith("sqlite"):
        return

    parsed = urlparse(database_url)
    if not parsed.path:
        return

    db_path = Path(unquote(parsed.path.lstrip("/")))
    if db_path.parent != Path("."):
        db_path.parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_parent_dir(settings.DATABASE_URL)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    if not (settings.AUTO_CREATE_TABLES or settings.DEBUG):
        return

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
