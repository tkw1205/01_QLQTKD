# BÁO CÁO ĐIỀU TRA VÀ PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ BUG (BUG REPORT)
**Dự án**: AI Chatbox Consulting & Booking Platform (Mây Hair Studio)  
**Ngày thực hiện**: 31/10/2026  
**Người thực hiện**: Senior Software Engineer & AI Architect  
**Trạng thái**: Đã xác minh nguyên nhân gốc rễ bằng chứng thực tế (Root Cause Verified)

---

## 1. Danh sách Bug ID & Phân loại
- **BUG-01**: Không nhận diện đúng ý định lựa chọn khung giờ (`SELECT_TIME_SLOT` bị nhầm hoặc bỏ qua, kích hoạt `CHECK_AVAILABILITY`).
- **BUG-02**: Mất hoặc không duy trì Conversation Context và danh sách Available Slots đã truy vấn giữa các lượt hội thoại.
- **BUG-03**: Không cập nhật và không duy trì `selected_time`, `time_selection_status` trong Booking State.
- **BUG-04**: Trả về toàn bộ danh sách giờ thay vì xác nhận và xử lý khung giờ khách hàng đã chọn.
- **BUG-05**: Phản hồi AI xuất hiện nội dung sai vai trò nghiêm trọng ("giới thiệu cho khách hàng của bạn", "tư vấn cho khách hàng của bạn").
- **BUG-06**: Xử lý lặp lại cùng một yêu cầu không hiệu quả khi khách hàng nhắc lại giờ đã chọn.

---

## 2. Bug Title
**Lỗi AI Chatbox không nhận diện được ý định chọn khung giờ đặt lịch, làm mất danh sách giờ trống trong ngữ cảnh, phản hồi sai vai trò nhân viên tư vấn thay vì trực tiếp phục vụ khách hàng, và liên tục trả về toàn bộ danh sách giờ khi khách đã chọn hoặc nhắc lại giờ.**

---

## 3. Module / Feature bị ảnh hưởng
1. **AI Intent Recognition & Intent Classifier**:
   - `chatbox/src/ai/tools.js` & `chatbox/src/ai/orchestrator.js`: Không có Intent Classifier phân loại rõ ràng giữa `CHECK_AVAILABILITY`, `SELECT_TIME_SLOT`, `CONFIRM_TIME_SLOT`, `CREATE_BOOKING`.
   - `detectAvailableSlotsQuery()`: Chỉ bắt từ khóa kiểm tra lịch chung nhưng dễ bị kích hoạt hoặc LLM tự suy luận gọi lại tool kiểm tra giờ khi câu chứa từ "lịch".
2. **Booking State Management & Conversation Repository**:
   - `chatbox/src/repositories/conversationRepository.js`: `updateBookingState()` không lưu trữ `available_slots`, `selected_time`, `time_selection_status`, `booking_status`.
   - `chatbox/src/ai/orchestrator.js`: Không trích xuất `booking_state` từ conversation để làm nguồn context tin cậy; `available_slots` bị mất sau lượt gọi đầu tiên.
3. **AI Tools & Tool Execution Engine**:
   - `chatbox/src/ai/tools.js`:
     + Tool `check_available_slots`: Trả về thông điệp `message` chứa cụm từ `"Hãy giới thiệu các khung giờ này cho khách."`, `"Hãy hỏi khách..."`, khiến LLM bị ngộ nhận vai trò là trợ lý cho nhân viên nội bộ thay vì trực tiếp nói chuyện với khách hàng.
     + Thiếu Tool/Hàm chuyên biệt để kiểm tra/xác nhận một khung giờ cụ thể (`check_slot_availability` hoặc xử lý `SELECT_TIME_SLOT`).
4. **Prompt Engineering, Orchestrator Loop & Guardrails**:
   - `chatbox/src/ai/orchestrator.js`:
     + `buildSystemPrompt`: Thiếu hướng dẫn xử lý khi khách chọn giờ từ danh sách đề xuất; thiếu chỉ thị xưng hô nghiêm ngặt trực tiếp với khách hàng; thiếu Guardrail chặn văn phong "khách hàng của bạn".
     + Xử lý interceptor và response: Thiếu logic kiểm tra xem khung giờ khách vừa chọn có nằm trong danh sách giờ trống đã truy vấn hay không để phản hồi trực tiếp xác nhận.

---

