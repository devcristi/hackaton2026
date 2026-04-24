# NeoGuard - Script de instalare pentru Python și Make
# RULEAZĂ ACEST SCRIPT CA ADMINISTRATOR!

Write-Host "=== NeoGuard Tool Installer ===" -ForegroundColor Cyan
Write-Host ""

# Verifică dacă rulează ca Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "EROARE: Acest script trebuie rulat ca Administrator!" -ForegroundColor Red
    Write-Host "Click dreapta pe PowerShell -> Run as Administrator" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Apasă Enter pentru a ieși"
    exit 1
}

Write-Host "✓ Rulează cu drepturi de Administrator" -ForegroundColor Green
Write-Host ""

# Verifică dacă Chocolatey este instalat
Write-Host "Verifică Chocolatey..." -ForegroundColor Yellow
$chocoInstalled = Get-Command choco -ErrorAction SilentlyContinue

if (-not $chocoInstalled) {
    Write-Host "Instalează Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # Reîncarcă PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "✓ Chocolatey instalat cu succes!" -ForegroundColor Green
} else {
    Write-Host "✓ Chocolatey este deja instalat" -ForegroundColor Green
}

Write-Host ""

# Instalează Python
Write-Host "Instalează Python..." -ForegroundColor Yellow
choco install python -y
Write-Host "✓ Python instalat!" -ForegroundColor Green

Write-Host ""

# Instalează Make
Write-Host "Instalează Make..." -ForegroundColor Yellow
choco install make -y
Write-Host "✓ Make instalat!" -ForegroundColor Green

Write-Host ""
Write-Host "=== INSTALARE COMPLETĂ ===" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: Închide TOATE terminalele și VSCode, apoi redeschide-le!" -ForegroundColor Yellow
Write-Host "După redeschidere, rulează în d:/hackathon:" -ForegroundColor Cyan
Write-Host "  make install" -ForegroundColor White
Write-Host ""
Read-Host "Apasă Enter pentru a ieși"
