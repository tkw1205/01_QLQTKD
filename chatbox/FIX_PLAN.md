# KẾ HOẠCH KHẮC PHỤC LỖI (FIX PLAN)
**Dự án**: AI Chatbox Consulting & Booking Platform (Mây Hair Studio)  
**Mục tiêu**: Xử lý triệt để lỗi AI không nhận diện đúng yêu cầu chọn khung giờ đặt lịch, duy trì ngữ cảnh, xác nhận khung giờ chính xác và loại bỏ hoàn toàn nội dung sai vai trò.  
**Ngày lập**: 31/10/2026  
**Người thực hiện**: Senior Software Engineer & AI Architect

---

## 1. Bảng Kế hoạch Sửa Lỗi Chi Tiết

| STT | Bug ID | Hạng mục cần sửa | File/Module bị ảnh hưởng | Giải pháp kỹ thuật cụ thể | Kết quả mong đợi |
|---|---|---|---|---|---|
| 1 | **BUG-01** | Intent Recognition & Classification | `chatbox/src/ai/tools.js`<br>`chatbox/src/ai/orchestrator.js` | 1. Xây dựng hàm `detectIntent(userMessage, context)` phân loại chính xác các Intent: `CHECK_AVAILABILITY`, `SELECT_TIME_SLOT`, `CONFIRM_TIME_SLOT`, `CHANGE_TIME_SLOT`, `CREATE_BOOKING`.<br>2. Bổ sung nhận diện regex cho các biến thể chọn giờ: "Cho t lịch 14:00", "T muốn lịch lúc 14:00", "T chọn 14 giờ", "14:00", "14h", "Đặt cho tôi lúc 14:00", "Cho mình khung 14:00 nhé".<br>3. Phân biệt rõ: Nếu câu hỏi giờ trống chung chung -> `CHECK_AVAILABILITY`. Nếu câu chỉ rõ một mốc giờ cụ thể khi đã có ngày/danh sách giờ -> `SELECT_TIME_SLOT`. | Nhận diện chính xác 100% ý định chọn khung giờ, không bị phân loại nhầm thành kiểm tra toàn bộ lịch trống. |
| 2 | **BUG-02** | Conversation Context & Slot Persistence | `chatbox/src/repositories/conversationRepository.js`<br>`chatbox/src/ai/orchestrator.js` | 1. Cập nhật `conversationRepo.updateBookingState()` để lưu đầy đủ: `available_slots`, `booking_date`, `selected_time`, `time_selection_status`, `booking_status`.<br>2. Khi `check_available_slots` chạy xong ở Lượt 1, lưu ngay danh sách `slots` vào `conversation.booking_state.available_slots`.<br>3. Khi bắt đầu lượt chat mới, đọc `conversation.booking_state` để nạp `targetDate`, `availableSlots`, `selectedTime` làm nguồn ngữ cảnh tin cậy, không bị mất giữa các lượt. | Duy trì ngữ cảnh ngày đặt lịch và danh sách khung giờ trống xuyên suốt các lượt hội thoại. |
| 3 | **BUG-03** | Time Slot Validation & Confirmation Logic | `chatbox/src/ai/orchestrator.js`<br>`chatbox/src/services/appointmentService.js` | 1. Khi Intent là `SELECT_TIME_SLOT` và khách chọn `targetTime` (ví dụ 14:00):<br>- **Trường hợp A (Giờ còn trống)**: Nếu `targetTime` thuộc `available_slots` (hoặc kiểm tra khả dụng thành công), phản hồi trực tiếp: *"Dạ, khung giờ 14:00 ngày 03/11/2026 hiện đang còn trống. Bạn muốn chọn khung giờ này đúng không ạ?"*<br>Cập nhật `selected_time = "14:00"`, `time_selection_status = "pending_confirmation"`.<br>- **Trường hợp B (Giờ không còn trống)**: Thông báo khung giờ không còn khả dụng, đề xuất các giờ trống thực tế khác và giữ nguyên ngày.<br>- **Trường hợp C (Chưa kiểm tra)**: Gọi Backend kiểm tra riêng ngày và giờ đó, chỉ xác nhận khi khả dụng.<br>2. Tuyệt đối không gọi lại `check_available_slots` để trả về danh sách tất cả các giờ. | Khách chọn 14:00 được xác nhận trực tiếp, chính xác, không bị yêu cầu chọn lại hay liệt kê lại giờ. |
| 4 | **BUG-04** | Prompt / Role Sanitization & Tool Output Clean | `chatbox/src/ai/tools.js`<br>`chatbox/src/ai/orchestrator.js` | 1. Chuẩn hóa lại toàn bộ thông điệp trả về từ các Tools trong `tools.js`: Xóa bỏ hoàn toàn các câu chỉ dẫn ngôi thứ 3 như `"Hãy giới thiệu các khung giờ này cho khách"`, `"Vui lòng tư vấn cho khách hàng của bạn"` -> Thay bằng thông điệp trung tính dành cho hệ thống hoặc định dạng trực tiếp.<br>2. Bổ sung Guardrail trong `orchestrator.js` kiểm tra và lọc bỏ mọi cụm từ: `"khách hàng của bạn"`, `"tư vấn cho khách hàng của bạn"`, `"giới thiệu cho khách hàng của bạn"`, `"lịch làm việc của khách hàng"`.<br>3. Cập nhật System Prompt khẳng định AI đang trực tiếp tư vấn cho khách xưng "em/salon" và gọi khách là "bạn/anh/chị". | Loại bỏ 100% hiện tượng nói sai vai trò, AI luôn giao tiếp trực tiếp lịch sự với người dùng. |
| 5 | **BUG-05** | Repeated Request Handling & Idempotency | `chatbox/src/ai/orchestrator.js` | 1. Nhận diện trường hợp khách hàng nhắc lại hoặc khẳng định lại khung giờ đã chọn ("T muốn lịch lúc 14:00", "Lấy 14:00", "Đúng rồi lúc 14:00").<br>2. Nếu `selected_time` đã là "14:00" hoặc trùng với giờ khách vừa nhắc lại, AI xác nhận tiếp tục bước tiếp theo (hỏi dịch vụ nếu chưa có dịch vụ, hoặc hỏi họ tên, số điện thoại).<br>3. Không bao giờ kích hoạt lại việc tìm kiếm toàn bộ giờ trống khi khách chỉ đang nhắc lại giờ đã chọn. | Xử lý mượt mà khi khách nhắc lại yêu cầu chọn giờ, không bị vòng lặp vô tận. |

