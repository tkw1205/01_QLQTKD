#!/usr/bin/env bash
# ==============================================================================
# Script sao lưu dữ liệu Mock JSON cho dự án Chatbox
# Tương thích với môi trường Linux, macOS và Git Bash trên Windows.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${PROJECT_DIR}/database/data"

OUTPUT_DIR="${1:-backups}"
TARGET_DIR="${PROJECT_DIR}/${OUTPUT_DIR}"
mkdir -p "$TARGET_DIR"

if [ ! -d "$DATA_DIR" ]; then
    echo "[ERROR] Thư mục dữ liệu '${DATA_DIR}' không tồn tại." >&2
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${TARGET_DIR}/data_backup_${TIMESTAMP}.tar.gz"

echo "=========================================================="
echo "  CHATBOX JSON DATABASE BACKUP UTILITY (Bash)"
echo "=========================================================="
echo "Source:    ${DATA_DIR}"
echo "Output:    ${BACKUP_FILE}"
echo "----------------------------------------------------------"

tar -czf "${BACKUP_FILE}" -C "${DATA_DIR}" .

if [ -s "${BACKUP_FILE}" ]; then
    FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "----------------------------------------------------------"
    echo "[SUCCESS] Sao lưu thành công!"
    echo "File sao lưu: ${BACKUP_FILE}"
    echo "Dung lượng:   ${FILE_SIZE}"
    echo "=========================================================="
else
    echo "[ERROR] File sao lưu trống hoặc không được tạo thành công." >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi
