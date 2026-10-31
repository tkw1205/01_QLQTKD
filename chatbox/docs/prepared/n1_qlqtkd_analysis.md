# BÁO CÁO PHÂN TÍCH VÀ ĐẶC TẢ NGHIỆP VỤ N1.QLQTKD

> **Mã tài liệu**: `SPEC-N1-QLQTKD-001`  
> **Phiên bản chuẩn hóa**: `1.0.0`  
> **Tài liệu nguồn**: `docs/spec/N1.QLQTKD.md`  
> **Dữ liệu JSON chuẩn hóa**: `docs/prepared/n1_qlqtkd.json`  
> **Hệ thống đối chiếu**: Website tư vấn sản phẩm, chat AI đặt lịch và chuyển giao tiếp trực tiếp với nhân viên Admin (`chatbox-consulting-platform`)

---

## 1. TỔNG QUAN ĐẶC TẢ (SPEC OVERVIEW)

Tài liệu `N1.QLQTKD.md` đặc tả toàn diện mô hình vận hành của hệ thống Salon tóc & nền tảng Chatbox tư vấn đặt lịch, bao gồm 4 cấu phần chủ chốt:
1. **Thiết kế UI/UX & Hệ thống Thông báo (Notification System)**: Định hướng màu sắc thương hiệu pastel/xanh bơ, thanh điều hướng ngang, cơ chế bắn thông báo thời gian thực khi khách chat với bot hoặc yêu cầu gặp chuyên viên.
2. **Phân quyền vai trò (Role-Based Access Control - RBAC)**: Phân định chi tiết giữa **CHỦ TIỆM (Owner)** và **LỄ TÂN (Receptionist)** về quyền quản trị Lịch hẹn, Dịch vụ, Chat khách hàng, và Nhân sự & Lịch làm việc.
3. **Cấu trúc Web Salon & Kịch bản tương tác người dùng (Web Salon Experience)**: Luồng trải nghiệm khách hàng từ trang chủ, danh mục dịch vụ, bộ sưu tập kiểu tóc, cho đến tương tác khung Chat tư vấn, giữ chỗ tạm 10 phút và chuyển giao nhân viên.
4. **Bảng dịch vụ chuẩn hóa (Service & Pricing Catalog)**: 78 biến thể dịch vụ thuộc 8 nhóm dịch vụ chính, kèm phân loại độ dài tóc (Size S, M, L), thời lượng, đơn giá và số lượng nhân sự yêu cầu.

---

## 2. BẢNG PHÂN QUYỀN VAI TRÒ (ROLES & PERMISSIONS)

| Phân hệ / Module | CHỦ TIỆM (Owner) | LỄ TÂN (Receptionist) | Ghi chú kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Quản lý lịch hẹn** | Toàn quyền: Tạo, Sửa, Xóa, Xem chi tiết.<br>Xem 2 dạng: Theo lịch nhân viên / Theo bảng đặt lịch theo khách.<br>Lọc theo Ngày, Giờ bắt đầu, Tìm gần đúng theo tên khách. | Toàn quyền: Tạo, Sửa, Xóa, Xem chi tiết.<br>Xem 2 dạng: Theo lịch nhân viên / Theo bảng đặt lịch theo khách.<br>Lọc theo Ngày, Giờ bắt đầu, Tìm gần đúng theo tên khách. | Mã lịch hẹn sinh tự động (không cho sửa).<br>Trạng thái: Mới đặt, Đang phục vụ, Hoàn thành, Đã hủy. |
| **Quản lý dịch vụ** | Toàn quyền: Tạo dịch vụ, Tạo nhóm dịch vụ, Sửa, Xóa, Xem chi tiết.<br>Thao tác size tóc, giá tương ứng, thời gian, số NV. | Quyền: Xem dịch vụ, Xem chi tiết biến thể size & giá.<br>Tìm kiếm theo tên, Lọc theo nhóm. | Lễ tân chỉ có quyền đọc/tra cứu (Read-only), không có quyền thêm/sửa/xóa dịch vụ. |
| **Theo dõi chat (Inbox)** | Chat trực tiếp với khách (Giao diện Messenger: Flexbox danh sách khách hàng bên trái, khung chat bên phải). | Chat trực tiếp với khách (Giao diện Messenger: Flexbox danh sách khách hàng bên trái, khung chat bên phải). | Đồng bộ real-time qua Socket.IO với phòng `agents`. |
| **Quản lý nhân viên & Lịch làm việc** | Toàn quyền: Tạo, Sửa, Xóa nhân viên; Tạo lịch làm việc.<br>2 Tabs: Danh sách nhân viên \| Lịch làm việc (giao diện Calendar). | Không có quyền (Ẩn menu). | Phân hệ chỉ dành riêng cho Chủ tiệm để quản lý ca kíp và năng lực chuyên môn nhân viên. |

