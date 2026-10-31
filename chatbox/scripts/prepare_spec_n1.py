#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/prepare_spec_n1.py

Trích xuất, chuẩn hóa và chuyển đổi đặc tả nghiệp vụ từ Markdown sang JSON:
- Nguồn: docs/spec/N1.QLQTKD.md
- Đích: docs/prepared/n1_qlqtkd.json

Đặc tính kỹ thuật:
- Tự động parse cấu trúc Markdown (Roles, Web Salon, Hair Sizes, Service Catalog table).
- Chuẩn hóa forward-fill các ô gộp của bảng Markdown (Nhóm dịch vụ, Tên dịch vụ).
- Parse giá trị số (Giá VNĐ, Thời gian phút, Số NV) thành number thực tế.
- Giữ nguyên 100% tiếng Việt có dấu (UTF-8).
- Tích hợp bộ kiểm tra chất lượng dữ liệu (Data Validation & Integrity Checks).
"""

import os
import sys
import re
import json
import logging
from datetime import datetime
from pathlib import Path

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
logger = logging.getLogger("prepare_spec_n1")

BASE_DIR = Path(__file__).resolve().parent.parent
SPEC_PATH = BASE_DIR / "docs" / "spec" / "N1.QLQTKD.md"
OUTPUT_DIR = BASE_DIR / "docs" / "prepared"
OUTPUT_JSON = OUTPUT_DIR / "n1_qlqtkd.json"


def clean_markdown_text(text: str) -> str:
    """Tỉa khoảng trắng và loại bỏ markdown escape chars."""
    if not text:
        return ""
    cleaned = text.strip()
    cleaned = cleaned.replace(r"\-", "-").replace(r"\+", "+").replace(r"\:", ":")
    cleaned = re.sub(r"^\*\*(.*?)\*\*$", r"\1", cleaned)
    cleaned = cleaned.replace("**", "").replace("*", "")
    return cleaned.strip()


def parse_price(price_str: str) -> int:
    """Chuyển đổi chuỗi giá '130.000' hoặc '130000' sang số nguyên."""
    digits = re.sub(r"[^\d]", "", price_str)
    return int(digits) if digits else 0


def parse_spec_document(file_path: Path) -> dict:
    if not file_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file đặc tả: {file_path}")

    logger.info(f"Bắt đầu đọc và parse tài liệu: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        raw_lines = [line.strip() for line in f.readlines()]

    total_lines = len(raw_lines)
    logger.info(f"Tổng số dòng tài liệu: {total_lines}")

    # Cấu trúc JSON đích
    result = {
        "metadata": {
            "title": "ĐẶC TẢ QUẢN LÝ QUY TRÌNH KINH DOANH & HỆ THỐNG SALON (N1.QLQTKD)",
            "source_file": str(file_path.relative_to(BASE_DIR)).replace("\\", "/"),
            "extracted_at": datetime.now().isoformat(),
            "generator": "scripts/prepare_spec_n1.py",
            "version": "1.0",
            "total_lines_read": total_lines
        },
        "general_ui_specs": {
            "title": "CHỨC NĂNG CÁC ROLES - TỔNG QUAN GIAO DIỆN",
            "navigation_bar": "Menu điều hướng nằm ngang, màu chủ đạo xanh bơ / pastel",
            "notification_system": {
                "has_icon": True,
                "notification_types": [
                    "Khách vào nhắn với chat bot",
                    "Khách yêu cầu muốn gặp nhân viên trong lúc nhắn với AI"
                ],
                "action_on_click": "Bấm vào từng thông báo di chuyển đến khung chat của khách hàng đó"
            }
        },
        "roles_permissions": [],
        "web_salon_interface": {
            "url": None,
            "navigation_items": []
        },
        "hair_size_definitions": {},
        "service_catalog": {
            "summary": {},
            "categories": [],
            "all_services": []
        }
    }

    # Bóc tách từng phần
    # 1. ROLES: CHỦ TIỆM và LỄ TÂN
    current_role = None
    role_tables = {}
    
    # 2. Web Salon
    web_salon_url = None
    web_salon_rows = []

    # 3. Sizes
    hair_sizes = {}

    # 4. Service table rows
    service_table_rows = []

    i = 0
    while i < total_lines:
        line = raw_lines[i]

        # Kiểm tra Role headers
        if line.startswith("1. CHỦ TIỆM"):
            current_role = "CHỦ TIỆM"
            role_tables[current_role] = []
            i += 1
            continue
        elif line.startswith("2. LỄ TÂN"):
            current_role = "LỄ TÂN"
            role_tables[current_role] = []
            i += 1
            continue
        elif "WEB SALON:" in line:
            current_role = None
            url_match = re.search(r"https?://[^\s\)]+", line)
            if url_match:
                web_salon_url = url_match.group(0)
            i += 1
            continue
        elif "BẢNG DỊCH VỤ" in line:
            current_role = None
            i += 1
            continue
        elif line.startswith("Size ") or line.startswith("Sise "):
            # Size definition
            # Size S: Tóc ngắn[Tóc từ cằm trở lên]
            m = re.match(r"^(?:Size|Sise)\s+([A-Z]):\s*(.*)$", line)
            if m:
                size_key = m.group(1)
                desc = clean_markdown_text(m.group(2))
                hair_sizes[size_key] = desc
            i += 1
            continue

        # Parse bảng Markdown
        if line.startswith("|") and line.endswith("|"):
            cells = [clean_markdown_text(c) for c in line.split("|")[1:-1]]
            
            # Bỏ qua dòng phân cách | --- | --- |
            if any(re.match(r"^:?-+:?$", c) for c in cells if c):
                i += 1
                continue
            
            # Bỏ qua dòng header nếu là Menu điều hướng hoặc Nhóm dịch vụ
            if cells and ("Menu điều hướng" in cells[0] or "Nhóm dịch vụ" in cells[0]):
                i += 1
                continue

            # Phân loại dòng bảng vào khu vực tương ứng
            if current_role in role_tables:
                if len(cells) >= 2:
                    role_tables[current_role].append({
                        "menu_item": cells[0],
                        "details_raw": cells[1]
                    })
            elif web_salon_url and not hair_sizes and not service_table_rows:
                if len(cells) >= 2:
                    web_salon_rows.append({
                        "menu_item": cells[0],
                        "description": cells[1]
                    })
            else:
                # Dòng thuộc Bảng dịch vụ
                if len(cells) >= 6:
                    service_table_rows.append(cells[:6])

        i += 1

    # Chuẩn hóa cấu trúc Roles & Permissions
    for role_name, items in role_tables.items():
        role_data = {
            "role_name": role_name,
            "role_code": "OWNER" if role_name == "CHỦ TIỆM" else "RECEPTIONIST",
            "menu_modules": []
        }
        for item in items:
            menu = item["menu_item"]
            details = item["details_raw"]
            
            # Phân tách quyền và cấu hình cụ thể
            module_info = {
                "module_name": menu,
                "raw_description": details,
                "permissions": [],
                "ui_features": []
            }
            # Tìm danh sách quyền
            perm_match = re.search(r"Quyền\s*:\s*([^–\.\n]+)", details, re.IGNORECASE)
            if perm_match:
                perm_str = perm_match.group(1).strip()
                module_info["permissions"] = [p.strip() for p in perm_str.split(",") if p.strip()]

            role_data["menu_modules"].append(module_info)
        result["roles_permissions"].append(role_data)

    # Chuẩn hóa Web Salon Interface
    result["web_salon_interface"]["url"] = web_salon_url
    for r in web_salon_rows:
        menu_name = r["menu_item"]
        desc = r["description"]
        features = [clean_markdown_text(f) for f in re.split(r"\s*[–-]\s*", desc) if clean_markdown_text(f)]
        result["web_salon_interface"]["navigation_items"].append({
            "menu_name": menu_name,
            "description": desc,
            "features": features
        })

    # Chuẩn hóa Hair sizes
    result["hair_size_definitions"] = hair_sizes

    # Chuẩn hóa Service Catalog Table với forward-fill
    current_category = ""
    current_service_name = ""
    grouped_categories = {}
    flat_services = []

    for row_idx, cells in enumerate(service_table_rows, 1):
        cat_cell, svc_cell, size_cell, price_cell, dur_cell, staff_cell = cells

        if cat_cell:
            current_category = cat_cell
        if svc_cell:
            current_service_name = svc_cell

        size_val = size_cell if size_cell else "Standard"
        price_val = parse_price(price_cell)
        duration_val = int(dur_cell) if dur_cell.isdigit() else 0
        staff_val = int(staff_cell) if staff_cell.isdigit() else 1

        service_item = {
            "id": row_idx,
            "category": current_category,
            "service_name": current_service_name,
            "size": size_val,
            "price_vnd": price_val,
            "price_formatted": f"{price_val:,} VNĐ".replace(",", "."),
            "duration_minutes": duration_val,
            "required_staff": staff_val
        }
        flat_services.append(service_item)

        # Đưa vào cấu trúc nhóm phân cấp
        if current_category not in grouped_categories:
            grouped_categories[current_category] = {}
        
        if current_service_name not in grouped_categories[current_category]:
            grouped_categories[current_category][current_service_name] = {
                "service_name": current_service_name,
                "category": current_category,
                "duration_minutes": duration_val,
                "required_staff": staff_val,
                "variants": []
            }
        
        grouped_categories[current_category][current_service_name]["variants"].append({
            "size": size_val,
            "price_vnd": price_val,
            "price_formatted": service_item["price_formatted"],
            "duration_minutes": duration_val,
            "required_staff": staff_val
        })

    # Chuyển grouped_categories sang mảng
    categories_list = []
    for cat_name, svc_dict in grouped_categories.items():
        cat_obj = {
            "category_name": cat_name,
            "total_services": len(svc_dict),
            "services": list(svc_dict.values())
        }
        categories_list.append(cat_obj)

    result["service_catalog"]["categories"] = categories_list
    result["service_catalog"]["all_services"] = flat_services
    result["service_catalog"]["summary"] = {
        "total_categories": len(categories_list),
        "total_unique_services": sum(len(c["services"]) for c in categories_list),
        "total_price_entries": len(flat_services),
        "price_min_vnd": min((s["price_vnd"] for s in flat_services), default=0),
        "price_max_vnd": max((s["price_vnd"] for s in flat_services), default=0)
    }

    return result


def validate_extracted_data(data: dict):
    """Kiểm tra tính toàn vẹn và hợp lệ của dữ liệu đã trích xuất."""
    logger.info("Đang kiểm định chất lượng dữ liệu (Data Validation)...")
    
    # 1. Kiểm tra roles
    assert len(data["roles_permissions"]) == 2, f"Kỳ vọng 2 roles, thực tế: {len(data['roles_permissions'])}"
    role_names = [r["role_name"] for r in data["roles_permissions"]]
    assert "CHỦ TIỆM" in role_names and "LỄ TÂN" in role_names, f"Thiếu role: {role_names}"
    logger.info(f"✓ Đã xác thực 2 roles: {role_names}")

    # 2. Kiểm tra web salon navigation
    nav_items = data["web_salon_interface"]["navigation_items"]
    assert len(nav_items) >= 9, f"Kỳ vọng ít nhất 9 menu items trong Web Salon, thực tế: {len(nav_items)}"
    assert data["web_salon_interface"]["url"] is not None, "URL Web Salon không được để trống"
    logger.info(f"✓ Đã xác thực {len(nav_items)} menu items trong Web Salon ({data['web_salon_interface']['url']})")

    # 3. Kiểm tra hair sizes
    sizes = data["hair_size_definitions"]
    assert "S" in sizes and "M" in sizes and "L" in sizes, f"Thiếu định nghĩa size tóc: {sizes}"
    logger.info(f"✓ Đã xác thực các size tóc: {list(sizes.keys())}")

    # 4. Kiểm tra service catalog
    services = data["service_catalog"]["all_services"]
    assert len(services) == 78, f"Kỳ vọng 78 dịch vụ, thực tế: {len(services)}"
    for s in services:
        assert s["category"], f"Dịch vụ id {s['id']} bị thiếu category"
        assert s["service_name"], f"Dịch vụ id {s['id']} bị thiếu service_name"
        assert s["price_vnd"] > 0, f"Dịch vụ {s['service_name']} ({s['size']}) giá không hợp lệ: {s['price_vnd']}"
        assert s["duration_minutes"] > 0, f"Dịch vụ {s['service_name']} ({s['size']}) thời lượng không hợp lệ"
        assert s["required_staff"] >= 1, f"Dịch vụ {s['service_name']} ({s['size']}) số NV không hợp lệ"
    logger.info(f"✓ Đã xác thực 78 mục dịch vụ (Tất cả danh mục, tên dịch vụ, giá > 0, thời lượng > 0)")


def main():
    logger.info("=== BẮT ĐẦU QUY TRÌNH PREPARE TÀI LIỆU N1.QLQTKD.md ===")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    data = parse_spec_document(SPEC_PATH)
    validate_extracted_data(data)

    logger.info(f"Đang ghi kết quả ra file JSON: {OUTPUT_JSON}")
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    file_size_kb = OUTPUT_JSON.stat().st_size / 1024
    logger.info(f"=== HOÀN TẤT THÀNH CÔNG ===")
    logger.info(f"File kết quả: {OUTPUT_JSON} ({file_size_kb:.2f} KB)")


if __name__ == "__main__":
    main()

