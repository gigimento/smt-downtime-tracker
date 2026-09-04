# SMT Downtime Tracker - Deployment Guide

## Overview
This guide covers deploying the SMT Downtime Tracker to a production server.

## Prerequisites
- Ubuntu 22.04+ / Debian 11+ server
- Root/sudo access
- Domain name with DNS pointing to server
- PostgreSQL 14+ (for production) or SQLite (dev)

## Quick Start (Production)

### 1. Server Setup
```bash
# Update system
apt update && apt upgrade -y

# Install dependencies
apt install -y python3 python3-venv python3-pip nginx postgresql postgresql-contrib nodejs npm certbot python3-certbot-nginx

# Create application user
useradd -r -s /bin/bash -d /opt/smt-downtime-tracker smt-tracker
```

### 2. Database Setup (PostgreSQL)
```bash
sudo -u postgres psql << EOF
CREATE DATABASE downtime_tracker;
CREATE USER smt_user WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE downtime_tracker TO smt_user;
\q
EOF
```

### 3. Application Deployment
```bash
# Create application directory
mkdir -p /opt/smt-downtime-tracker
chown -R smt-tracker:smt-tracker /opt/smt-downtime-tracker

# Clone repository
cd /opt/smt-downtime-tracker
git clone <your-repo-url> .
chown -R smt-tracker:smt-tracker .

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env
# Edit .env with production values

# Initialize schema
# This repository currently has no committed Alembic migration directory.
# For first deploy, set AUTO_CREATE_TABLES=true; switch it off after adopting migrations.
AUTO_CREATE_TABLES=true python -c "import asyncio; from app.database import init_db; asyncio.run(init_db())"

# Seed initial data
python seed.py
```

### 4. Frontend Build
```bash
cd frontend
npm ci
npm run build

# deploy/nginx.conf serves /opt/smt-downtime-tracker/frontend/dist
```

### 5. Systemd Service
```bash
# Copy service file
cp deploy/smt-tracker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable smt-tracker
systemctl start smt-tracker
systemctl status smt-tracker
```

### 6. Nginx Configuration
```bash
cp deploy/nginx.conf /etc/nginx/sites-available/smt-tracker
ln -s /etc/nginx/sites-available/smt-tracker /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)
```bash
certbot --nginx -d smt-tracker.yourdomain.com
```

### 7. Verify Deployment
```bash
# Check services
systemctl status smt-tracker nginx postgresql

# Test API
curl https://smt-tracker.yourdomain.com/health

# Test frontend
open https://smt-tracker.yourdomain.com
```

## Environment Variables (.env)

### Required
```env
DATABASE_URL=postgresql+asyncpg://smt_user:password@localhost:5432/downtime_tracker
JWT_SECRET=your-64-char-secret-key-here
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_FORUM_CHAT_ID=-100xxxxxxxxxx
TOPIC_MAINTENANCE=15
TOPIC_PROCESS=4
TOPIC_PRODUCTION=6
TOPIC_QUALITY=8
```

### Optional
```env
DEBUG=false
REQUIRE_PIN_FOR_LOGIN=true
CORS_ORIGINS=["https://your-domain.com"]
ENABLE_MES_ENDPOINT=false
MES_API_KEY=
WORK_DAY_START_HOUR=8
WORK_DAY_END_HOUR=16
WORK_DAYS=[0,1,2,3,4]
ESCALATION_INTERVALS=[300,900,1800]
ESCALATION_CHECK_INTERVAL=30
```

## Backup & Recovery

### Automated Backup (Cron)
```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * /opt/smt-downtime-tracker/deploy/deploy.sh backup
```

### Manual Backup
```bash
./deploy/deploy.sh backup
```

### Restore from Backup
```bash
# Stop services
systemctl stop smt-tracker

# Restore database
cp /var/backups/smt-tracker/downtime_tracker_YYYY-MM-DD_HH-MM-SS.db /opt/smt-downtime-tracker/backend/data/downtime_tracker.db

# For PostgreSQL
gunzip -c /var/backups/smt-tracker/postgres_YYYY-MM-DD_HH-MM-SS.sql.gz | psql -U smt_user -d downtime_tracker

# Restart
systemctl start smt-tracker
```

## Monitoring & Maintenance

### Health Checks
```bash
# API health
curl -f https://your-domain.com/health

# Service status
systemctl status smt-tracker nginx postgresql

# Logs
journalctl -u smt-tracker -f
tail -f /var/log/nginx/smt-tracker.access.log
```

### Log Rotation
```bash
# /etc/logrotate.d/smt-tracker
/var/log/smt-tracker/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 smt-tracker smt-tracker
}
```

### Database Maintenance
```bash
# Vacuum analyze (monthly)
psql -U smt_user -d downtime_tracker -c "VACUUM ANALYZE;"

# Check table sizes
psql -U smt_user -d downtime_tracker -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables WHERE schemaname='public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

## Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check logs
journalctl -u smt-tracker -n 50

# Check config
cat /opt/smt-downtime-tracker/backend/.env

# Test database connection
python -c "from app.config import settings; print(settings.DATABASE_URL)"
```

**Frontend not loading:**
```bash
# Check nginx config
nginx -t
systemctl status nginx

# Check build
ls -la /var/www/smt-tracker/
```

**Database locked:**
```bash
# Check for locks
psql -U smt_user -d downtime_tracker -c "SELECT * FROM pg_locks WHERE NOT granted;"

# Kill blocking processes
psql -U smt_user -d downtime_tracker -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - state_change > interval '5 minutes';"
```

**Telegram bot not working:**
```bash
# Test bot token
curl "https://api.telegram.org/bot<TOKEN>/getMe"

# Check chat ID
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

**MES integration returns 404 or 401:**
```bash
# 404 means the MES endpoint is intentionally disabled.
grep ENABLE_MES_ENDPOINT /opt/smt-downtime-tracker/backend/.env

# 401 means X-MES-API-Key is missing or does not match MES_API_KEY.
grep MES_API_KEY /opt/smt-downtime-tracker/backend/.env
```

## Rollback Procedure
```bash
# Quick rollback
./deploy/deploy.sh rollback

# Or manual
systemctl stop smt-tracker
cp /var/backups/smt-tracker/downtime_tracker_YYYY-MM-DD_HH-MM-SS.db /opt/smt-downtime-tracker/backend/data/downtime_tracker.db
systemctl start smt-tracker
```

## Monitoring (Optional)
Add to `/etc/prometheus/prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'smt-tracker'
    static_configs:
      - targets: ['localhost:8000']
```

Grafana dashboard available in `monitoring/grafana-dashboard.json`

## Security Checklist
- [ ] Strong JWT_SECRET (64+ chars)
- [ ] PostgreSQL password secured
- [ ] REQUIRE_PIN_FOR_LOGIN=true
- [ ] MES endpoint disabled or protected with MES_API_KEY
- [ ] Firewall: only 80, 443, 22 open
- [ ] Fail2ban configured
- [ ] Regular security updates
- [ ] Database backups encrypted
- [ ] TLS 1.2+ only
- [ ] Rate limiting on API
