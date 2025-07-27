# Quick Redis Setup Guide

## Option 1: Install Redis on Windows

### Using Chocolatey (Recommended)
```powershell
# Install Chocolatey (if not already installed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Redis
choco install redis-64

# Start Redis
redis-server
```

### Using WSL (Windows Subsystem for Linux)
```bash
# Install WSL if not already installed
wsl --install

# In WSL terminal:
sudo apt update
sudo apt install redis-server
redis-server
```

## Option 2: Using Docker (if available)

```powershell
# Pull and run Redis container
docker run -d -p 6379:6379 --name redis-container redis:alpine

# Or use docker-compose (already configured in project)
docker-compose up -d redis
```

## Option 3: Redis Cloud (Free Tier)

1. Go to https://redis.com/try-free/
2. Create a free account
3. Create a database
4. Update your `.env` file with the connection details:
   ```
   REDIS_HOST=your-redis-cloud-host
   REDIS_PORT=your-redis-cloud-port
   REDIS_PASSWORD=your-redis-cloud-password
   ```

## Verify Redis Connection

```powershell
# Test Redis connection
redis-cli ping
# Should return: PONG

# Or test via the API Rate Limiter
Invoke-RestMethod -Uri "http://localhost:3000/health"
# Redis should show: true
```

## Next Steps

1. Choose one of the Redis setup options above
2. Start Redis
3. Restart the API Rate Limiter server: `npm run dev`
4. Run the full test suite: `node test-api-keys.js`
