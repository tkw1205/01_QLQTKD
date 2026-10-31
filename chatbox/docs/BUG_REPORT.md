# BÁO CÁO ĐIỀU TRA VÀ PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ BUG (BUG REPORT)

---

## 1. Bug ID
**BUG-CHATBOX-BOOKING-001** (kết hợp **BUG-CHATBOX-SLOT-002**)

## 2. Bug Title
**Lỗi AI Chatbox thông báo đặt lịch thành công với mã booking giả lập (MBL-...) nhưng không lưu Database và Admin không nhận được lịch hẹn; Không nhất quán kiểm tra lịch trống giữa các lượt hỏi.**

## 3. Module/Feature bị ảnh hưởng
- **Kênh Frontend**: AI Chatbox Widget tại trang chủ (`public/js/chat.js`, `public/index.html`).
- **Tầng AI Agent Backend**: AI Orchestrator & Tool Calling Engine (`src/ai/orchestrator.js`, `src/ai/tools.js`).
- **Tầng Dịch vụ & Dữ liệu**: Booking & Appointment Service/Repository (`src/services/appointmentService.js`, `src/repositories/appointmentRepository.js`, `database/data/appointments.json`).
- **Tầng Quản trị Admin**: Trang quản lý danh sách lịch hẹn Admin (`public/admin/appointments.html`, `src/routes/appointments.js`).

---

## 4. Mô tả lỗi
Khách hàng sử dụng tính năng Chatbox AI tại trang chủ để đặt lịch làm tóc (ví dụ: Cắt tóc Layer vào 11:00 ngày 02/11/2026, cung cấp tên khách hàng "Thừa", SĐT "0987654321"):
- AI phản hồi cho khách hàng tin nhắn khẳng định: *"Đặt lịch thành công! Mã đặt lịch: MBL-20261102-1100-THƯA"*.
- Khách hàng tin rằng cuộc hẹn đã được hệ thống ghi nhận thành công.
- Tuy nhiên, khi Admin đăng nhập vào trang quản trị (`/admin/appointments.html`) và lọc ngày 02/11/2026, **hoàn toàn không có lịch hẹn nào lúc 11:00** của khách hàng này.
- Kiểm tra trực tiếp cơ sở dữ liệu (`database/data/appointments.json`), **không có bất kỳ bản ghi nào** được tạo ra hay xác nhận.
- Ngoài ra, khi khách hàng hỏi kiểm tra lịch trống cho một khung giờ đã có lịch (ví dụ 17:30 ngày 02/11/2026): lần 1 AI trả lời chính xác là khung giờ đã có người đặt, nhưng ở lần hỏi tiếp theo ("ngày đó còn những lịch trống nào nữa"), AI lại trả lời sai hoặc tự bịa ra khung giờ 17:30 do thiếu cơ chế cưỡng chế gọi tool và bảo vệ tính nhất quán ngữ cảnh.

---

## 5. Các bước tái hiện lỗi (Steps to Reproduce)

### Kịch bản 1: AI Chatbox báo thành công giả mạo (Phantom Booking)
1. Truy cập trang chủ hệ thống tại `http://localhost:3000`.
2. Mở cửa sổ Chatbox AI ở góc dưới bên phải màn hình.
3. Nhập yêu cầu đặt lịch: *"Tôi muốn đặt lịch cắt tóc Layer vào ngày 02/11/2026 lúc 11:00, tên Thừa, SĐT 0987654321"*.
4. **Quan sát phản hồi của AI**: AI trả về *"Đặt lịch thành công! Mã đặt lịch: MBL-20261102-1100-THƯA"*.
5. Đăng nhập tài khoản Admin (`admin@example.com` / `Admin@123456`) và truy cập mục **Quản lý lịch hẹn** (`/admin/appointments.html`).
6. Chọn bộ lọc ngày `2026-11-02`.
7. **Kiểm tra kết quả**: Không tìm thấy lịch hẹn lúc 11:00 của khách hàng tên Thừa. Bản ghi hoàn toàn không có trong hệ thống.

