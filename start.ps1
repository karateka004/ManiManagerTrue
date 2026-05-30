# Koshel - local dev launcher (Windows PowerShell)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\start.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host 'Koshel - local launcher' -ForegroundColor Green
Write-Host ''

# 1) Check Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host '[X] Node.js not found.' -ForegroundColor Red
    Write-Host ''
    Write-Host '   1) Download LTS from https://nodejs.org/'
    Write-Host '   2) Install (keep the "Add to PATH" checkbox on).'
    Write-Host '   3) Close and reopen this terminal.'
    Write-Host '   4) Run this script again.'
    exit 1
}
$nodeVer = (& node --version).Trim()
$npmVer  = (& npm --version).Trim()
Write-Host ('  Node ' + $nodeVer + '  /  npm ' + $npmVer)

# 2) Install deps if missing
if (-not (Test-Path -Path 'node_modules')) {
    Write-Host ''
    Write-Host '-> Installing dependencies (first run, ~1-2 minutes)...' -ForegroundColor Cyan
    & npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[X] npm install failed.' -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host '  node_modules already present - skipping install.'
}

# 3) Open browser and start dev server
Write-Host ''
Write-Host '-> Starting Vite on http://localhost:5173 (Ctrl+C to stop)' -ForegroundColor Cyan
Write-Host ''

Start-Process 'http://localhost:5173'

& npm run dev
