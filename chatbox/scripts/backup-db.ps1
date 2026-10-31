<#
.SYNOPSIS
    Sao luu du lieu Mock JSON cho du an Chatbox.
.DESCRIPTION
    Nen toan bo cac file JSON trong database/data/ thanh file zip luu vao thu muc backups.
.PARAMETER OutputDir
    Thu muc luu file backup (mac dinh: backups).
.EXAMPLE
    .\scripts\backup-db.ps1
    .\scripts\backup-db.ps1 -OutputDir "backups"
#>

[CmdletBinding()]
param (
    [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$DataDir = Join-Path $ProjectDir "database\data"

if (-not (Test-Path $DataDir)) {
    Write-Error "Data directory '$DataDir' does not exist."
    exit 1
}

$TargetDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $ProjectDir $OutputDir }
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFileName = "data_backup_${Timestamp}.zip"
$BackupFilePath = Join-Path $TargetDir $BackupFileName

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CHATBOX JSON DATABASE BACKUP UTILITY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Source:    $DataDir"
Write-Host "Dest:      $BackupFilePath"
Write-Host "----------------------------------------------------------"

$jsonFiles = Get-ChildItem -Path $DataDir -Filter "*.json"
if ($jsonFiles.Count -eq 0) {
    Write-Warning "No JSON files found in '$DataDir'."
} else {
    Write-Host "[INFO] Found $($jsonFiles.Count) JSON files to backup:"
    $jsonFiles | ForEach-Object { Write-Host "  - $($_.Name)" }
}

# Compress database/data files to zip
Compress-Archive -Path "$DataDir\*" -DestinationPath $BackupFilePath -Force

if (Test-Path $BackupFilePath) {
    $item = Get-Item $BackupFilePath
    $sizeKb = [Math]::Round($item.Length / 1KB, 2)
    Write-Host "----------------------------------------------------------"
    Write-Host "[SUCCESS] Backup completed successfully!" -ForegroundColor Green
    Write-Host "Backup file: $BackupFilePath"
    Write-Host "Size:        $sizeKb KB"
    Write-Host "=========================================================="
} else {
    Write-Error "Failed to create backup file."
    exit 1
}