### Kịch bản 2: Không nhất quán khi hỏi lịch trống ngày 02/11 lúc 17:30
1. Hệ thống đã có lịch hẹn xác nhận lúc 17:30 ngày 02/11/2026.
2. Khách nhắn trên Chatbox: *"t muốn đặt một lịch làm tóc vào 17:30 ngày 2/11"*.
3. **Lần 1**: AI trả lời chính xác rằng khung giờ 17:30 ngày 02/11 đã có người đặt.
4. **Lần 2**: Khách hỏi tiếp: *"ngày đó còn những lịch trống nào nữa"*.
5. **Quan sát**: AI không gọi công cụ `check_available_slots` mà tự sinh câu trả lời bằng văn bản (text hallucination), vô tình đưa lại khung giờ 17:30 vào danh sách gợi ý.

---

## 6. Kết quả thực tế (Actual Result)
- Khách hàng nhận được tin nhắn thông báo đặt lịch thành công kèm mã booking giả mạo `MBL-20261102-1100-THƯA`.
- Không có tool `confirm_appointment` hoặc `create_appointment` nào ghi nhận thành công vào Database.
- Bảng `appointments.json` không có bản ghi tương ứng.
- Admin không nhìn thấy lịch hẹn của khách trên giao diện quản lý.
- Lần hỏi thứ 2 về lịch trống bị lệch ngữ cảnh hoặc AI tự bịa khung giờ đã kín.

---

## 7. Kết quả mong đợi (Expected Result)
- **Tính xác thực tuyệt đối**: AI chỉ được phép thông báo đặt lịch thành công khi và chỉ khi Backend API/Service thực sự ghi nhận và commit bản ghi thành công vào Database với mã đặt lịch chuẩn hệ thống (dạng `BK-YYYYMMDD-XXXX`).
- **Chặn đứng Hallucination**: Orchestrator phải có Guardrail chặn đứng mọi tin nhắn tuyên bố thành công hoặc chứa mã đặt lịch nếu trong lượt chat đó không có lệnh đặt lịch thật sự thành công từ Database.
- **Tính toàn vẹn của quy trình (BPMN)**: Khi khách cung cấp đủ thông tin (Tên, SĐT, Ngày, Giờ, Dịch vụ), hệ thống phải giữ chỗ tạm thời (`hold_appointment_slot`), yêu cầu khách xác nhận rõ ràng, và khi khách xác nhận thì thực hiện chốt lịch thật sự (`confirm_appointment`).
- **Hiển thị Admin**: Lịch hẹn sau khi đặt thành công phải xuất hiện ngay trong danh sách quản lý của Admin với đầy đủ: Mã đặt lịch, Tên khách, SĐT, Dịch vụ, Ngày, Giờ, Thời lượng và Trạng thái `confirmed`.
- **Nhất quán lịch trống**: Mọi câu hỏi tra cứu lịch trống bắt buộc phải thông qua kết quả tính toán thực tế của `check_available_slots`, tuyệt đối không để AI tự bịa giờ.

---

## 8. Mức độ nghiêm trọng (Severity)
**CRITICAL (Nghiêm trọng nhất)**: Lỗi trực tiếp làm sai lệch dữ liệu kinh doanh cốt lõi của salon. Khách hàng đinh ninh đã có lịch, salon không hề hay biết, dẫn đến xung đột khi khách đến salon làm dịch vụ.

## 9. Mức độ ưu tiên xử lý (Priority)
**P0 / URGENT (Ưu tiên xử lý ngay lập tức)**.

## 10. Phạm vi ảnh hưởng
- Toàn bộ khách hàng đặt lịch qua AI Chatbox tại trang chủ.
- Ban quản lý salon và nhân viên tiếp đón (Admin, Receptionist, Stylist).
- Độ tin cậy của trợ lý AI và tính toàn vẹn dữ liệu của hệ thống.

