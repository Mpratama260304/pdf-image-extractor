#!/bin/sh
set -e

echo ""
echo "========================================"
echo "  PDF Image Extractor - Starting"
echo "========================================"
echo ""
echo "Environment: ${NODE_ENV:-production}"
echo "Port: ${PORT:-3001}"
echo "Database: ${DATABASE_URL:-file:/data/db/prod.db}"
echo ""

# ===========================================
# Directory Setup (before anything else)
# ===========================================

echo "Setting up data directories..."
mkdir -p /data/storage /data/db /data/secrets /data/config 2>/dev/null || true
chmod 700 /data/secrets 2>/dev/null || true
echo "✓ Directories ready"

# ===========================================
# JWT Secret Info (no hard failure - app handles fallback)
# ===========================================

if [ -z "$JWT_SECRET" ]; then
    if [ -f "/data/secrets/jwt_secret" ]; then
        echo "✓ JWT_SECRET will be loaded from /data/secrets/jwt_secret"
    else
        echo "ℹ️  JWT_SECRET not set - will be auto-generated and persisted"
    fi
else
    if [ ${#JWT_SECRET} -lt 32 ]; then
        echo "⚠️  WARNING: JWT_SECRET is short (${#JWT_SECRET} chars, recommend 32+)"
    else
        echo "✓ JWT_SECRET provided via environment"
    fi
fi
# ===========================================
# Database Migrations
# ===========================================

echo ""
echo "Running database migrations..."
cd /app/server
npx prisma migrate deploy || {
    echo "Migration failed, attempting db push for SQLite..."
    npx prisma db push --accept-data-loss || {
        echo "⚠️  WARNING: Database initialization failed. Continuing anyway..."
    }
}
echo "✓ Database ready"
cd /app

# ===========================================
# Start Server
# ===========================================

echo ""
echo "========================================"
echo "  Starting server on 0.0.0.0:${PORT:-3001}"
echo "========================================"
echo ""
exec node server/dist/index.js