---

## 2. Chi tiết Kỹ thuật Các Hạng mục Cần Thay Đổi

### 2.1. Module Intent Recognition (`chatbox/src/ai/tools.js` hoặc file mới / orchestrator)
- Bổ sung hàm `detectIntent(userMessage, context)`:
  - `CHECK_AVAILABILITY`: Các mẫu câu hỏi danh sách giờ trống ("ngày đó còn những lịch trống nào?", "còn giờ nào trống", "xem lịch trống", "mấy giờ còn trống").
  - `SELECT_TIME_SLOT`: Nhận diện khi khách đưa ra giờ cụ thể ("Cho t lịch 14:00", "T muốn lịch lúc 14:00", "T chọn 14 giờ", "14:00", "14h", "Đặt cho tôi lúc 14:00", "Lấy cho tôi khung 14:00 nhé", "Tôi chọn khung giờ vừa đề xuất", "Lấy cho tôi giờ 2 giờ chiều").
  - `CONFIRM_TIME_SLOT`: Khách xác nhận đồng ý giờ vừa được hỏi ("Đúng rồi", "Ok giờ đó", "Đồng ý", "Chốt giờ đó").
  - `CHANGE_TIME_SLOT`: Khách muốn đổi giờ khác ("Đổi sang 15:00", "Tôi muốn đổi giờ khác").
  - `CONFIRM_BOOKING`: Khách xác nhận chốt đặt lịch sau khi đã tóm tắt thông tin.

### 2.2. Module Booking State Management (`chatbox/src/repositories/conversationRepository.js`)
- Schema của `booking_state` trong cuộc hội thoại:
  ```javascript
  {
    booking_date: "2026-11-03",        // Ngày hẹn
    available_slots: ["08:30", ...],   // Danh sách khung giờ trống của ngày
    selected_time: "14:00",            // Khung giờ khách chọn
    time_selection_status: "pending_confirmation", // 'none' | 'pending_confirmation' | 'confirmed'
    service_id: "...",                 // ID dịch vụ (nếu có)
    service_name: "...",               // Tên dịch vụ
    duration: 45,                      // Thời lượng thực tế (phút)
    price: 150000,                     // Giá tiền
    customer_name: null,               // Tên khách
    customer_phone: null,              // SĐT khách
    booking_status: "collecting_information" // 'checking_slots' | 'slot_selected' | 'collecting_info' | 'confirmed'
  }
  ```
- Cập nhật hàm `updateBookingState` để merge chính xác các trường này và lưu vào `conversations.json`.

### 2.3. Sửa Tool Output Message trong `chatbox/src/ai/tools.js`
- Dòng 682: Đổi `message` từ `"Các khung giờ còn trống ngày ... Hãy giới thiệu các khung giờ này cho khách."` thành:
  `"Danh sách các khung giờ còn trống ngày ${normalizedDate}: ${slots.join(', ')}."`
- Dòng 672: Đổi từ `"Hãy thông báo cho khách và hỏi khách..."` thành `"Ngày ${normalizedDate} đã kín lịch."`
- Dòng 560: Đổi từ `"Hãy hỏi khách xác nhận..."` thành `"Tìm thấy các dịch vụ tương tự: ..."`
- Dòng 758: Đổi từ `"Hãy hỏi khách có muốn..."` thành `"Khung giờ ${apptTime} hiện không còn khả dụng."`

