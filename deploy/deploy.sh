#!/bin/bash
# SMT Downtime Tracker - Deployment Script
# Usage: ./deploy.sh [production|staging]

set -e

ENVIRONMENT=${1:-production}
PROJECT_DIR="/opt/smt-downtime-tracker"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
BACKUP_DIR="/var/backups/smt-tracker"
DATE=$(date +%Y%m%d_%H%M%S)

echo "=== SMT Downtime Tracker Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $(date)"

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)" 
   exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

get_database_url() {
    cd "$BACKEND_DIR"
    if [ -x "$VENV_DIR/bin/python" ]; then
        "$VENV_DIR/bin/python" -c "from app.config import settings; print(settings.DATABASE_URL)"
    else
        python3 -c "from app.config import settings; print(settings.DATABASE_URL)"
    fi
}

# Function to backup database
backup_database() {
    echo "Creating database backup..."

    if [ -f "$PROJECT_DIR/backend/data/downtime_tracker.db" ]; then
        cp "$PROJECT_DIR/backend/data/downtime_tracker.db" "$BACKUP_DIR/downtime_tracker_$DATE.db"
        echo "SQLite backup created: $BACKUP_DIR/downtime_tracker_$DATE.db"
    fi
    
    DATABASE_URL="$(get_database_url)"
    if command -v pg_dump &> /dev/null && [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == postgresql* ]]; then
        PG_DUMP_URL="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
        pg_dump "$PG_DUMP_URL" | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"
        echo "PostgreSQL backup created: $BACKUP_DIR/postgres_$DATE.sql.gz"
    else
        echo "PostgreSQL backup skipped: pg_dump is missing or DATABASE_URL is not PostgreSQL"
    fi
}

# Function to build frontend
build_frontend() {
    echo "Building frontend..."
    cd "$FRONTEND_DIR"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        npm ci
    fi
    
    # Build production bundle
    npm run build

    echo "Frontend build complete"
}

# Function to setup backend
setup_backend() {
    echo "Setting up backend..."
    cd "$BACKEND_DIR"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "$VENV_DIR" ]; then
        python3 -m venv "$VENV_DIR"
    fi
    
    # Activate virtual environment and install dependencies
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # Run database migrations when Alembic is committed.
    if [ -f alembic.ini ] && [ -d alembic ]; then
        alembic upgrade head
    else
        echo "No Alembic configuration found; set AUTO_CREATE_TABLES=true only for initial schema creation."
        if [ -f .env ] && grep -q '^AUTO_CREATE_TABLES=true' .env; then
            python -c "import asyncio; from app.database import init_db; asyncio.run(init_db())"
        fi
    fi
    
    deactivate
    echo "Backend setup complete"
}

# Function to deploy
deploy() {
    echo "Starting deployment..."
    
    # Backup current database
    backup_database
    
    # Build frontend
    build_frontend
    
    # Setup/update backend
    setup_backend
    
    # Restart services
    systemctl restart smt-tracker
    systemctl reload nginx
    
    echo "Deployment complete!"
    echo "Application should be available at https://your-domain.com"
}

# Function to rollback
rollback() {
    echo "Rolling back..."
    systemctl stop smt-tracker
    
    # Restore database from latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/downtime_tracker_*.db 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        cp "$LATEST_BACKUP" "$PROJECT_DIR/backend/data/downtime_tracker.db"
        echo "Restored database from $LATEST_BACKUP"
    else
        echo "No SQLite backup found. For PostgreSQL restore, use the documented pg_restore/psql procedure."
    fi
    
    systemctl start smt-tracker
    echo "Rollback complete"
}

# Main execution
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    backup)
        backup_database
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|backup}"
        exit 1
        ;;
esac
