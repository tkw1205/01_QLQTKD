# BẢNG ĐỐI CHIẾU VÀ PHÂN TÍCH KHOẢNG CÁCH HỆ THỐNG (SYSTEM GAP ANALYSIS)

> **Mã tài liệu**: `GAP-SALON1-001`  
> **Phiên bản**: `1.0.0`  
> **Ngày lập**: 28/10/2026  
> **Đối chiếu giữa**:  
> - Tài liệu Excel: `docs/quy_trinh_dat_lich_SALON1_1sheet.xlsx` (Dữ liệu JSON chuẩn hóa: `docs/prepared/booking_process.json`)  
> - Báo cáo phân tích nghiệp vụ: `docs/prepared/booking_process_analysis.md`  
> - Hệ thống source code: `d:\projects\chatbox` (Backend Express, Repository JsonStore, Socket.IO, AI Orchestrator, Frontend)

---

## 1. NGUYÊN TẮC ĐÁNH GIÁ VÀ PHÂN CẤP ƯU TIÊN

### 1.1. Tiêu chí kết quả đánh giá:
- **Đáp ứng (Passed)**: Hệ thống đã hiện thực đầy đủ, chính xác logic nghiệp vụ theo đặc tả tài liệu.
- **Đáp ứng một phần (Partial)**: Hệ thống đã có tính năng/API/component tương ứng nhưng thiếu điều kiện ràng buộc, sai trạng thái, hoặc chưa đáp ứng trọn vẹn luồng BPMN.
- **Chưa đáp ứng (Missing)**: Hệ thống chưa có chức năng, thiếu endpoint, thiếu trường dữ liệu hoặc thiếu logic tương ứng.
- **Chưa xác minh (Unverified)**: Chưa đủ căn cứ để kết luận hoặc thuộc nhóm điểm chưa rõ từ tài liệu gốc.

### 1.2. Mức độ ưu tiên:
- **P0 (Critical)**: Vấn đề cốt lõi liên quan đến sai lệch dữ liệu lịch hẹn, xung đột đặt trùng giờ (double-booking race condition), hoặc phá vỡ tính toàn vẹn của quy trình.
- **P1 (High)**: Yêu cầu nghiệp vụ chính từ tài liệu (Quy trình 2 pha giữ chỗ tạm - chốt lịch, phân quyền lễ tân, trạng thái lịch hẹn chuẩn).
- **P2 (Medium)**: Yêu cầu bổ sung nâng cao trải nghiệm (Tự động nhả slot giữ chỗ hết hạn TTL, lưu vết khách hàng tiềm năng Lead, bảo toàn thông tin khách khi trùng slot).
- **P3 (Low)**: Tối ưu hóa UI/UX, gợi ý nhanh khung giờ, tinh chỉnh thời gian chờ timeout.

---

## 2. BẢNG ĐỐI CHIẾU CHI TIẾT (GAP MATRIX)