## 4. Mô tả chi tiết lỗi

Khách hàng thực hiện kịch bản hội thoại đặt lịch làm tóc tại trang chủ:
- **Bước 1 (Khách hỏi lịch trống)**:
  - Khách hàng: *"T muốn đặt lịch làm tóc ngày 3/11, ngày đó còn những lịch trống nào?"*
  - AI phản hồi chuẩn: *"Dạ, trong ngày 2026-11-03, salon hiện còn các khung giờ trống sau: 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30, 19:00. Bạn thuận tiện chọn khung giờ nào để em hỗ trợ giữ chỗ và đặt lịch cho bạn ạ?"*
- **Bước 2 (Khách chọn giờ)**:
  - Khách hàng: *"Cho t lịch 14:00."*
  - AI phản hồi sai: *"Hoặc tôi có thể giới thiệu cho bạn một số khung giờ phù hợp: 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30, 18:00, 18:30, 19:00, 19:30. Bạn có thể chọn một khung giờ phù hợp với lịch làm việc của khách hàng."*
  - *(Lỗi: Khách đã chọn 14:00, AI không xác nhận 14:00 mà lại gọi lại tool kiểm tra lịch trống và trả về toàn bộ danh sách; đồng thời xưng hô sai vai trò "phù hợp với lịch làm việc của khách hàng").*
- **Bước 3 (Khách nhắc lại yêu cầu)**:
  - Khách hàng: *"T muốn lịch lúc 14:00."*
  - AI tiếp tục phản hồi sai: *"Tôi đã kiểm tra và có một số khung giờ còn trống vào ngày 2026-11-03. Dưới đây là khung giờ bạn có thể giới thiệu cho khách hàng của bạn: 08:30 ... 18:00. Vui lòng tư vấn cho khách hàng của bạn về các khung giờ phù hợp nhất."*
  - *(Lỗi: AI hoàn toàn không nhớ khách đã chọn 14:00, tiếp tục liệt kê danh sách giờ trống và hướng dẫn "tư vấn cho khách hàng của bạn").*

---

## 5. Các bước tái hiện lỗi (Steps to Reproduce)
1. Truy cập AI Chatbox tại giao diện người dùng.
2. Gửi tin nhắn 1: *"T muốn đặt lịch làm tóc ngày 3/11, ngày đó còn những lịch trống nào?"*.
3. Quan sát: AI gọi `check_available_slots(date: "2026-11-03")` và trả về danh sách khung giờ từ 08:30 đến 19:00.
4. Gửi tin nhắn 2: *"Cho t lịch 14:00."*.
5. Quan sát: AI không xác nhận khung giờ 14:00 còn trống mà lại trả về toàn bộ danh sách giờ kèm câu "phù hợp với lịch làm việc của khách hàng".
6. Gửi tin nhắn 3: *"T muốn lịch lúc 14:00."*.
7. Quan sát: AI tiếp tục lặp lại danh sách giờ và xuất hiện câu "Dưới đây là khung giờ bạn có thể giới thiệu cho khách hàng của bạn".

---

## 6. Kết quả thực tế (Actual Result)
- Lượt 2: AI không xác nhận khung giờ 14:00 ngày 03/11/2026. Thay vào đó, AI gọi lại công cụ kiểm tra lịch hoặc lặp lại danh sách khung giờ trống. AI xuất hiện câu xưng hô sai vai trò: *"Bạn có thể chọn một khung giờ phù hợp với lịch làm việc của khách hàng."*
- Lượt 3: AI không nhận diện được khách hàng đang khẳng định lại giờ 14:00, tiếp tục coi như yêu cầu kiểm tra danh sách giờ và trả lời: *"Dưới đây là khung giờ bạn có thể giới thiệu cho khách hàng của bạn: ... Vui lòng tư vấn cho khách hàng của bạn về các khung giờ phù hợp nhất."*
- Booking State trong Database không lưu `selected_time: "14:00"`, không lưu `available_slots`, và không có trạng thái `time_selection_status`.

---

## 7. Kết quả mong đợi (Expected Result)
1. **Nhận diện đúng Intent `SELECT_TIME_SLOT`**:
   - Khi khách nói "Cho t lịch 14:00.", "T muốn lịch lúc 14:00.", "Cho mình giờ 14h", hệ thống nhận diện đây là hành động chọn khung giờ cụ thể trong ngày 03/11/2026.