---

## 3. QUY TRÌNH THÔNG BÁO REAL-TIME (NOTIFICATION WORKFLOW)

- **Vị trí hiển thị**: Icon thông báo nằm trên thanh điều hướng ngang (Header bar).
- **Các sự kiện kích hoạt**:
  1. *Khách vào nhắn với Chatbot*: Hệ thống ghi nhận khách hàng mới bắt đầu phiên chat hoặc có tin nhắn mới cần theo dõi.
  2. *Khách yêu cầu gặp nhân viên*: Khách chủ động bấm hoặc yêu cầu "Gặp chuyên viên" khi đang chat với AI (Handoff event).
- **Tương tác**: Click vào thông báo sẽ tự động điều hướng người dùng trực tiếp đến hội thoại và mở đúng khung chat của khách hàng đó.

---

## 4. BẢNG TỔNG HỢP DANH MỤC DỊCH VỤ (SERVICE CATALOG SUMMARY)

### 4.1. Quy chuẩn kích thước tóc (Hair Sizes)
- **Size S**: Tóc ngắn (Tóc từ cằm trở lên).
- **Size M**: Tóc lỡ (Tóc từ cằm đến ngang vai).
- **Size L**: Tóc dài (Tóc từ ngang ngực trở xuống).

### 4.2. Thống kê nhóm dịch vụ
- **Tổng số nhóm dịch vụ**: 8 nhóm
- **Tổng số dịch vụ riêng biệt**: 26 dịch vụ
- **Tổng số mục giá theo biến thể**: 78 biến thể
- **Khoảng giá**: 35.000 VNĐ - 2.500.000 VNĐ
- **Thời lượng**: 20 phút - 180 phút
- **Số nhân viên yêu cầu**: 1 - 2 nhân viên

| STT | Nhóm dịch vụ | Số lượng dịch vụ | Khoảng giá (VNĐ) | Thời gian thực hiện |
| :---: | :--- | :---: | :---: | :---: |
| 1 | Cắt tóc | 1 | 130.000 - 170.000 | 45 phút |
| 2 | Gội đầu & tạo kiểu | 4 | 40.000 - 130.000 | 20 - 45 phút |
| 3 | Chăm sóc & Phục hồi | 4 | 200.000 - 750.000 | 40 - 60 phút |
| 4 | Nhuộm tóc | 4 | 450.000 - 1.500.000 | 90 - 180 phút |
| 5 | Uốn tóc | 3 | 500.000 - 1.200.000 | 120 - 150 phút |
| 6 | Duỗi tóc | 3 | 500.000 - 1.100.000 | 120 - 150 phút |
| 7 | Tẩy tóc | 2 | 300.000 - 900.000 | 60 - 90 phút |
| 8 | Dịch vụ khác | 5 | 35.000 - 2.500.000 | 30 - 90 phút |

---

## 5. ĐỐI CHIẾU VỚI DATABASE VÀ SEED DATA HIỆN TẠI

1. **Bảng Services / Products**: File seed hiện tại cần nạp hoặc cập nhật 78 bản ghi biến thể theo file chuẩn hóa `docs/prepared/n1_qlqtkd.json`.
2. **Quyền Role Lễ tân vs Chủ tiệm**: Đảm bảo route middleware `roleMiddleware` chặn Lễ tân gọi các endpoint POST/PUT/DELETE dịch vụ và quản lý nhân viên.
3. **Socket Notifications**: Đảm bảo event `new_waiting_conversation` và `customer_started_chat` kích hoạt socket tới client của Admin / Lễ tân.

