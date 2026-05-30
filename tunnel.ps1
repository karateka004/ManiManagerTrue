# Koshel - public HTTPS tunnel via Cloudflare (for Telegram Mini App)
#
# What it does:
#  1. Downloads cloudflared.exe into the project folder (first run only).
#  2. Opens a tunnel http://localhost:5173 -> https://<random>.trycloudflare.com
#  3. Prints the HTTPS URL you paste into BotFather.
#
# Usage:
#   1) Make sure start.cmd / start.ps1 is already running (Vite dev server).
#   2) In a SECOND PowerShell window:
#         powershell -ExecutionPolicy Bypass -File .\tunnel.ps1
#
# Stop with Ctrl+C.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$exe = Join-Path $PSScriptRoot 'cloudflared.exe'

if (-not (Test-Path $exe)) {
    Write-Host 'cloudflared.exe not found - downloading (~25 MB)...' -ForegroundColor Cyan
    $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    try {
        # Use TLS 1.2 (some Windows defaults are too old)
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
    } catch {
        Write-Host '[X] Download failed.' -ForegroundColor Red
        Write-Host $_.Exception.Message
        Write-Host ''
        Write-Host 'Manual fallback:'
        Write-Host '  1) Open https://github.com/cloudflare/cloudflared/releases/latest'
        Write-Host '  2) Download cloudflared-windows-amd64.exe'
        Write-Host '  3) Rename it to cloudflared.exe'
        Write-Host '  4) Put it next to this script and run it again.'
        exit 1
    }
    Write-Host '  Downloaded.' -ForegroundColor Green
}

Write-Host ''
Write-Host '==============================================' -ForegroundColor Green
Write-Host '  Starting tunnel to http://127.0.0.1:5173'
Write-Host '  Look for a line like:'
Write-Host '     https://<words-and-numbers>.trycloudflare.com'
Write-Host '  Copy that URL and paste it into BotFather.'
Write-Host '  Ctrl+C - stop the tunnel.'
Write-Host '==============================================' -ForegroundColor Green
Write-Host ''

# --protocol http2 - forces TCP/HTTPS instead of QUIC/UDP.
# Needed when the network (ISP / router / antivirus) blocks UDP outbound,
# which is the most common reason for "failed to dial a quic connection" errors.
& $exe tunnel --url 'http://127.0.0.1:5173' --protocol http2 --edge-ip-version 4