| ID | Yêu cầu nghiệp vụ | Nguồn Excel | Hiện trạng hệ thống | Kết quả | Khoảng cách cần sửa | Mức độ |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **REQ-001** | **Cơ chế Two-Phase Booking: Giữ chỗ tạm (Bước 6) với TTL 10 phút**<br>Khi khách chọn slot, hệ thống tạo bản ghi giữ chỗ tạm (status: `holding`) kèm hạn chót 10 phút. Slot này bị khóa mềm đối với khách khác. | Sheet `Quy trình SALON1`<br>Dòng 26-34<br>(Bước 6 & 7) | `appointmentService.js` chỉ có hàm `createAppointment` trực tiếp tạo lịch với trạng thái `pending`. Chưa có hàm `holdSlot` / endpoint `POST /api/appointments/hold`. | **Chưa đáp ứng** | Bổ sung hàm `holdSlot` trong `appointmentService` & `appointmentRepository`, tạo endpoint `POST /api/appointments/hold` với `holding_token`, `hold_expires_at = now() + 10m` và trạng thái `holding`. | **P0** |
| **REQ-002** | **Xác thực và cam kết chốt lịch 2 pha (Bước 9)**<br>Sau khi khách nhập Tên + SĐT, hệ thống kiểm tra lại slot lần 2. Nếu slot còn hợp lệ thì commit chuyển từ `holding` sang `confirmed` và sinh mã booking. | Sheet `Quy trình SALON1`<br>Dòng 35-42<br>(Bước 8 & 9) | Hệ thống hiện chỉ kiểm tra trùng lúc tạo mới một lần. Chưa có API `POST /api/appointments/confirm-hold` để xác thực lại slot từ token giữ chỗ tạm và hoàn tất thông tin liên hệ. | **Chưa đáp ứng** | Thêm endpoint `POST /api/appointments/confirm-hold` (hoặc nâng cấp `createAppointment`), kiểm tra slot còn trong thời hạn giữ chỗ, chưa bị chốt bởi người khác và commit thành công. | **P0** |
| **REQ-003** | **Chống trùng lịch đa tầng & Tính toán Slot trống**<br>Khi tính toán slot khả dụng (`checkAvailableSlots`), hệ thống phải loại trừ các lịch `confirmed`, `pending` và cả các lịch `holding` còn hiệu lực (`hold_expires_at > now()`). Các lịch `holding` đã quá hạn phải tự động coi là slot trống. | Sheet `Quy trình SALON1`<br>Dòng 28-30, 39-41 | `appointmentRepository.findAvailableSlots` chỉ lọc `status !== 'cancelled'`. Mọi bản ghi không phải cancelled đều bị coi là bận, không xét thời hạn hết hạn của holding slot. | **Đáp ứng một phần** | Cập nhật logic `findAvailableSlots` và `hasTimeOverlap`: Bỏ qua các bản ghi `status === 'holding'` nếu đã quá thời hạn `hold_expires_at`. | **P0** |
| **REQ-004** | **Bảo toàn thông tin khách hàng khi phát hiện slot bị tranh chấp (Data Preservation)**<br>Nếu ở Bước 9 slot bị tranh chấp, hệ thống báo lỗi xung đột nhưng **bảo lưu toàn bộ Họ tên, SĐT** của khách để chuyển ngay sang Bước 10 chọn giờ thay thế mà không bắt nhập lại. | Sheet `Quy trình SALON1`<br>Dòng 41-44<br>(Bước 9 rẽ nhánh) | API ném lỗi 409 Conflict thuần túy dạng string. Chưa trả về cấu trúc dữ liệu kèm `preservedData: { customerName, customerPhone, productId }` và danh sách slot gợi ý thay thế. | **Đáp ứng một phần** | Khi xảy ra xung đột ở Bước 9, API/Service trả về mã lỗi `SLOT_CONFLICT`, bảo toàn thông tin khách đã gửi và tự động gợi ý 3 slot trống gần nhất. | **P1** |
| **REQ-005** | **Vòng đời trạng thái Lịch hẹn chuẩn BPMN**<br>Hỗ trợ đầy đủ các trạng thái nghiệp vụ: `holding`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`. | Sheet `Quy trình SALON1`<br>Dòng 34, 40, 89 | Hiện tại hệ thống hỗ trợ: `pending`, `confirmed`, `cancelled`, `completed`. Chưa có `holding` và `no_show`. | **Đáp ứng một phần** | Cập nhật danh sách trạng thái hợp lệ trong `appointmentRepository`, `appointments.js` (validation status) cho phép thêm `holding`, `no_show`. | **P1** |
| **REQ-006** | **Cơ chế Nhả giữ chỗ tạm (Release Hold) khi im lặng / timeout (Bước 8)**<br>Nếu khách hàng không phản hồi thông tin sau khi đã gửi tin nhắc nhở ở Bước 8 (hết 3 phút), hệ thống phải giải phóng slot giữ chỗ tạm (`releaseHold`) trước khi đóng phiên. | Sheet `Quy trình SALON1`<br>Dòng 37, 78-80<br>(Bước 8 timeout) | Chưa có hàm `releaseHold` hay endpoint `POST /api/appointments/release-hold`. Slot giữ chỗ tạm bị treo đến khi hết hạn hoặc không được giải phóng chủ động. | **Chưa đáp ứng** | Bổ sung hàm `releaseHold({ holdingToken, appointmentId })` để hủy slot giữ chỗ ngay lập tức khi khách hủy hoặc khi hết thời gian chờ tại Bước 8. | **P1** |
| **REQ-007** | **Khung giờ hoạt động chuẩn Salon Lumière (08:30 - 20:30)**<br>Giờ làm việc mở cửa từ 08:30 đến 20:30 hàng ngày cho tất cả các ngày trong tuần. | Sheet `Quy trình SALON1`<br>Dòng 4, 28 | `business_settings.json` hiện đang cấu hình `08:00 - 20:00`. | **Đáp ứng một phần** | Cập nhật cấu hình mặc định trong `business_settings.json` và migration/seed thành `08:30` - `20:30`. | **P1** |
| **REQ-008** | **AI Tooling cho luồng 2 pha**<br>AI Chatbot có các công cụ tương ứng với quy trình chuẩn: `check_available_slots`, `hold_appointment_slot`, `confirm_appointment`, `cancel_appointment`. | Sheet `Quy trình SALON1`<br>Dòng 26-44<br>(Lane AI Tư vấn) | `src/ai/tools.js` có `check_available_slots`, `create_appointment`, `cancel_appointment`. Thiếu công cụ giữ chỗ tạm `hold_appointment_slot`. | **Đáp ứng một phần** | Bổ sung công cụ AI `hold_appointment_slot` và cập nhật `confirm_appointment` trong `src/ai/tools.js`, đồng thời cập nhật system prompt hướng dẫn AI tuân thủ quy trình 2 pha. | **P1** |
| **REQ-009** | **Chuyên viên tạo lịch trực tiếp tại Salon (Luồng A)**<br>Chuyên viên tư vấn / Lễ tân có thể tạo lịch hẹn trực tiếp cho khách tại quầy salon (hoặc đặt hộ khách). | Sheet `Quy trình SALON1`<br>Dòng 86-90<br>(Lane Chuyên viên Luồng A) | Endpoint `POST /api/appointments` cho phép tạo lịch, nhưng middleware RBAC kiểm tra quyền của Receptionist cần đảm bảo lễ tân có quyền tạo lịch hẹn tại quầy. | **Đáp ứng** | Đảm bảo endpoint tạo lịch chấp nhận quyền của Receptionist và Staff khi tạo trực tiếp. | **P1** |
| **REQ-010** | **Chuyển giao Chuyên viên (Luồng B - Handoff) & Thông báo Real-time**<br>Khi khách yêu cầu gặp người thật hoặc bot không xử lý được, chuyển đổi trạng thái phiên sang `waiting_for_agent` / `human` và bắn socket notification tới màn hình Lễ tân/Staff. | Sheet `Quy trình SALON1`<br>Dòng 16, 91-96<br>(Handoff Luồng B) | Socket handler và `conversationService.js` đã triển khai sự kiện `request_agent`, `new_waiting_conversation`, `new_notification` và phòng `agents`. Đã có test kiểm thử thành công. | **Đáp ứng** | Duy trì và đảm bảo tích hợp thông suốt với vòng đời cuộc gọi. | **P1** |
| **REQ-011** | **Lưu trữ Lead khi đóng phiên (SESSION_CLOSED_LEAD_SAVED)**<br>Khi phiên chat kết thúc do khách im lặng sau khi nhắc nhở, hội thoại được đóng và lưu cờ `is_lead = true` kèm thông tin đã thu thập. | Sheet `Quy trình SALON1`<br>Dòng 76, 80, 84, 102 | Bảng conversations đã có `mode: 'closed'`, nhưng chưa có các trường `is_lead`, `lead_notes`, `lead_phone` để phục vụ theo dõi khách tiềm năng. | **Chưa đáp ứng** | Bổ sung hàm đóng phiên kèm lưu thông tin lead (`closeAsLead`) trong `conversationRepository` và `conversationService`. | **P2** |
| **REQ-012** | **Quản lý Hạn ngạch & Tự động Dọn dẹp Slot Giữ chỗ hết hạn (TTL Cleaner)**<br>Tự động giải phóng các bản ghi `holding` đã quá 10 phút để trả slot về cho thị trường. | Sheet `Quy trình SALON1`<br>Dòng 28-30<br>(TTL 10 phút) | Chưa có cơ chế định kỳ quét các appointment quá hạn 10 phút. | **Chưa đáp ứng** | Bổ sung hàm `cleanupExpiredHolds()` được kích hoạt định kỳ hoặc tự động kích hoạt khi kiểm tra slots trống. | **P2** |
| **REQ-013** | **Giao diện đặt lịch (Frontend Appointments Page & Widget)**<br>Giao diện đặt lịch trên web cho phép khách trải nghiệm quy trình giữ chỗ và hoàn tất xác nhận rõ ràng, hiển thị trạng thái lịch chính xác. | Sheet `Quy trình SALON1`<br>Toàn bộ tài liệu | `public/appointments.html` và `public/js/chat.js` đã có form đặt lịch cơ bản. | **Đáp ứng một phần** | Cập nhật `public/js/chat.js` và `public/appointments.html` để hỗ trợ flow 2 pha hoặc tương thích hoàn toàn với API mới. | **P2** |

---

## 3. KẾ HOẠCH TRIỂN KHAI SOURCE CODE (PHASE 4 & 5 ROADMAP)

Dựa trên bảng đối chiếu trên, các công việc cần sửa đổi trực tiếp vào source code:

1. **Cập nhật Schema & Cấu hình (P1)**:
   - Cập nhật `database/data/business_settings.json`: Cấu hình working hours `08:30 - 20:30`.
   - Cập nhật danh sách hợp lệ các trạng thái appointment: `holding`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`.

