# Load Test Runner Script
Write-Host "Starting API Rate Limiter..." -ForegroundColor Green

# Start server in background
$job = Start-Job -ScriptBlock {
    Set-Location "G:\APIRateLimiter"
    node dist/index.js
}

# Wait for server to start
Write-Host "Waiting for server to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Check if server is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Server is running" -ForegroundColor Green
        
        # Run k6 load test
        Write-Host "`nRunning k6 load test..." -ForegroundColor Cyan
        & 'C:\Program Files\k6\k6.exe' run tests/load-test.js
        
        Write-Host "`n[OK] Load test completed" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Server failed to start" -ForegroundColor Red
    Write-Host $_.Exception.Message
} finally {
    # Stop server
    Write-Host "`nStopping server..." -ForegroundColor Yellow
    Stop-Job $job
    Remove-Job $job
    Write-Host "Server stopped" -ForegroundColor Green
}
