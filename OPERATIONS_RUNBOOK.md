# SMT Downtime Tracker - Operations Runbook

This file is for the person maintaining the system after go-live.

## Daily Checks

Run these at the start of each shift or once per day:

```bash
curl -f https://smt-tracker.yourdomain.com/health
systemctl status smt-tracker --no-pager
systemctl status nginx --no-pager
systemctl status postgresql --no-pager
```

Expected `/health` result:

```json
{"status":"ok","service":"smt-downtime-tracker"}
```

If `/health` returns `503`, the backend is running but cannot reach the database.

## Logs

```bash
journalctl -u smt-tracker -n 100 --no-pager
journalctl -u smt-tracker -f
tail -n 100 /var/log/nginx/smt-tracker.error.log
```

Use logs before restarting services. Save the first error message and the timestamp.

## Restart Order

Use this order when the app is down:

```bash
systemctl restart postgresql
systemctl restart smt-tracker
systemctl reload nginx
curl -f https://smt-tracker.yourdomain.com/health
```

If the frontend loads but API calls fail, restart `smt-tracker` first.

If nothing loads over HTTPS, check `nginx` and the certificate.

## Backups

Manual backup:

```bash
cd /opt/smt-downtime-tracker
./deploy/deploy.sh backup
ls -lh /var/backups/smt-tracker
```

Daily cron example:

```cron
0 2 * * * /opt/smt-downtime-tracker/deploy/deploy.sh backup >> /var/log/smt-tracker-backup.log 2>&1
```

Keep at least 7 daily backups and one monthly backup outside the server.

## PostgreSQL Restore

Stop the backend first:

```bash
systemctl stop smt-tracker
gunzip -c /var/backups/smt-tracker/postgres_YYYYMMDD_HHMMSS.sql.gz | psql "postgresql://smt_user:YOUR_PASSWORD@localhost:5432/downtime_tracker"
systemctl start smt-tracker
curl -f https://smt-tracker.yourdomain.com/health
```

Restore only after confirming which backup is needed. Restoring overwrites current production data.

## User And PIN Maintenance

Operator accounts are managed in the Admin screen.

Minimum rules:

- each operator should have a unique badge code
- inactive operators should be disabled, not reused
- admins should be limited to people who maintain the system
- team PINs should be changed if a shared PIN is exposed
- personal PINs should be changed when an operator changes role

If an admin removes a user or machine that already has downtime history, the app deactivates it instead of deleting it. This keeps reports and old downtime records intact while hiding the item from normal operational use.

## Environment File

Production config lives in:

```bash
/opt/smt-downtime-tracker/backend/.env
```

Required production values:

```env
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://...
JWT_SECRET=...
REQUIRE_PIN_FOR_LOGIN=true
CORS_ORIGINS=["https://smt-tracker.yourdomain.com"]
```

If MES integration is not used:

```env
ENABLE_MES_ENDPOINT=false
MES_API_KEY=
```

If MES integration is used:

```env
ENABLE_MES_ENDPOINT=true
MES_API_KEY=at-least-32-random-characters
```

MES requests must include:

```http
X-MES-API-Key: <MES_API_KEY>
```

## Telegram Checks

If alerts do not arrive:

```bash
grep TELEGRAM /opt/smt-downtime-tracker/backend/.env
journalctl -u smt-tracker -n 100 --no-pager | grep -i telegram
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

Topic IDs must match the real Telegram forum topics.

## Deployment

Before deploy:

```bash
cd /opt/smt-downtime-tracker
git status
./deploy/deploy.sh backup
```

Deploy:

```bash
git pull
./deploy/deploy.sh deploy
curl -f https://smt-tracker.yourdomain.com/health
```

Do not deploy when backups fail.

## What Not To Do During Production

- do not set `DEBUG=true`
- do not use SQLite in production
- do not publish `.env`
- do not expose PostgreSQL to the network
- do not run seed scripts on a populated production database unless you have confirmed they are idempotent and safe
- do not delete users or machines just to hide them; disable them instead when possible

## Escalation Checklist

When asking for help, include:

- exact time of failure
- screenshot or text of the user-visible error
- output of `/health`
- last 100 backend log lines
- whether PostgreSQL, backend, nginx, and Telegram are affected
- last deployment commit hash: `git rev-parse --short HEAD`