2. **Cập nhật Repository (`src/repositories/appointmentRepository.js`) (P0, P1, P2)**:
   - Thêm phương thức `hold({ conversationId, guestSessionId, appointmentDate, appointmentTime, durationMinutes, productId, userId })`: tạo slot `status: 'holding'`, `hold_expires_at = ISO(now + 10m)`, `holding_token = uuidv4()`.
   - Thêm phương thức `releaseHold(holdingToken, guestSessionId)`: cập nhật `status: 'cancelled'` hoặc xóa để giải phóng.
   - Thêm phương thức `confirmHold({ holdingToken, customerName, customerPhone, customerEmail, notes, guestSessionId, userId })`: kiểm tra slot còn hợp lệ, cập nhật `status: 'confirmed'`, `booking_code = 'BK-YYYYMMDD-XXXX'`.
   - Cập nhật `findAvailableSlots`: Bỏ qua các slot `holding` đã hết hạn (`hold_expires_at <= now`). Thêm hàm `cleanupExpiredHolds()`.

3. **Cập nhật Service (`src/services/appointmentService.js`) (P0, P1, P2)**:
   - Export các hàm: `holdSlot`, `confirmHoldingSlot`, `releaseHoldSlot`, `cleanupExpiredHolds`.
   - Xử lý bảo toàn thông tin khách hàng nếu xảy ra tranh chấp slot (REQ-004).

