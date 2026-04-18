# ═══════════════════════════════════════════
#   Credbusiness — Quick Deploy via native SSH
#   Uploads changed files and restarts PM2
# ═══════════════════════════════════════════

$ErrorActionPreference = "Continue"
$VPS_HOST = "177.153.58.152"
$VPS_USER = "root"
$VPS_PORT = 22
$APP_DIR = "/var/www/credbusiness"
$LOCAL_DIR = Split-Path $PSScriptRoot -Parent

Write-Host "╔══════════════════════════════════════════╗"
Write-Host "║  Credbusiness - Quick Deploy              ║"
Write-Host "╚══════════════════════════════════════════╝"
Write-Host ""

# Files to upload (only the ones we changed + critical files)
$files = @(
    "routes/payments.js",
    "pages/dashboard.html",
    "pages/meu-plano.html",
    "js/components.js",
    "js/data.js",
    "server.js",
    "utils/asaas.js",
    "middleware/auth.js",
    "package.json"
)

# Also upload all pages, js, css, admin, routes, utils, middleware, database
$folders = @("pages", "js", "css", "admin", "routes", "utils", "middleware", "database")

Write-Host "Uploading files to VPS..."

foreach ($folder in $folders) {
    $localFolder = Join-Path $LOCAL_DIR $folder
    if (Test-Path $localFolder) {
        $folderFiles = Get-ChildItem -Path $localFolder -File -Recurse
        foreach ($f in $folderFiles) {
            $relativePath = $f.FullName.Substring($LOCAL_DIR.Length + 1).Replace("\", "/")
            $remotePath = "$APP_DIR/$relativePath"
            $remoteDir = Split-Path $remotePath -Parent
            Write-Host "  -> $relativePath"
            scp -P $VPS_PORT -o StrictHostKeyChecking=no "$($f.FullName)" "${VPS_USER}@${VPS_HOST}:${remotePath}" 2>&1 | Out-Null
        }
    }
}

# Upload root files
$rootFiles = @("server.js", "package.json", "manifest.json", "sw.js", "index.html", "login.html", "register.html", "offline.html", "contrato.html", "politica-de-privacidade.html", "termos-de-uso.html", "password-forgot.html", "password-reset.html", "ecosystem.config.js")
foreach ($f in $rootFiles) {
    $localFile = Join-Path $LOCAL_DIR $f
    if (Test-Path $localFile) {
        Write-Host "  -> $f"
        scp -P $VPS_PORT -o StrictHostKeyChecking=no "$localFile" "${VPS_USER}@${VPS_HOST}:${APP_DIR}/${f}" 2>&1 | Out-Null
    }
}

Write-Host ""
Write-Host "Restarting application..."
ssh -p $VPS_PORT -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "cd /var/www/credbusiness ; npm install --production ; pm2 restart credbusiness"

Write-Host ""
Write-Host "Checking status..."
ssh -p $VPS_PORT -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "pm2 status"

Write-Host ""
Write-Host "Deploy complete!"
Write-Host "URL: http://mkt-credbusiness.vps-kinghost.net"
