#!/bin/sh
set -e

echo "=== PDF Image Extractor - Starting ==="
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-3001}"
echo "Database: ${DATABASE_URL:-file:/data/db/prod.db}"

# Ensure data directories exist
mkdir -p /data/storage /data/db 2>/dev/null || true

# Run Prisma migrations
echo "Running database migrations..."
cd /app/server
npx prisma migrate deploy || {
    echo "Migration failed, attempting db push for SQLite..."
    npx prisma db push --accept-data-loss || {
        echo "WARNING: Database initialization failed. Continuing anyway..."
    }
}
cd /app

echo "Starting server..."
exec node server/dist/index.js