---

## 11. Các file và module liên quan
1. `chatbox/src/ai/orchestrator.js`: Điều phối luồng AI, xử lý Agentic loop, chặn/cho phép tool calls, định dạng câu trả lời cuối cùng và các chốt chặn an toàn (Safety Guardrails).
2. `chatbox/src/ai/tools.js`: Định nghĩa danh mục công cụ (`TOOL_DEFINITIONS`), thực thi công cụ (`executeTool`), bóc tách ngày/giờ/ngữ cảnh (`extractDateFromText`, `extractDateFromUserAndHistory`, `detectAvailableSlotsQuery`).
3. `chatbox/src/services/appointmentService.js`: Nghiệp vụ đặt lịch, giữ chỗ, kiểm tra khung giờ trống, xác thực số điện thoại và email.
4. `chatbox/src/repositories/appointmentRepository.js`: Lưu trữ và truy vấn dữ liệu cuộc hẹn trong Database (`appointments.json`), sinh mã booking chuẩn `BK-YYYYMMDD-XXXX`.
5. `chatbox/src/routes/appointments.js`: API quản lý lịch hẹn phía Admin và phía công khai.
6. `chatbox/public/admin/appointments.html` & `chatbox/public/js/chat.js`: Giao diện Admin quản lý lịch và widget Chatbox phía người dùng.

---

## 12. Nguyên nhân gốc rễ (Root Cause Analysis)

Qua quá trình điều tra toàn diện mã nguồn từ Frontend, AI Agent, Backend đến Database, nguyên nhân gốc rễ được xác định chính xác gồm 4 yếu tố sau:

### Nguyên nhân 1: AI Hallucination & Thiếu Booking Confirmation Guardrail ở Orchestrator
- **Cơ chế hiện tại**: Trong `src/ai/orchestrator.js`, vòng lặp xử lý nhận phản hồi từ LLM (`finalContent = assistantMessage.content || ''`). Orchestrator có Safety Check 2 (xóa câu nói giữ chỗ nếu chưa có hold), Safety Check 4 (xóa code block), Safety Check 5 (xóa fake tool notice), nhưng **HOÀN TOÀN KHÔNG CÓ Guardrail kiểm tra kết quả chốt lịch thật**.
- **Điểm gãy**: Khi khách hàng cung cấp thông tin hoặc xác nhận, nếu LLM không gọi tool hoặc tool gọi bị chặn bởi điều kiện `!context.customerConfirmed` (trả về mã lỗi nội bộ `CUSTOMER_FINAL_CONFIRMATION_REQUIRED`), LLM ở lượt tiếp theo hiểu sai hoặc tự ý sinh câu văn bản: *"Đặt lịch thành công! Mã đặt lịch: MBL-20261102-1100-THƯA"*.
- Do Orchestrator không đối chiếu câu trả lời cuối cùng với kết quả thực thi công cụ thực tế (`confirmedBookingResult`), câu trả lời giả mạo này được gửi thẳng về Frontend và lưu vào cơ sở dữ liệu tin nhắn của cuộc trò chuyện.