2. **Duy trì Context & Available Slots**:
   - Lưu trữ danh sách `available_slots` từ kết quả kiểm tra lịch của Lượt 1 vào `booking_state`.
   - Giữ nguyên ngày `2026-11-03` xuyên suốt cuộc hội thoại.
3. **Xác nhận khung giờ trực tiếp (No Redundant Listing)**:
   - Khi 14:00 có trong `available_slots` (hoặc Backend xác nhận còn trống), AI phản hồi trực tiếp:
     *"Dạ, khung giờ 14:00 ngày 03/11/2026 hiện đang còn trống. Bạn muốn chọn khung giờ này đúng không ạ?"*
   - Cập nhật Booking State:
     + `booking_date`: "2026-11-03"
     + `selected_time`: "14:00"
     + `time_selection_status`: "pending_confirmation" (hoặc "selected")
   - Tuyệt đối không trả lại toàn bộ danh sách giờ trống.
4. **Phản hồi đúng vai trò 100%**:
   - AI luôn trực tiếp giao tiếp với khách hàng: *"Bạn", "Em", "Salon"*.
   - Tuyệt đối không bao giờ xuất hiện các câu: *"giới thiệu cho khách hàng của bạn"*, *"tư vấn cho khách hàng của bạn"*, *"lịch làm việc của khách hàng"*.
5. **Xử lý lặp lại yêu cầu hiệu quả**:
   - Khi khách nhắc lại "T muốn lịch lúc 14:00.", AI duy trì trạng thái đã chọn 14:00, không quay lại bước kiểm tra toàn bộ lịch trống.
   - Tiếp tục dẫn dắt bước tiếp theo (hỏi dịch vụ nếu chưa có dịch vụ, hoặc hỏi họ tên, số điện thoại).

---

## 8. Mức độ nghiêm trọng (Severity) & Ưu tiên (Priority)
- **Severity**: **CRITICAL** (Lỗi nghiêm trọng làm tê liệt quy trình đặt lịch, người dùng không thể chọn giờ để tiếp tục, AI nói sai vai trò gây mất uy tín thương hiệu salon).
- **Priority**: **P0 / BLOCKER** (Phải khắc phục triệt để ngay lập tức).

---

## 9. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis - RCA)

### Root Cause 1: Thiếu module phân loại ý định (Intent Recognition) & Xử lý chọn giờ
- **Bằng chứng code**:
  Trong `chatbox/src/ai/orchestrator.js` và `chatbox/src/ai/tools.js`, hệ thống chỉ có `detectAvailableSlotsQuery()` (dùng regex kiểm tra từ khóa hỏi giờ trống) và `detectConfirmation()` (kiểm tra xác nhận chốt lịch cuối).
  Hoàn toàn không có logic nhận diện Intent `SELECT_TIME_SLOT`.
- Khi khách hàng nhắn *"Cho t lịch 14:00."* hoặc *"T muốn lịch lúc 14:00."*, do có chữ *"lịch"*, không có module phân loại intent chặn lại.
- LLM không có công cụ chuyên biệt để "xác nhận chọn giờ" (Select/Validate Time Slot). Do đó, LLM cho rằng cần kiểm tra lịch nên tiếp tục gọi `check_available_slots`.

### Root Cause 2: Không lưu trữ `available_slots`, `selected_time`, `time_selection_status` trong Booking State
- **Bằng chứng code**:
  Trong `chatbox/src/repositories/conversationRepository.js` dòng 156-175:
  Hàm `updateBookingState(id, bookingState)` chỉ lưu những gì được truyền vào.
  Trong `chatbox/src/ai/orchestrator.js` dòng 271-283:
  Hệ thống chỉ lưu `{ date, time, service_id, service_name, duration, price }`.
  Khi `check_available_slots` được thực thi ở Lượt 1 (dòng 356 hoặc dòng 425), kết quả `toolResult` trả về danh sách `slots` nhưng **không hề được lưu vào `conversation.booking_state`**.
  Hậu quả là ở Lượt 2, hệ thống hoàn toàn mất dấu danh sách giờ trống đã cung cấp, không biết 14:00 có hợp lệ hay không.

