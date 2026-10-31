# KẾ HOẠCH KHẮC PHỤC LỖI (FIX PLAN)

---

## 1. Mục tiêu
Đảm bảo rằng:
1. AI Chatbox **TUYỆT ĐỐI KHÔNG BAO GIỜ** thông báo đặt lịch thành công hoặc cung cấp mã đặt lịch giả mạo nếu chưa có bản ghi lịch hẹn hợp lệ được lưu và xác nhận thành công vào Database.
2. Mã đặt lịch trả về cho khách hàng luôn là mã do Backend sinh ra (định dạng `BK-YYYYMMDD-XXXX`), đồng bộ 100% với dữ liệu hiển thị trên trang Quản lý lịch hẹn của Admin.
3. Khi khách hàng hỏi lịch trống lần 1 và lần 2, hệ thống luôn duy trì tính nhất quán, không tự bịa ra các khung giờ đã kín lịch (như 17:30 ngày 02/11/2026).
4. Trang quản trị Admin nhận được thông báo cập nhật dữ liệu lịch hẹn đầy đủ, kịp thời.

---

## 2. Kế hoạch chi tiết theo các hạng mục

| STT | Hạng mục | Nội dung thực hiện | File/Module liên quan | Kết quả mong đợi |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Xây dựng Booking Guardrail (Chặn thành công giả)** | - Bổ sung hàm kiểm tra hậu xử lý phản hồi AI (Post-generation Guardrail).<br>- Nếu phản hồi chứa các từ khóa thành công (ví dụ: `đặt lịch thành công`, `mã đặt lịch`, `mã booking`) mà không có `successfulBooking` hợp lệ trong lượt chat:<br>  + Tự động gỡ bỏ thông báo thành công và mã booking giả.<br>  + Nếu khách hàng đã cung cấp đủ thông tin (Tên, SĐT, Ngày, Giờ) và đã xác nhận nhưng AI chưa gọi tool: Orchestrator tự động gọi `confirm_appointment` hoặc `create_appointment` từ ngữ cảnh để thực sự commit dữ liệu vào Database.<br>  + Nếu thiếu xác nhận: Ép câu trả lời về dạng tóm tắt thông tin và hỏi khách xác nhận chốt lịch. | `chatbox/src/ai/orchestrator.js` | Không còn bất kỳ trường hợp nào AI báo thành công mà Database không có dữ liệu. |
| **2** | **Chuẩn hóa mã đặt lịch (Format & Code Enforcement)** | - Đảm bảo mọi phản hồi thành công bắt buộc dùng `booking_code` thật từ Backend (`BK-YYYYMMDD-XXXX`).<br>- Xóa bỏ hoặc thay thế bất kỳ mã tự chế nào (như `MBL-...`) bằng mã thật. | `chatbox/src/ai/orchestrator.js` | Khách hàng chỉ nhận được mã thật `BK-...`, khớp hoàn toàn với Database và Admin. |
| **3** | **Khắc phục lỗi trích xuất ngày & Slot Consistency** | - Cải tiến `extractDateFromUserAndHistory`: Ưu tiên tuyệt đối ngày do User nhắn (`sender_type === 'user'`). Chỉ đọc từ assistant nếu user nói từ quy chiếu ("ngày đó", "hôm đó").<br>- Mở rộng từ khóa nhận diện câu hỏi lịch trống (`detectAvailableSlotsQuery`) với các cụm: *"ngày đó còn những lịch trống nào nữa"*, *"còn lịch nào không"*,... | `chatbox/src/ai/tools.js`<br>`chatbox/src/ai/orchestrator.js` | Lần 1 và lần 2 hỏi lịch trống ngày 02/11 đều trả về kết quả nhất quán, không sót, không hallucinate 17:30. |
| **4** | **Bổ sung hỗ trợ Email & Validation cho Booking Flow** | - Thêm trường `customer_email` vào `TOOL_DEFINITIONS` của `confirm_appointment`.<br>- Validate email nếu có truyền vào (báo mã lỗi `INVALID_EMAIL` nếu sai cú pháp).<br>- Truyền `customerEmail` vào `confirmHoldingSlot` và `createAppointment`.<br>- Trả về trường `customer_email: appt.customer_email || null` trong JSON kết quả của tool. | `chatbox/src/ai/tools.js`<br>`chatbox/src/services/appointmentService.js` | Khách hàng có thể cung cấp hoặc bỏ trống email. Dữ liệu email được lưu trữ chuẩn xác trong DB. |
| **5** | **Đồng bộ Realtime sang Admin qua Socket.IO** | - Truyền đối tượng `io` vào context của Orchestrator và Tool execution.<br>- Khi lịch hẹn được xác nhận hoặc tạo mới thành công qua AI Chatbox, phát sự kiện `appointment_created` tới room `agents`. | `chatbox/src/routes/conversations.js`<br>`chatbox/src/ai/orchestrator.js`<br>`chatbox/src/ai/tools.js` | Màn hình Admin tự động nhận dữ liệu lịch mới trong thời gian thực mà không cần F5. |

---

## 3. Trả lời các câu hỏi đánh giá rủi ro và tác động

### 3.1. Cần sửa những module nào?
- `chatbox/src/ai/orchestrator.js`: Thêm Guardrail phát hiện và xử lý Hallucination đặt lịch thành công, chuẩn hóa output, đồng bộ socket.
- `chatbox/src/ai/tools.js`: Cập nhật schema `confirm_appointment` (thêm email), chuẩn hóa `extractDateFromUserAndHistory`, mở rộng `detectAvailableSlotsQuery`.
- `chatbox/src/routes/conversations.js`: Truyền `io` vào `orchestrator.chat` để sẵn sàng phát thông báo realtime cho Admin.

### 3.2. Cần thay đổi logic nào?
- Logic hậu kiểm (Post-processing) của AI response: Bắt buộc đối chiếu tuyên bố "đặt lịch thành công" với trạng thái lưu DB thật.
- Logic trích xuất ngày từ lịch sử chat: Tránh việc lấy nhầm ngày do assistant gợi ý.

### 3.3. Có cần điều chỉnh Database hoặc API không?
- **Không thay đổi cấu trúc bảng/JSON**. Database hiện tại đã có đầy đủ các trường `id`, `booking_code`, `customer_name`, `customer_phone`, `customer_email`, `appointment_date`, `appointment_time`, `duration_minutes`, `status`, `notes`.
- **Không thay đổi API công khai**. Giữ nguyên chữ ký và hợp đồng API để tránh ảnh hưởng đến các client hiện có.

### 3.4. Có ảnh hưởng đến các chức năng đặt lịch hiện tại không?
- Không. Các kênh đặt lịch qua form truyền thống (`POST /api/appointments`), quầy lễ tân, hoặc luồng nhân viên tư vấn trực tiếp vẫn hoạt động bình thường theo các quy tắc đã có.

### 3.5. Có cần xử lý dữ liệu cũ không?
- Dữ liệu cũ trong `appointments.json` được giữ nguyên vẹn. Không có thao tác migration phá hủy dữ liệu.

### 3.6. Có rủi ro phát sinh bug mới không?
- **Rủi ro**: Regex kiểm tra thông báo thành công có thể bắt nhầm câu hội thoại thông thường (ví dụ: khách hỏi "làm sao để đặt lịch thành công?").
- **Biện pháp phòng ngừa**: Chỉ áp dụng can thiệp nếu câu trả lời chứa khẳng định đã hoàn tất kèm mã booking hoặc xác nhận thông tin lịch cụ thể. Viết bộ test phủ các trường hợp hỏi - đáp thông thường để kiểm chứng không bị chặn nhầm.

### 3.7. Phương án Rollback nếu fix thất bại
- Toàn bộ các thay đổi được theo dõi qua Git trong thư mục dự án. Nếu có sự cố, có thể revert các file `orchestrator.js`, `tools.js`, `conversations.js` về phiên bản ban đầu thông qua `git checkout`.