### Nguyên nhân 2: Mã đặt lịch giả mạo do LLM tự bịa (`MBL-...` vs `BK-...`)
- Cấu trúc mã đặt lịch chuẩn của hệ thống được định nghĩa tại `src/repositories/appointmentRepository.js` dòng 137:
  ```javascript
  function generateBookingCode(date) {
    const cleanDate = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BK-${cleanDate}-${rand}`;
  }
  ```
  Mã hợp lệ luôn có tiền tố `BK-` (ví dụ: `BK-20261102-A1B2`).
- Chuỗi mã `MBL-20261102-1100-THƯA` trong hiện tượng lỗi được cấu tạo từ:
  - `MBL`: Viết tắt do AI tự suy diễn từ "Mây Booking Layer" hoặc "Mây Beauty Lounge".
  - `20261102`: Ngày hẹn.
  - `1100`: Giờ hẹn (11:00).
  - `THƯA`: Tên khách hàng viết hoa không dấu.
- Điều này chứng minh 100% mã này do LLM tự tưởng tượng ra mà không hề thông qua hàm `generateBookingCode` của Backend.

### Nguyên nhân 3: Cơ chế Chặn Tool Call (`CUSTOMER_FINAL_CONFIRMATION_REQUIRED`) thiếu nhánh Auto-Resolution hoặc Hướng dẫn rõ ràng
- Tại dòng 351 của `src/ai/orchestrator.js`:
  ```javascript
  if ((toolName === 'confirm_appointment' || toolName === 'create_appointment') && !context.customerConfirmed) {
    const blockedResult = JSON.stringify({
      success: false,
      code: 'CUSTOMER_FINAL_CONFIRMATION_REQUIRED',
      message: 'Khách chưa xác nhận chốt lịch. Hãy tóm tắt thông tin và hỏi khách xác nhận trước.'
    });
    // Trả kết quả blocked cho LLM...
  }
  ```
- Khi khách hàng nhắn một câu đầy đủ cả dịch vụ, ngày giờ, họ tên và SĐT (chưa qua bước giữ chỗ trước đó), AI cố gắng gọi `create_appointment` hoặc `confirm_appointment`. Do `detectConfirmation` trả về `false`, tool call bị chặn. LLM nhận kết quả này nhưng thay vì tóm tắt và xin xác nhận thì lại "vượt rào" bằng cách tự biên soạn văn bản thông báo thành công.
- Ngoài ra, nếu khách hàng thực sự nói câu đồng ý nhưng câu nói đó không nằm trong tập cứng `FINAL_CONFIRMATION_REPLIES` (hoặc câu trước của assistant không chứa các từ khóa kích hoạt regex), tool tiếp tục bị chặn.

### Nguyên nhân 4: Vấn đề Slot Consistency & Nhận diện ngày từ lịch sử
- Tại `src/ai/tools.js` dòng 346 (`extractDateFromUserAndHistory`), khi quét ngược lịch sử chat, hàm này duyệt cả tin nhắn của assistant: nếu assistant vừa đề xuất ngày khác (ví dụ: "Bạn có muốn kiểm tra ngày tiếp theo 03/11 không?"), `extractDateFromUserAndHistory` lấy nhầm ngày đề xuất của assistant thay vì ngày 02/11 mà khách hàng đang hỏi.
- Tại `src/ai/orchestrator.js` dòng 235 & 299: `detectAvailableSlotsQuery` không bao quát hết các biến thể tự nhiên như *"ngày đó còn những lịch trống nào nữa"*, dẫn đến cờ `isAvailableSlotsQuery` bị `false`, interceptor không can thiệp, và AI tự trả lời bằng văn bản bịa đặt (bao gồm cả khung giờ 17:30 đã kín).

---

## 13. Bằng chứng kiểm chứng nguyên nhân (Evidence)

| Giả thuyết | Kết luận | Bằng chứng từ mã nguồn / Thực tế |
| :--- | :---: | :--- |
| 1. AI chỉ phản hồi thành công nhưng không gọi API tạo lịch | **XÁC NHẬN** | Trong `src/ai/orchestrator.js`, không có guardrail đối chiếu `finalContent` với tool execution. `appointments.json` hoàn toàn không có bản ghi nào vào thời điểm AI trả lời thành công. |
| 2. AI tự tạo mã đặt lịch thay vì dùng mã Backend | **XÁC NHẬN** | Toàn bộ source code Backend chỉ sinh mã tiền tố `BK-YYYYMMDD-XXXX`. Chuỗi `MBL-20261102-1100-THƯA` hoàn toàn không tồn tại trong source code hay database. |
| 3. API tạo lịch được gọi nhưng lưu Database thất bại | **BÁC BỎ** | `appointmentRepo.confirmHold` và `create` ghi file đồng bộ qua `jsonStore.saveCollection`. Không có log lỗi I/O hay exception từ jsonStore. |
| 4. Backend trả về thành công trước khi hoàn tất lưu dữ liệu | **BÁC BỎ** | `executeTool` thực hiện tuần tự với `await`. Dữ liệu được `saveCollection` trước khi hàm trả về kết quả JSON. |
| 5. Chatbox và Admin kết nối 2 Database khác nhau | **BÁC BỎ** | Cả hai đều import chung `src/repositories/appointmentRepository.js` và `src/config/jsonStore.js`, trỏ cùng vào thư mục `database/data/`. |
| 6. Lịch đã lưu nhưng Admin truy vấn sai bảng/lọc sai | **BÁC BỎ** | Kiểm tra trực tiếp file `appointments.json` không hề có bản ghi nào có ngày `2026-11-02` lúc `11:00`. Admin hiển thị đúng dữ liệu thực tế của DB. |
| 7. Lịch bị ẩn do bộ lọc mặc định của Admin | **BÁC BỎ** | Bộ lọc Admin mặc định trạng thái rỗng (`""`), tức hiển thị tất cả các trạng thái. Do DB không có bản ghi nên Admin không thể hiển thị. |

---

## 14. Các nguyên nhân phụ và rủi ro liên quan
1. **Thiếu Real-time Socket Event**: Khi tool chốt lịch qua Chatbox thành công, hệ thống chưa emit event `appointment_created` tới room `agents`, khiến Admin đang mở giao diện không thấy dữ liệu nhảy realtime mà phải bấm F5 hoặc Tải lại.
2. **Thiếu trường email & validate email**: Trong `src/ai/tools.js`, `confirm_appointment` bỏ quên tham số `customer_email`, khiến các kịch bản kiểm thử tích hợp (như `ai_booking_flow.test.js`) bị fail.

---

## 15. Đề xuất phương án khắc phục (Resolution Summary)
1. **Bổ sung Post-Generation Booking Guardrail tại `src/ai/orchestrator.js`**:
   - Nếu `finalContent` có chứa thông báo thành công hoặc chứa mã đặt lịch (ví dụ: regex `/đặt lịch thành công|mã đặt lịch|mã booking|BK-/i`):
   - BẮT BUỘC kiểm tra xem trong lượt tương tác hiện tại có tool `confirm_appointment` hoặc `create_appointment` thực thi thành công và có `booking_code` thật từ Backend hay không.
   - Nếu KHÔNG CÓ lịch hẹn thật được tạo: Lập tức gỡ bỏ thông báo thành công giả mạo và mã giả. Điều hướng AI chuyển sang thông báo tóm tắt thông tin và yêu cầu khách hàng xác nhận hoặc thực hiện gọi tool đặt lịch thực sự.
   - Nếu có lịch hẹn thật: Đảm bảo mã hiển thị trong câu trả lời bắt buộc phải là `booking_code` chuẩn hệ thống từ Backend (`BK-...`).
2. **Cải tiến `detectConfirmation` và quy trình xác nhận**: Mở rộng các biến thể đồng ý tiếng Việt tự nhiên và hỗ trợ tự động giữ chỗ/chốt lịch an toàn khi khách hàng chủ động xác nhận thông tin.
3. **Sửa lỗi `extractDateFromUserAndHistory` và `detectAvailableSlotsQuery`**:
   - `extractDateFromUserAndHistory` chỉ ưu tiên lấy ngày từ tin nhắn của người dùng (`sender_type === 'user'`). Chỉ tham khảo tin nhắn của assistant nếu người dùng dùng từ quy chiếu rõ ràng ("ngày đó", "hôm đó").
   - Bổ sung cụm từ *"ngày đó còn những lịch trống nào nữa"* và các biến thể vào danh mục nhận diện tra cứu lịch trống.
4. **Bổ sung Socket Notification**: Emit event `appointment_created` sang room `agents` khi lịch được xác nhận qua AI tool để Admin cập nhật tức thì.
