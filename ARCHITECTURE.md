# SMT Downtime Tracker - Architecture

## Overview

System for tracking production line downtime with Telegram alerting and KPI analytics.

## Components

### Backend (FastAPI)

```
POST /api/auth/login          - Login via badge barcode
POST /api/downtime/open       - Open downtime event
GET  /api/downtime/active     - Active downtime events
POST /api/downtime/{id}/close - Close event (PIN validation)
GET  /api/downtime/kpi/monthly - Monthly KPI report
POST /api/mes/downtime        - MES simulator endpoint
```

### Data Model

```
teams (code, name, telegram_topic_id, pin_code)
  ↑
users (badge_code, full_name, team_id, role, pin_code)
  |
downtime_events (machine_id, opened_by, category, sub_category,
                 started_at, resolved_at, duration_seconds,
                 closure_code, closure_comment, mes_event_id)
  ↑
machines (code, name, line, type)
```

### Telegram routing

| Category | Recipients |
|----------|------------|
| machine_fault | Maintenance + Process |
| material_shortage | Production |
| program_setup | Process |
| planned_maintenance | Maintenance |
| quality_issue | Quality + Process |
| free_shift / weekend | Log only (no alert) |
| unplanned_other | Process |

### Frontend (React + Tailwind)

- `/scan` - Scan barcode, open downtime
- `/active` - Active downtime events (auto-refresh 10s)
- `/close/{id}` - Close downtime (PIN required)
- `/reports` - Monthly KPI (bar/pie charts, tables)
- `/admin` - CRUD: users, teams, machines

### Deployment

```
docker-compose.yml
├── postgres:16-alpine (port 5432)
├── backend (FastAPI, port 8000)
└── frontend (Nginx, port 3000)
```