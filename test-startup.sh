#!/bin/bash

# Test script to verify the application starts properly
echo "🔧 Testing API Rate Limiter startup..."

# Set required environment variables
export NODE_ENV=development
export REDIS_ENABLED=false
export JWT_SECRET=test-secret-for-local-development-only
export HOST=0.0.0.0
export PORT=3000

echo "📋 Environment variables:"
echo "  NODE_ENV=$NODE_ENV"
echo "  REDIS_ENABLED=$REDIS_ENABLED"
echo "  JWT_SECRET=[HIDDEN]"
echo "  HOST=$HOST"
echo "  PORT=$PORT"

echo ""
echo "🚀 Starting application..."

# Start the application
node dist/index.js