### 2.4. Module Điều phối Orchestrator (`chatbox/src/ai/orchestrator.js`)
- Nạp `conversation.booking_state` vào context.
- Khi user gửi tin nhắn:
  1. Phân loại intent.
  2. Nếu intent là `SELECT_TIME_SLOT`:
     - Trích xuất giờ `selectedTime` từ text ("14:00", "14h", "14 giờ", "2 giờ chiều" -> "14:00").
     - Lấy `targetDate` từ context (hoặc `booking_state.booking_date` hoặc `extractDateFromUserAndHistory`).
     - Kiểm tra tính khả dụng: So khớp với `available_slots` trong `booking_state`. Nếu chưa có `available_slots`, gọi Backend `checkAvailableSlots(targetDate)` để lấy.
     - Nếu `selectedTime` có trong slots:
       Tạo phản hồi trực tiếp:
       *"Dạ, khung giờ ${selectedTime} ngày ${formattedDate} hiện đang còn trống. Bạn muốn chọn khung giờ này đúng không ạ?"*
       Cập nhật Booking State: `selected_time = selectedTime`, `time_selection_status = 'pending_confirmation'`.
       Trả lời ngay mà không cần gọi lại LLM tạo danh sách giờ thừa thãi.
     - Nếu `selectedTime` KHÔNG có trong slots:
       Thông báo khung giờ không còn khả dụng và gợi ý các khung giờ trống thực tế gần nhất, giữ nguyên ngày.
- Bổ sung Post-generation Guardrail quét và sửa mọi câu sai vai trò ("khách hàng của bạn" -> "bạn", "lịch làm việc của khách hàng" -> "lịch của bạn").

---

## 3. Đánh Giá Tác Động & Rủi Ro

| Câu hỏi phân tích | Trả lời |
|---|---|
| **Module nào cần sửa?** | `orchestrator.js`, `tools.js`, `conversationRepository.js`, `appointmentService.js`. |
| **Có cần sửa System Prompt không?** | Có, bổ sung chỉ thị rõ ràng về việc xử lý intent `SELECT_TIME_SLOT`, cấm xưng hô sai vai trò. |
| **Có cần sửa Intent Classifier không?** | Có, xây dựng hàm phân loại intent chuẩn xác cho `SELECT_TIME_SLOT`. |
| **Có cần bổ sung trạng thái `selected_time` không?** | Có, bắt buộc trong `booking_state`. |
| **Có cần thay đổi API không?** | Không thay đổi API contract của client, hoàn toàn tương thích ngược 100%. |
| **Có ảnh hưởng đến các chức năng khác không?** | Không ảnh hưởng đến tra cứu dịch vụ, hủy lịch, admin chat, hay luồng confirm appointment. |
| **Rủi ro phát sinh lỗi mới?** | Rủi ro thấp. Có thể có trường hợp diễn đạt giờ phức tạp ("2 rưỡi chiều" = 14:30), đã có unit test bao phủ. |
| **Phương án rollback** | Sử dụng git restore cho các file đã sửa nếu phát sinh lỗi không mong muốn. |

---

## 4. Kế hoạch Kiểm Thử Sau Fix (Testing Strategy)
1. **Unit Test**:
   - Kiểm tra Intent Recognition (`SELECT_TIME_SLOT` vs `CHECK_AVAILABILITY`).
   - Nhận diện các định dạng giờ: `14:00`, `14h`, `14 giờ`, `2 giờ chiều`.
   - Kiểm tra lưu và đọc Booking State (`available_slots`, `selected_time`, `time_selection_status`).
   - Kiểm tra xử lý slot có sẵn, slot kín, slot chưa kiểm tra.
2. **Integration Test**:
   - Truyền tải Conversation ID và duy trì trạng thái qua nhiều lượt chat.
   - Gọi tool và lưu kết quả slot vào DB state.
3. **End-to-End Test (7 Test Cases theo yêu cầu)**:
   - TEST CASE 01: Khách hỏi lịch trống ngày 03/11/2026 -> Khách chọn "Cho t lịch 14:00" -> AI xác nhận 14:00 còn trống, không trả lại danh sách giờ.
   - TEST CASE 02: Khách nhắc lại "T muốn lịch lúc 14:00" -> AI duy trì ngày và giờ, không lặp lại truy vấn toàn bộ slot.
   - TEST CASE 03: Khách chọn giờ không còn trống -> AI thông báo không khả dụng, gợi ý giờ khác có thật.
   - TEST CASE 04: Khách đổi sang 15:00 -> Cập nhật giờ mới, giữ nguyên ngày.
   - TEST CASE 05: Khách chọn giờ bằng ngôn ngữ tự nhiên ("Cho mình 14h nhé", "Lấy 2 giờ chiều") -> Hiểu đúng.
   - TEST CASE 06: Phản hồi đúng vai trò 100%, không xuất hiện "khách hàng của bạn".
   - TEST CASE 07: Toàn bộ quy trình đặt lịch xuyên suốt đến khi có mã booking thật.
4. **Regression Test**:
   - Toàn bộ các test suite hiện có của hệ thống vẫn hoạt động ổn định.

---
**Kế hoạch đã sẵn sàng để chuyển sang Giai đoạn 4: Triển khai Fix Bug.**
