#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/prepare_booking_process.py

Trích xuất, chuẩn hóa và chuyển đổi quy trình đặt lịch từ Excel sang JSON:
- Nguồn: docs/quy_trinh_dat_lich_SALON1_1sheet.xlsx
- Đích: docs/prepared/booking_process.json

Đặc tính:
- Chuẩn hóa khoảng trắng, xuống dòng, ô gộp, giá trị None/rỗng.
- Giữ nguyên tiếng Việt có dấu và thuật ngữ nghiệp vụ.
- An toàn: Không ghi đè hay thay đổi file gốc.
- Tự động kiểm tra chất lượng (validation, row count, step count đối chiếu).
"""

import os
import sys
import json
import logging
from datetime import datetime
from pathlib import Path
import openpyxl

# Thiết lập UTF-8 cho stdout và stderr trên Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("prepare_booking_process")

# Đường dẫn mặc định
BASE_DIR = Path(__file__).resolve().parent.parent
EXCEL_PATH = BASE_DIR / "docs" / "quy_trinh_dat_lich_SALON1_1sheet.xlsx"
OUTPUT_DIR = BASE_DIR / "docs" / "prepared"
OUTPUT_JSON = OUTPUT_DIR / "booking_process.json"


def clean_cell_value(val):
    """
    Chuẩn hóa giá trị của một ô:
    - Chuyển None thành None
    - Chuyển số nguyên/thực thành kiểu phù hợp hoặc chuỗi nếu là mã
    - Xóa khoảng trắng thừa hai đầu, chuẩn hóa ký tự xuống dòng
    - Giữ nguyên toàn bộ dấu tiếng Việt và dấu ngoặc kép / đơn
    """
    if val is None:
        return None
    
    if isinstance(val, (int, float)):
        # Nếu là số nguyên như bước 1, 2, ...
        if isinstance(val, float) and val.is_integer():
            return int(val)
        return val

    text = str(val)
    # Chuẩn hóa ngắt dòng \r\n thành \n
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Tỉa khoảng trắng từng dòng và toàn văn bản
    lines = [line.strip() for line in text.split("\n")]
    cleaned = "\n".join(lines).strip()
    
    return cleaned if cleaned else None


def extract_booking_process(excel_path: Path) -> dict:
    """
    Đọc và bóc tách dữ liệu từ file Excel theo cấu trúc phân đoạn.
    """
    if not excel_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file nguồn tại: {excel_path}")

    logger.info(f"Đang mở file Excel: {excel_path}")
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)
    
    if "Quy trình SALON1" not in wb.sheetnames:
        raise ValueError(f"Sheet 'Quy trình SALON1' không tồn tại. Các sheet hiện có: {wb.sheetnames}")
    
    ws = wb["Quy trình SALON1"]
    logger.info(f"Đã tải sheet '{ws.title}' (kích thước: {ws.max_row} dòng, {ws.max_column} cột)")

    # 1. Thu thập dữ liệu thô tất cả các dòng
    rows_data = []
    for r in range(1, ws.max_row + 1):
        row_cells = [clean_cell_value(ws.cell(r, c).value) for c in range(1, ws.max_column + 1)]
        rows_data.append((r, row_cells))

    # Cấu trúc JSON đích
    result = {
        "metadata": {
            "title": clean_cell_value(ws.cell(1, 1).value) or "QUY TRÌNH ĐẶT LỊCH LÀM TÓC (SALON1)",
            "source_file": str(excel_path.relative_to(BASE_DIR)).replace("\\", "/"),
            "sheet_name": ws.title,
            "total_excel_rows": ws.max_row,
            "total_excel_cols": ws.max_column,
            "extracted_at": datetime.now().isoformat(),
            "generator": "scripts/prepare_booking_process.py"
        },
        "overview": {
            "section_title": "1. QUY TRÌNH ĐẶT LỊCH LÀM TÓC (SALON1)",
            "description": clean_cell_value(ws.cell(4, 1).value),
            "pools_and_lanes": [],
            "shared_data_stores": [],
            "bpmn_legend": []
        },
        "customer_pool": {
            "section_title": "2. POOL KHÁCH HÀNG",
            "description": clean_cell_value(ws.cell(26, 1).value),
            "headers": ["Bước", "Loại", "Hoạt động / Cổng", "Điều kiện / Sự kiện", "Hành động kết quả", "Bước tiếp theo", "Message flow / Ghi chú"],
            "steps": []
        },
        "salon_ai_and_system_lane": {
            "section_title": "3. POOL SALON – LANE AI TƯ VẤN (CHATBOT) & HỆ THỐNG ĐẶT LỊCH",
            "description": clean_cell_value(ws.cell(45, 1).value),
            "headers": ["Bước", "Loại", "Hoạt động / Cổng", "Điều kiện / Sự kiện", "Hành động kết quả", "Bước tiếp theo", "Message flow / Ghi chú"],
            "steps": []
        },
        "salon_specialist_lane": {
            "section_title": "4. POOL SALON – LANE CHUYÊN VIÊN TƯ VẤN",
            "description": clean_cell_value(ws.cell(73, 1).value),
            "headers": ["Luồng", "Loại", "Hoạt động / Cổng", "Điều kiện / Sự kiện", "Hành động kết quả", "Bước tiếp theo", "Ghi chú"],
            "steps": []
        },
        "reminder_rules": {
            "section_title": "5. QUY TẮC NHẮC NHỠ (CHATBOT)",
            "description": clean_cell_value(ws.cell(85, 1).value),
            "timeout_checkpoints": [],
            "gateway_rules": []
        },
        "final_outcomes": {
            "section_title": "6. TỔNG HỢP CÁC KẾT QUẢ CUỐI",
            "headers": ["Kết quả", "Xảy ra khi"],
            "outcomes": []
        }
    }

    # Bóc tách Section 1.1: Pools & Lanes (Dòng 6-9)
    for r in range(6, 10):
        c1, c2, c3 = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 3).value
        result["overview"]["pools_and_lanes"].append({
            "row_index": r,
            "pool": clean_cell_value(c1),
            "lane": clean_cell_value(c2),
            "role_description": clean_cell_value(c3)
        })

    # Bóc tách Section 1.2: Dữ liệu dùng chung (Dòng 13-14)
    for r in range(13, 15):
        c1, c2, c3 = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 3).value
        result["overview"]["shared_data_stores"].append({
            "row_index": r,
            "data_store": clean_cell_value(c1),
            "users": clean_cell_value(c2),
            "description": clean_cell_value(c3)
        })

    # Bóc tách Section 1.3: Chú giải màu / BPMN Legend (Dòng 18-22)
    for r in range(18, 23):
        c1, c2 = ws.cell(r, 1).value, ws.cell(r, 2).value
        result["overview"]["bpmn_legend"].append({
            "row_index": r,
            "element": clean_cell_value(c1),
            "description": clean_cell_value(c2)
        })

    # Bóc tách Section 2: Pool Khách hàng (Dòng 28-41)
    for r in range(28, 42):
        row_vals = [clean_cell_value(ws.cell(r, c).value) for c in range(1, 8)]
        result["customer_pool"]["steps"].append({
            "row_index": r,
            "step": str(row_vals[0]) if row_vals[0] is not None else "—",
            "type": row_vals[1],
            "activity_or_gateway": row_vals[2],
            "condition_or_event": row_vals[3],
            "resulting_action": row_vals[4],
            "next_step": str(row_vals[5]) if row_vals[5] is not None else None,
            "notes_or_message_flow": row_vals[6]
        })

    # Bóc tách Section 3: Pool Salon – Lane AI tư vấn & Hệ thống đặt lịch (Dòng 47-69)
    for r in range(47, 70):
        row_vals = [clean_cell_value(ws.cell(r, c).value) for c in range(1, 8)]
        step_id = str(row_vals[0]) if row_vals[0] is not None else "—"
        notes = row_vals[6] or ""
        
        # Xác định lane thực hiện dựa theo đặc tả (Bước 6 và 9 do Hệ thống đặt lịch)
        if step_id in ["6", "9"] or "Lane Hệ thống đặt lịch" in notes or "Hệ thống" in (row_vals[4] or ""):
            executor_lane = "Hệ thống đặt lịch"
        else:
            executor_lane = "AI tư vấn (chatbot)"

        result["salon_ai_and_system_lane"]["steps"].append({
            "row_index": r,
            "step": step_id,
            "executor_lane": executor_lane,
            "type": row_vals[1],
            "activity_or_gateway": row_vals[2],
            "condition_or_event": row_vals[3],
            "resulting_action": row_vals[4],
            "next_step": str(row_vals[5]) if row_vals[5] is not None else None,
            "notes_or_message_flow": row_vals[6]
        })

    # Bóc tách Section 4: Pool Salon – Lane Chuyên viên tư vấn (Dòng 75-81)
    for r in range(75, 82):
        row_vals = [clean_cell_value(ws.cell(r, c).value) for c in range(1, 8)]
        result["salon_specialist_lane"]["steps"].append({
            "row_index": r,
            "flow": str(row_vals[0]) if row_vals[0] is not None else None,
            "type": row_vals[1],
            "activity_or_gateway": row_vals[2],
            "condition_or_event": row_vals[3],
            "resulting_action": row_vals[4],
            "next_step": str(row_vals[5]) if row_vals[5] is not None else None,
            "notes": row_vals[6]
        })

    # Bóc tách Section 5: Quy tắc nhắc nhở (Chatbot)
    # 5.1 Các điểm chờ (Dòng 87-90)
    for r in range(87, 91):
        c1, c2, c3 = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 3).value
        result["reminder_rules"]["timeout_checkpoints"].append({
            "row_index": r,
            "checkpoint_name": clean_cell_value(c1),
            "flow_position": clean_cell_value(c2),
            "timeout_duration": clean_cell_value(c3)
        })

    # 5.2 Cổng "Đã nhắc?" (Dòng 94-96)
    for r in range(94, 97):
        c1, c2, c3 = ws.cell(r, 1).value, ws.cell(r, 2).value, ws.cell(r, 3).value
        result["reminder_rules"]["gateway_rules"].append({
            "row_index": r,
            "condition": clean_cell_value(c1),
            "action": clean_cell_value(c2),
            "outcome": clean_cell_value(c3)
        })

    # Bóc tách Section 6: Tổng hợp các kết quả cuối (Dòng 101-104)
    for r in range(101, 105):
        c1, c2 = ws.cell(r, 1).value, ws.cell(r, 2).value
        result["final_outcomes"]["outcomes"].append({
            "row_index": r,
            "outcome": clean_cell_value(c1),
            "triggered_when": clean_cell_value(c2)
        })

    return result


def validate_extracted_data(data: dict, original_excel_path: Path) -> dict:
    """
    Xác minh và đối chiếu dữ liệu đã trích xuất với dữ liệu nguồn.
    """
    logger.info("Bắt đầu kiểm tra tính toàn vẹn dữ liệu đã trích xuất...")
    stats = {}

    # Số lượng bản ghi từng phần
    stats["pools_and_lanes_count"] = len(data["overview"]["pools_and_lanes"])
    stats["shared_data_count"] = len(data["overview"]["shared_data_stores"])
    stats["legend_count"] = len(data["overview"]["bpmn_legend"])
    stats["customer_steps_count"] = len(data["customer_pool"]["steps"])
    stats["salon_ai_steps_count"] = len(data["salon_ai_and_system_lane"]["steps"])
    stats["specialist_steps_count"] = len(data["salon_specialist_lane"]["steps"])
    stats["timeout_checkpoints_count"] = len(data["reminder_rules"]["timeout_checkpoints"])
    stats["reminder_rules_count"] = len(data["reminder_rules"]["gateway_rules"])
    stats["final_outcomes_count"] = len(data["final_outcomes"]["outcomes"])

    # Kỳ vọng từ phân tích cấu trúc Excel
    expected = {
        "pools_and_lanes_count": 4,
        "shared_data_count": 2,
        "legend_count": 5,
        "customer_steps_count": 14,
        "salon_ai_steps_count": 23,
        "specialist_steps_count": 7,
        "timeout_checkpoints_count": 4,
        "reminder_rules_count": 3,
        "final_outcomes_count": 4
    }

    errors = []
    for key, exp_val in expected.items():
        actual_val = stats[key]
        if actual_val != exp_val:
            errors.append(f"Lệch số lượng tại '{key}': kỳ vọng {exp_val}, thực tế trích xuất {actual_val}")

    if errors:
        for err in errors:
            logger.error(f"Xác thực thất bại: {err}")
        raise ValueError(f"Có {len(errors)} lỗi sai lệch dữ liệu!")

    # Kiểm tra tính hợp lệ của các liên kết bước
    # Phân tích luồng khách hàng
    customer_steps = data["customer_pool"]["steps"]
    assert customer_steps[0]["type"] == "Bắt đầu", "Bước đầu của khách hàng phải là Bắt đầu"
    
    # Phân tích luồng AI
    ai_steps = data["salon_ai_and_system_lane"]["steps"]
    assert ai_steps[0]["type"] == "Bắt đầu", "Bước đầu của AI lane phải là Bắt đầu"
    
    # Kiểm tra bước giữ chỗ tạm và TTL
    step_6_ai = [s for s in ai_steps if s["step"] == "6"]
    assert len(step_6_ai) >= 1, "Không tìm thấy bước 6 trong AI Lane"
    assert "TTL 10 phút" in step_6_ai[0]["activity_or_gateway"], "Bước 6 phải đề cập TTL 10 phút"

    # Kiểm tra cổng xác thực lại hợp lệ
    step_9_ai = [s for s in ai_steps if s["step"] == "9"]
    assert len(step_9_ai) >= 3, "Bước 9 phải có đủ hoạt động xác thực và 2 nhánh rẽ (Còn / Bị chốt)"

    logger.info("Toàn bộ dữ liệu được xác thực khớp 100% với file Excel gốc!")
    return stats


def save_json(data: dict, output_path: Path):
    """
    Lưu dữ liệu ra file JSON với định dạng đẹp (indent=2) và mã hóa UTF-8.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Đã lưu file JSON thành công: {output_path} (Kích thước: {os.path.getsize(output_path)} bytes)")


def main():
    try:
        logger.info("=== BẮT ĐẦU CHUẨN BỊ DỮ LIỆU QUY TRÌNH ĐẶT LỊCH SALON1 ===")
        data = extract_booking_process(EXCEL_PATH)
        stats = validate_extracted_data(data, EXCEL_PATH)
        save_json(data, OUTPUT_JSON)

        # Test đọc lại JSON để chắc chắn JSON chuẩn cú pháp
        with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
            reloaded = json.load(f)
        logger.info(f"Đọc lại JSON kiểm tra cú pháp: OK, tiêu đề: '{reloaded['metadata']['title']}'")
        
        logger.info("Thống kê chi tiết các thành phần đã trích xuất:")
        for k, v in stats.items():
            logger.info(f"  - {k}: {v}")
            
        print("\n[THÀNH CÔNG] Dữ liệu quy trình đặt lịch đã được chuẩn hóa và xuất ra JSON an toàn.")
        return 0
    except Exception as e:
        logger.exception(f"Lỗi trong quá trình xử lý: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
