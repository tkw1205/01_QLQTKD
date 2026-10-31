<#
.SYNOPSIS
    Phuc hoi du lieu Mock JSON cho du an Chatbox tu file backup zip hoac tar.gz.
.DESCRIPTION
    Tu dong tim file backup moi nhat trong thu muc backups neu khong chi dinh ro file.
    Giai nen cac file JSON vao database/data/.
.PARAMETER BackupFile
    Duong dan toi file backup can phuc hoi. Mac dinh lay file moi nhat trong thu muc backups.
.PARAMETER Force
    Bo qua buoc xac nhan canh bao ghi de du lieu.
.EXAMPLE
    .\scripts\restore-db.ps1
    .\scripts\restore-db.ps1 -BackupFile "backups\data_backup_20261028_120000.zip" -Force
#>

[CmdletBinding()]
param (
    [string]$BackupFile = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DataDir = Join-Path $ProjectDir "database\data"
$BackupsDir = Join-Path $ProjectDir "backups"

# Determine backup file
if (-not $BackupFile) {
    if (Test-Path $BackupsDir) {
        $latest = Get-ChildItem -Path $BackupsDir | Where-Object { $_.Name -like "data_backup_*.zip" -or $_.Name -like "data_backup_*.tar.gz" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            $BackupFile = $latest.FullName
        }
    }
}

if (-not $BackupFile -or -not (Test-Path $BackupFile)) {
    Write-Error "No backup file found to restore in '$BackupsDir'. Please specify -BackupFile."
    exit 1
}

$ResolvedBackupPath = (Resolve-Path $BackupFile).Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CHATBOX JSON DATABASE RESTORE UTILITY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Dir:  $DataDir"
Write-Host "Backup File: $ResolvedBackupPath"
Write-Host "----------------------------------------------------------"

if (-not $Force) {
    Write-Host "[WARNING] All current data in '$DataDir' will be overwritten!" -ForegroundColor Yellow
    $confirm = Read-Host "Are you sure you want to proceed? (y/N)"
    if ($confirm -notmatch "^[Yy]$") {
        Write-Host "Restore cancelled." -ForegroundColor Gray
        exit 0
    }
}

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

Write-Host "[INFO] Restoring data from $ResolvedBackupPath..."
if ($ResolvedBackupPath.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
    Expand-Archive -Path $ResolvedBackupPath -DestinationPath $DataDir -Force
} elseif ($ResolvedBackupPath.EndsWith(".tar.gz", [System.StringComparison]::OrdinalIgnoreCase)) {
    tar -xzf $ResolvedBackupPath -C $DataDir
} else {
    Write-Error "Unsupported file format: $ResolvedBackupPath"
    exit 1
}

$restoredFiles = Get-ChildItem -Path $DataDir -Filter "*.json"
Write-Host "----------------------------------------------------------"
Write-Host "[SUCCESS] Database restored successfully!" -ForegroundColor Green
Write-Host "Restored $($restoredFiles.Count) JSON files:"
$restoredFiles | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host "=========================================================="
