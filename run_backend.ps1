# Murtaqa — backend launcher (FastAPI bridge)
#
# Starts server.py from the project root regardless of where you run this from,
# so the "[Errno 2] No such file or directory" wrong-directory problem can't happen.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File "run_backend.ps1"
# or, if you're already in the project root:
#   .\run_backend.ps1

$ErrorActionPreference = "Stop"

# Anchor to this script's own folder (the project root), not the caller's CWD.
Set-Location -Path $PSScriptRoot

Write-Host "Murtaqa backend — project root: $PSScriptRoot" -ForegroundColor Cyan

# Sanity checks before we start.
if (-not (Test-Path ".\server.py")) {
    Write-Host "ERROR: server.py not found in $PSScriptRoot" -ForegroundColor Red
    exit 1
}

$python = (Get-Command python -ErrorAction SilentlyContinue)
if ($null -eq $python) {
    Write-Host "ERROR: 'python' is not on PATH. Install Python 3.11+ and reopen the terminal." -ForegroundColor Red
    exit 1
}

# Friendly reminder: the eligibility/chat endpoints call the local ALLaM model.
try {
    Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -UseBasicParsing | Out-Null
    Write-Host "Ollama is up." -ForegroundColor Green
} catch {
    Write-Host "WARNING: Ollama does not seem to be running on :11434." -ForegroundColor Yellow
    Write-Host "         Start it in another terminal with 'ollama serve' — the" -ForegroundColor Yellow
    Write-Host "         eligibility and chat endpoints need iKhalid/ALLaM:7b." -ForegroundColor Yellow
}

Write-Host "Starting FastAPI bridge on http://localhost:8000 ..." -ForegroundColor Cyan
python server.py
