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
mkdir -p $BACKUP_DIR

# Function to backup database
backup_database() {
    echo "Creating database backup..."
    if [ -f "$PROJECT_DIR/backend/data/downtime_tracker.db" ]; then
        cp "$PROJECT_DIR/backend/data/downtime_tracker.db" "$BACKUP_DIR/downtime_tracker_$DATE.db"
        echo "SQLite backup created: $BACKUP_DIR/downtime_tracker_$DATE.db"
    fi
    
    # For PostgreSQL (when available)
    if command -v pg_dump &> /dev/null; then
        pg_dump -h localhost -U smt_user downtime_tracker | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"
        echo "PostgreSQL backup created: $BACKUP_DIR/postgres_$DATE.sql.gz"
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
    
    # Copy to nginx web root
    rm -rf /opt/smt-downtime-tracker/frontend/dist/*
    cp -r dist/* /opt/smt-downtime-tracker/frontend/dist/
    
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
    
    # Run database migrations
    alembic upgrade head
    
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