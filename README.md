# SMT Downtime Tracker

Real-time downtime tracking, Telegram alerting, and KPI analytics for SMT production lines.

## Features

- **Badge Scan** - Operators open/close downtime events by scanning badge barcodes
- **Telegram Bot** - Real-time alerts sent to responsible teams via Telegram forum topics
- **Auto-Categorization** - Weekend and free-shift detection with admin override
- **Escalation** - Unacknowledged downtime auto-escalates at configurable intervals
- **KPI Analytics** - OEE, MTTR, MTBF, and downtime Pareto charts
- **MES Simulator** - Accept downtime events from external MES systems via REST API
- **Role-Based Access** - Admin, Process, Maintenance, Production, Quality roles

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy (async), Aiogram
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Database**: SQLite (dev) / PostgreSQL (production)
- **Infrastructure**: Docker Compose, Nginx

## Quick Start

```bash
# Clone the repository
git clone https://github.com/gigimento/smt-downtime-tracker.git
cd smt-downtime-tracker

# Copy environment config
cp .env.example .env
# Edit .env with your Telegram bot token and topic IDs

# Using Docker Compose
docker compose up -d

# Or manual setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload
```

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | SQLite (local file) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | - |
| `TELEGRAM_FORUM_CHAT_ID` | Forum chat ID for alerts | - |
| `TOPIC_*` | Telegram topic IDs per team | 0 |
| `JWT_SECRET` | JWT signing secret | (required) |
| `CORS_ORIGINS` | Allowed CORS origins | localhost:5173,3000 |
| `WORK_DAY_START/END_HOUR` | Work schedule bounds | 8 / 16 |
| `ESCALATION_INTERVALS` | Escalation delay steps (s) | 300, 900, 1800 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login via badge barcode |
| POST | `/api/downtime/open` | Open a downtime event |
| GET | `/api/downtime/active` | List active events |
| POST | `/api/downtime/{id}/close` | Close an event (PIN required) |
| GET | `/api/downtime/kpi/monthly` | Monthly KPI report |
| POST | `/api/mes/downtime` | MES simulator endpoint |
| WS | `/ws` | WebSocket for real-time updates |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/routes/    # FastAPI route handlers
│   │   ├── core/          # Auth, security, dependencies
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/      # Telegram, escalation, shift detection
│   ├── migrations/        # Alembic migrations
│   ├── tests/             # Unit & integration tests
│   ├── seed.py            # Initial data seeder
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages (Scan, Active, Reports, Admin)
│   │   ├── services/      # API client
│   │   └── types/         # TypeScript types
│   └── Dockerfile
├── deploy/                # Production deployment scripts
├── mes_simulator/         # MES integration simulator
└── docker-compose.yml
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Operations Handover

For go-live and maintenance procedures, use [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

Before production use, configure real secrets, set `REQUIRE_PIN_FOR_LOGIN=true`, create operator accounts/PINs, confirm Telegram topic IDs, and verify `/health` from the production URL.

## License

MIT