### Root Cause 3: Lời nhắc sai vai trò trong kết quả trả về của Tool (Prompt Injection / Role Leak từ Tool Result)
- **Bằng chứng code thực tế**:
  Trong `chatbox/src/ai/tools.js` dòng 682:
  ```javascript
  return JSON.stringify({
    success: true,
    date: normalizedDate,
    slots,
    count: slots.length,
    duration: result.duration || duration,
    message: `Các khung giờ còn trống ngày ${normalizedDate}: ${slots.join(', ')}. Hãy giới thiệu các khung giờ này cho khách.`,
  });
  ```
  Nhìn vào câu: `Hãy giới thiệu các khung giờ này cho khách.`!
  Tương tự ở dòng 672: `...Hãy thông báo cho khách và hỏi khách có muốn kiểm tra ngày ${nextDate} không.`
  Dòng 560: `...Hãy hỏi khách xác nhận dịch vụ cụ thể.`
  Dòng 758: `...Hãy hỏi khách có muốn kiểm tra ngày khác không.`
- **Cơ chế phát sinh bug**:
  Khi LLM nhận được Tool message chứa câu chỉ dẫn dạng mệnh lệnh ngôi thứ 3: *"Hãy giới thiệu các khung giờ này cho khách"*, LLM tự động suy diễn người đang nói chuyện với nó là một nhân viên hoặc đại lý salon, và câu trả lời phải là: *"Dưới đây là khung giờ bạn có thể giới thiệu cho khách hàng của bạn: ... Vui lòng tư vấn cho khách hàng của bạn về các khung giờ phù hợp nhất."*

### Root Cause 4: Thiếu Guardrail điều hướng phản hồi cho Intent Chọn Giờ
- Khi khách hàng nhắn một khung giờ cụ thể ("Cho t lịch 14:00.", "14:00", "14h"), orchestrator không có Guardrail can thiệp để:
  1. Kiểm tra 14:00 có nằm trong `available_slots` hoặc gọi Backend kiểm tra tính khả dụng của slot.
  2. Nếu khả dụng, tạo phản hồi xác nhận trực tiếp: *"Dạ, khung giờ 14:00 ngày 03/11/2026 hiện đang còn trống. Bạn muốn chọn khung giờ này đúng không ạ?"*.
  3. Cập nhật ngay `selected_time = "14:00"` và `time_selection_status = "pending_confirmation"`.
  4. Ngăn chặn việc gọi lại `check_available_slots` và ngăn chặn việc trả lại toàn bộ danh sách slot.

---

## 10. File & Module liên quan
1. `chatbox/src/ai/orchestrator.js`: Điều phối AI, Intent Recognition, State Injection, Guardrails, Response Interceptors.
2. `chatbox/src/ai/tools.js`: Định nghĩa và thực thi Tools, sửa chữa nội dung Tool Result Message để xóa bỏ hoàn toàn văn phong ngôi thứ 3; bổ sung helper kiểm tra slot.
3. `chatbox/src/repositories/conversationRepository.js`: Mở rộng Booking State lưu `available_slots`, `selected_time`, `time_selection_status`, `booking_status`.
4. `chatbox/src/services/appointmentService.js`: Cung cấp hàm kiểm tra tính khả dụng của slot cụ thể `validateSlotAvailability(date, time, duration)`.

---

## 11. Các giả thuyết đã bị bác bỏ
- **Giả thuyết 1**: *Do Frontend không truyền conversationId nên mỗi tin nhắn tạo một conversation mới.*
  - **Bác bỏ**: Kiểm tra `chat.js` và `conversations.js`, `conversationId` được lưu trên client và truyền chính xác trong URL `/api/conversations/:id/chat`.
- **Giả thuyết 2**: *Do LLM model không hỗ trợ function calling.*
  - **Bác bỏ**: Hệ thống có cả native tool_calls lẫn text-embedded JSON parser trong `extractToolCallsFromContent()`, và ở Lượt 1 tool `check_available_slots` đã chạy thành công.
- **Giả thuyết 3**: *Chỉ cần sửa System Prompt là hết lỗi.*
  - **Bác bỏ**: Nguyên nhân bắt nguồn từ việc Tool Result trả về câu văn sai vai trò (`message` trong Tool JSON), thiếu Intent Recognition, và Booking State không lưu `available_slots` cũng như `selected_time`. Nếu chỉ sửa System Prompt thì logic vẫn gọi lại Tool và trả về toàn bộ danh sách giờ.

---
**Kết luận**: Đã xác định đầy đủ bằng chứng và nguyên nhân gốc rễ. Tiến hành lập FIX_PLAN.md.