4. **Cập nhật Routes (`src/routes/appointments.js`) (P0, P1)**:
   - `POST /api/appointments/hold`: Giữ chỗ tạm thời (TTL 10 phút).
   - `POST /api/appointments/confirm-hold`: Chốt lịch chính thức từ mã giữ chỗ tạm.
   - `POST /api/appointments/release-hold`: Nhả slot giữ chỗ tạm chủ động.
   - Giữ tương thích ngược cho endpoint cũ `POST /api/appointments` để không làm gãy các luồng hiện tại.

5. **Cập nhật AI Tooling & System Prompt (`src/ai/tools.js`, `src/ai/orchestrator.js`) (P1)**:
   - Thêm tool `hold_appointment_slot` và liên kết với `confirm_appointment`.
   - Cập nhật system prompt theo đúng quy trình 2-phase booking của Salon Lumière (08:30 - 20:30).

6. **Cập nhật Quản lý Lead (`src/repositories/conversationRepository.js`, `src/services/conversationService.js`) (P2)**:
   - Bổ sung `closeAsLead(conversationId, { leadNotes, leadPhone })` ghi nhận `is_lead: true`.

7. **Kiểm thử và Kiểm chứng Toàn diện (Giai đoạn 5)**:
   - Viết test suite mới `tests/booking_process_salons.test.js` bao phủ trọn vẹn các yêu cầu REQ-001 -> REQ-013.
   - Chạy lại toàn bộ bộ test cũ `npm test` để xác nhận không có bất kỳ regression nào.
