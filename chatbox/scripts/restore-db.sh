#!/usr/bin/env bash
# ==============================================================================
# Script phục hồi dữ liệu Mock JSON cho dự án Chatbox
# Tương thích với môi trường Linux, macOS và Git Bash trên Windows.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${PROJECT_DIR}/database/data"
BACKUPS_DIR="${PROJECT_DIR}/backups"

BACKUP_FILE="${1:-}"

# Nếu chưa truyền file, tự động tìm file backup mới nhất trong thư mục backups (.tar.gz hoặc .zip)
if [ -z "$BACKUP_FILE" ]; then
    if [ -d "$BACKUPS_DIR" ]; then
        BACKUP_FILE=$(ls -t "${BACKUPS_DIR}"/data_backup_* 2>/dev/null | head -n 1 || true)
    fi
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "[ERROR] Không tìm thấy file backup nào. Vui lòng cung cấp đường dẫn file." >&2
    echo "Cách dùng: $0 [duong_dan_file_backup]" >&2
    exit 1
fi

echo "=========================================================="
echo "  CHATBOX JSON DATABASE RESTORE UTILITY (Bash)"
echo "=========================================================="
echo "Target Dir:  ${DATA_DIR}"
echo "Backup File: ${BACKUP_FILE}"
echo "----------------------------------------------------------"

mkdir -p "$DATA_DIR"

if [[ "$BACKUP_FILE" == *.tar.gz || "$BACKUP_FILE" == *.tgz ]]; then
    tar -xzf "${BACKUP_FILE}" -C "${DATA_DIR}"
elif [[ "$BACKUP_FILE" == *.zip ]]; then
    if command -v unzip >/dev/null 2>&1; then
        unzip -o "${BACKUP_FILE}" -d "${DATA_DIR}"
    elif command -v tar >/dev/null 2>&1; then
        tar -xf "${BACKUP_FILE}" -C "${DATA_DIR}"
    else
        echo "[ERROR] Không tìm thấy unzip hoặc tar để giải nén file zip." >&2
        exit 1
    fi
else
    echo "[ERROR] Định dạng file backup không hỗ trợ: ${BACKUP_FILE}" >&2
    exit 1
fi

echo "----------------------------------------------------------"
echo "[SUCCESS] Phục hồi cơ sở dữ liệu thành công!"
echo "=========================================================="
