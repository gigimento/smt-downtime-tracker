from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.config import settings
from app.database import init_db, engine
from app.api.routes import auth, downtime, machines, users, kpi, mes, export, shift_overrides, websocket as ws_routes
from app.services.telegram import init_telegram_bot, close_telegram_bot, start_bot_polling
from app.services.escalation import start_escalation_worker
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Background task for bot polling
bot_polling_task: asyncio.Task | None = None
escalation_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up...")
    await init_db()
    await init_telegram_bot()

    # Start bot polling in background
    global bot_polling_task, escalation_task
    if settings.RUN_BACKGROUND_WORKERS:
        bot_polling_task = asyncio.create_task(start_bot_polling())
        await start_escalation_worker()
    else:
        logger.info("Background workers disabled")

    yield

    # Shutdown
    logger.info("Shutting down...")
    if bot_polling_task:
        bot_polling_task.cancel()
        try:
            await bot_polling_task
        except asyncio.CancelledError:
            pass
    if escalation_task:
        escalation_task.cancel()
        try:
            await escalation_task
        except asyncio.CancelledError:
            pass
    await close_telegram_bot()
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    description="SMT Downtime Tracker & Alerting System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api")
app.include_router(downtime.router, prefix="/api")
app.include_router(machines.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(kpi.router, prefix="/api")
app.include_router(mes.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(shift_overrides.router, prefix="/api")
app.include_router(ws_routes.router)  # WebSocket at /ws (not /api/ws)


@app.get("/health")
async def health_check():
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Health check failed")
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "service": "smt-downtime-tracker",
                "detail": exc.__class__.__name__,
            },
        )

    return {"status": "ok", "service": "smt-downtime-tracker"}


@app.get("/")
async def root():
    return {
        "service": "SMT Downtime Tracker",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
