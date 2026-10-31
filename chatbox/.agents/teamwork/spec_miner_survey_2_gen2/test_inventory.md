# BÁO CÁO TOÀN DIỆN VỀ BỘ KIỂM THỬ (TEST INVENTORY & GAP ANALYSIS REPORT)

**Tác giả:** `spec_miner_survey_2_gen2`  
**Ngày thực hiện:** 30/10/2026  
**Thư mục làm việc:** `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2`  
**Tài liệu đối chiếu:**
- `docs/spec/business_spec_booking.md` (Đặc tả nghiệp vụ tổng thể & 20 Tiêu chí nghiệm thu AC-01..AC-20)
- `docs/spec/phieu_lam_ro_change_request.md` (Phiếu làm rõ yêu cầu thay đổi CR-01..CR-06)
- `docs/spec/Câu-trả-lời.docx` (Quyết định phê duyệt chính thức từ PO/Client)
- `docs/spec/Thay_doi_-_bo_sung.docx` (Đặc tả chi tiết các yêu cầu thay đổi mới)
- `package.json` & thư mục `tests/` (Mã nguồn bộ kiểm thử thực tế)

---

## 1. TỔNG QUAN HẠ TẦNG VÀ HIỆN TRẠNG BỘ KIỂM THỬ (TEST INFRASTRUCTURE OVERVIEW)

### 1.1. Cấu hình kiểm thử trong `package.json`
- **Test Runner:** Sử dụng trình chạy kiểm thử gốc tích hợp sẵn của Node.js (`node:test` và `node:assert/strict`).
- **Lệnh thực thi trong scripts:**
  ```json
  "test": "node --test tests/**/*.test.js"
  ```
- **Dependencies liên quan kiểm thử:** `uuid`, `jsonwebtoken`, `bcryptjs`, `express`, `socket.io`, `socket.io-client` (devDependencies).
- **Cơ chế cơ sở dữ liệu:** Mock JSON Database lưu trữ tại thư mục `database/data/*.json` (`appointments.json`, `conversations.json`, `messages.json`, `users.json`, `products.json`, `settings.json`, `notifications.json`).

### 1.2. Thống kê quy mô bộ kiểm thử hiện tại
- **Tổng số tệp kiểm thử:** 18 tệp test (`tests/*.test.js`) + 1 tệp tiện ích (`tests/helpers.js`).
- **Tổng số Test Suite (`describe`):** 18 suites.
- **Tổng số Test Case (`test`):** 108 test cases.
- **Hiện trạng thực thi thực tế:**
  - Khi chạy toàn bộ qua lệnh mặc định `npm test` (`node --test tests/**/*.test.js`): Tiến trình chạy song song (parallel) bị **treo (hang)** do:
    1. Một số file test (`task1_auth_separation.test.js`, `rate_limit_removal.test.js`) sử dụng `apiRequest` (gọi `helpers.startServer()`) nhưng **không có hook `after()` gọi `stopServer()` và `closeDb()`**, khiến HTTP server socket giữ mở vĩnh viễn trên Event Loop của Node.js.
    2. Hiện tượng tranh chấp ghi đồng thời (race condition) vào các file JSON database dùng chung trong `database/data/`.
    3. Tranh chấp gọi API đồng thời tới Google Gemini AI gây quá tải / timeout.
  - Khi chạy tuần tự từng file (`node --test tests/<file>.test.js` hoặc cấu hình `--test-concurrency=1`):
    - **12/18 files PASS 100%** (bao gồm: `admin_chat_ai_transition`, `ai_booking_flow`, `appointments`, `auth`, `auth_persistence`, `booking_process_salons`, `conversations`, `notifications`, `products`, `rate_limit_removal`, `rbac_and_users`, `unread_messages_count`).
    - **6/18 files gặp lỗi hoặc timeout**:
      - `ai_alternate_slots.test.js`: 7 PASS, 1 FAIL (do slot bị tranh chấp bởi holding active từ test trước và kiểm tra cứng nội dung prompt 10 phút).
      - `ai_provider_business_flow.test.js`: 2 PASS, 1 FAIL (do kết nối tới Ollama `http://localhost:11434` bị từ chối vì Ollama chưa khởi động).
      - `ai_provider_switching.test.js`: 7 PASS, 3 FAIL (do 3 test case phụ thuộc Ollama cục bộ).
      - `ai_slots_fix.test.js`: 7 PASS, 3 FAIL (do test case 1, 2, 3 ghi cứng ngày `'2026-10-29'`, trong khi ngày hiện tại hệ thống là `2026-10-30`, bị hàm `checkAvailableSlots` chặn do là ngày trong quá khứ).
      - `chat_deduplication.test.js`: 6 PASS khi chạy riêng lẻ, nhưng bị timeout nếu chạy trong chuỗi dài do các cuộc gọi AI Gemini liên tiếp.
      - `task1_auth_separation.test.js`: 5 PASS nhưng thiếu `stopServer()` nên không tự thoát process.

---

## 2. DANH MỤC CHI TIẾT CÁC TỆP KIỂM THỬ HIỆN CÓ (TEST SUITES INVENTORY)

| STT | Tệp kiểm thử | Tên Test Suite | Số Test | Nội dung kiểm thử chính & Assertions | Trạng thái hiện tại |
|:---:|---|---|:---:|---|:---:|
| 1 | `admin_chat_ai_transition.test.js` | Admin Chat - AI Transition & List Display Test Suite | 10 | Luồng chuyển đổi AI <-> Nhân viên, bảo toàn họ tên/SĐT/Email, enriched data, persistence vào `conversations.json`, API counts. | **PASS (10/10)** |
| 2 | `ai_alternate_slots.test.js` | AI Alternate Slots & Booking Flow Test Suite | 8 | Tình huống slot kín, gợi ý slot thay thế, interceptor ép gọi `check_available_slots`, trích xuất giờ khách chọn tiếng Việt. | **FAIL (7/8)** (Test 4 fail) |
| 3 | `ai_booking_flow.test.js` | AI Booking Flow, Email Validation & Admin Sync Test Suite | 8 | AI xác thực thông tin đặt lịch, chốt lịch với holding token, persistence appointments, chống trùng lịch. **Test 1 yêu cầu bắt buộc Email**. | **PASS (8/8)** *(Chứa test lỗi thời cần sửa cho CR-01)* |
| 4 | `ai_provider_business_flow.test.js` | AI Provider Full Business Flow Integration Suite | 3 | Luồng tích hợp AI Provider toàn trình: REST chat với Gemini, chuyển đổi sang Ollama, chuyển đổi về Gemini. | **FAIL (2/3)** (Lỗi Ollama offline) |
| 5 | `ai_provider_switching.test.js` | AI Provider Switching & Resilience Test Suite | 10 | Kiểm thử validation cấu hình Gemini/Ollama, tool calling thực tế, resilience khi sai key/URL. | **FAIL (7/10)** (3 test Ollama fail) |
| 6 | `ai_slots_fix.test.js` | AI check_available_slots Bug Fix Test Suite | 10 | Xử lý đối số `check_available_slots`: unwrap parameters, chuẩn hóa ngày VN, ngày tương đối "ngày mai", ngày quá khứ/kín lịch. | **FAIL (7/10)** (3 test cứng ngày '2026-10-29' fail) |
| 7 | `appointments.test.js` | Appointment Service & API Test Suite | 4 | Tính khung giờ trống, đặt lịch hợp lệ có `confirmedBySystem`, chống đặt trùng lịch 409, tra cứu theo `confirmation_token`. | **PASS (4/4)** |
| 8 | `auth.test.js` | Authentication & Authorization Test Suite | 3 | Đăng nhập sai mật khẩu/email, đăng nhập đúng tài khoản staff/admin, JWT token verification & tài khoản bị vô hiệu hóa. | **PASS (3/3)** |
| 9 | `auth_persistence.test.js` | Task 3: Auth Session Persistence & Rate Limiter Test Suite | 4 | Gọi `/api/auth/me` > 20 lần không bị 429, duy trì session các role, đồng bộ token Cookie/Header, bỏ rate limit local. | **PASS (4/4)** |
| 10 | `booking_process_salons.test.js` | Salon BPMN 2-Phase Booking Process & Gap Verification Suite | 9 | BPMN 2 giai đoạn: Giữ chỗ tạm thời (TTL 10 phút), chống đặt trùng slot, hủy/nhả slot, xác thực chốt lịch chính thức, dọn dẹp expired hold. | **PASS (9/9)** *(Chứa test 10 phút cần sửa cho CR-03)* |
| 11 | `chat_deduplication.test.js` | Chat Message Deduplication & Concurrency Prevention Test Suite | 6 | Chống trùng lặp tin nhắn chat khi click nhanh/Enter liên tục, xử lý tin nhắn nhiều dòng newline, bảo toàn lịch sử GET /messages. | **PASS (6/6)** *(khi chạy đơn lẻ)* |
| 12 | `conversations.test.js` | Conversation & Staff Handoff Test Suite | 5 | Khởi tạo guest session, chat AI, yêu cầu chuyển nhân viên (`waiting_for_agent`), nhân viên claim chống tranh chấp 409, bảo toàn lịch sử. | **PASS (5/5)** |
| 13 | `notifications.test.js` | Task 2: Admin Notification System Test Suite | 4 | CRUD thông báo admin, deduplication thông báo cùng hội thoại, đếm chưa đọc, socket real-time `new_notification`. | **PASS (4/4)** |
| 14 | `products.test.js` | Product API Test Suite | 7 | Lấy danh sách sản phẩm công khai, tìm kiếm từ khóa, lọc danh mục, chi tiết ID/404, phân quyền chặn 401 khi tạo/sửa. | **PASS (7/7)** |
| 15 | `rate_limit_removal.test.js` | Task 2: Rate Limit Removal Verification Test Suite | 3 | Gửi 100 request liên tiếp đến `/health` và `/api/products` không bị 429; gửi 60 request login không bị 429. | **PASS (3/3)** *(Thiếu stopServer)* |
| 16 | `rbac_and_users.test.js` | RBAC & User Management Test Suite | 7 | Đăng ký user, user đặt lịch liên kết tài khoản, xem `/my-appointments`, phân quyền lễ tân xem/lọc lịch, chặn lễ tân đổi trạng thái. | **PASS (7/7)** |
| 17 | `task1_auth_separation.test.js` | Task 1: Separation of Customer Website and Admin Portal Auth & RBAC | 5 | Tách biệt phiên Web khách hàng và Admin portal, role user bị chặn `/api/admin/*`, phân quyền receptionist, customer_token. | **PASS (5/5)** *(Thiếu stopServer)* |
| 18 | `unread_messages_count.test.js` | Unread Message Count & Status Lifecycle Test Suite | 2 | Vòng đời đếm tin chưa đọc cho Admin, reset về 0 khi Admin xem, cập nhật tin chưa đọc khi chuyển đổi AI/Nhân viên. | **PASS (2/2)** |

---

## 3. PHÂN TÍCH CHUYÊN SÂU CÁC ĐIỂM GHI CỨNG & XUNG ĐỘT THEO YÊU CẦU THAY ĐỔI (CR-01..CR-06)

### 3.1. Phân tích TTL Giữ chỗ (Holding Slot) 10 phút vs 5 phút (CR-03 & R2)
- **Vị trí ghi cứng trong mã nguồn:**
  1. `src/repositories/appointmentRepository.js` dòng 7:
     ```javascript
     const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL
     ```
  2. `src/repositories/appointmentRepository.js` dòng 51:
     ```javascript
     appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 10m)';
     ```
  3. `src/routes/appointments.js` dòng 24 & 49:
     ```javascript
     message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'
     ```
  4. `src/ai/tools.js` dòng 436:
     ```javascript
     message: `ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 10 phút. Hãy thông báo đã giữ chỗ cho khách...`
     ```
- **Vị trí kiểm thử hiện tại trong `tests/`:**
  1. `tests/booking_process_salons.test.js` (Test 2, dòng 88):
     ```javascript
     const diffMins = Math.round((expiresAt - now) / 60000);
     assert.ok(diffMins >= 9 && diffMins <= 11, 'TTL phải xấp xỉ 10 phút');
     ```
     -> **Hiện trạng:** Test này đang PASS vì backend đang là 10 phút. **KHI CHUYỂN SANG 5 PHÚT, TEST NÀY SẼ FAIL NGAY LẬP TỨC**. Cần cập nhật thành `assert.ok(diffMins >= 4 && diffMins <= 6, 'TTL phải xấp xỉ 5 phút')`.
  2. `tests/booking_process_salons.test.js` (Test 7, dòng 234):
     ```javascript
     test('7. Cơ chế TTL 10 phút: Tự động giải phóng các bản ghi holding hết hạn (REQ-012)', ...)
     ```
     -> Cần cập nhật mô tả và logic kiểm tra TTL 5 phút.
  3. `tests/ai_alternate_slots.test.js` (Test 4, dòng 283):
     ```javascript
     assert.match(res.content, /giữ chỗ tạm thời.*10 phút/i, 'Khi giữ chỗ thành công thì được thông báo 10 phút');
     ```
     -> Cần cập nhật thành 5 phút.

### 3.2. Phân tích Tính Không Bắt Buộc của Email & Tra cứu lịch (CR-01 & R1)
- **Vị trí bắt buộc Email trong mã nguồn:**
  1. `src/ai/tools.js` (dòng 493-500 trong `confirm_appointment`):
     ```javascript
     if (!rawEmail) {
       return JSON.stringify({
         success: false,
         error: 'MISSING_EMAIL',
         code: 'MISSING_EMAIL',
         message: 'Khách hàng chưa cung cấp địa chỉ Email. Vui lòng hỏi địa chỉ Email của khách hàng...'
       });
     }
     ```
  2. `src/ai/tools.js` (dòng 626-628 trong `create_appointment`):
     ```javascript
     if (!rawEmail) {
       return JSON.stringify({ success: false, error: 'MISSING_EMAIL', code: 'MISSING_EMAIL', message: 'Vui lòng hỏi địa chỉ Email của khách hàng trước khi tạo lịch.' });
     }
     ```
- **Vị trí kiểm thử hiện tại trong `tests/`:**
  1. `tests/ai_booking_flow.test.js` (Test 1, dòng 61):
     ```javascript
     test('1. Bỏ trống email khi gọi confirm_appointment -> Báo lỗi MISSING_EMAIL', async () => {
       ...
       assert.equal(confirmRes.success, false);
       assert.equal(confirmRes.code, 'MISSING_EMAIL');
     });
     ```
     -> **XUNG ĐỘT TRỰC DIỆN VỚI CR-01:** Test này đang ép hệ thống phải báo lỗi khi thiếu email! Khi thực hiện CR-01 (email là optional), test này **BẮT BUỘC PHẢI SỬA** thành: *Bỏ trống email khi gọi confirm_appointment -> Đặt lịch thành công, email lưu null*.
  2. `tests/ai_alternate_slots.test.js` (Test 4, dòng 284):
     ```javascript
     assert.match(res.content, /họ tên|số điện thoại|email/i, 'Tiếp tục thu thập thông tin cá nhân khách');
     ```
     -> Cần điều chỉnh để không bắt buộc đòi email.
- **Hiện trạng kiểm thử Tra cứu lịch hẹn (Appointment Lookup):**
  - Trong `tests/appointments.test.js` (Test 4): Chỉ kiểm thử tra cứu bằng `confirmation_token` qua endpoint `/api/appointments/lookup/:token`.
  - **LỖ HỔNG LỚN (GAP):** **Chưa hề có test case nào kiểm tra tra cứu lịch hẹn bằng Số điện thoại + Mã đặt lịch (`booking_code`, định dạng `BK-YYYYMMDD-XXXX`)**. Đây là tiêu chí nghiệm thu cốt lõi của CR-01 và AC-17.

### 3.3. Phân tích Vòng đời Phiên Chat (Chat Session Lifecycle) (CR-04, CR-05, CR-06 & R3)
- **Tình trạng kiểm thử hiện tại trong toàn bộ `tests/`:** **0% COVERAGE (HOÀN TOÀN CHƯA CÓ BẤT KỲ TEST NÀO)**.
  1. **CR-04: Timeout 2 giai đoạn (5 phút cảnh báo, 10 phút đóng phiên):**
     - Chưa có test kiểm tra gửi tin cảnh báo: *"Bạn cần mình tư vấn dịch vụ nào ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."* sau 5 phút im lặng.
     - Chưa có test kiểm tra chuyển trạng thái sang `closed` sau thêm 5 phút (tổng 10 phút).
  2. **CR-05: Khách nhắn lại vào phiên đã CLOSED:**
     - Hiện tại backend (`src/services/conversationService.js` dòng 29 và `src/chat/socketHandler.js` dòng 242) đang ném lỗi `400 Conversation is closed`.
     - Chưa có logic hoặc test kiểm tra: Phiên cũ chuyển thành read-only (lưu lịch sử), tự động sinh phiên chat mới, AI gửi lời chào lại từ đầu.
  3. **CR-06: Chuyển sang nhân viên thật (Human Mode):**
     - Chưa có test kiểm tra kéo dài timeout lên 60 phút không tương tác mới tự động đóng phiên.

---

## 4. MA TRẬN ĐỐI CHIẾU TIÊU CHÍ NGHIỆP VỤ AC-01..AC-20 VÀ CR-01..CR-06

Dưới đây là bảng đối chiếu chi tiết 20 Tiêu chí nghiệm thu từ `docs/spec/business_spec_booking.md` Mục 17 và 6 Yêu cầu thay đổi CR-01..CR-06:

| Mã AC / CR | Tình huống / Yêu cầu nghiệp vụ | Kết quả mong đợi | Tệp test hiện có | Trạng thái kiểm thử | Đánh giá Pass/Fail & Gaps |
|:---|---|---|---|:---:|---|
| **CR-01** | Email optional, tra cứu bằng SĐT + Mã lịch | Đặt lịch thành công khi email null/rỗng; tra cứu thành công bằng SĐT + booking_code | `ai_booking_flow.test.js` (Test 1), `appointments.test.js` (Test 4) | **GẶP LỖI & THIẾU TEST** | - Test 1 của `ai_booking_flow` đang test ngược (bắt buộc email).<br>- Thiếu test tra cứu bằng SĐT + Mã đặt lịch (`booking_code`). |
| **CR-02** | Thống nhất thời gian chờ chọn giờ & tin nhắn | Cả thời gian chờ và nội dung tin nhắn tự động thống nhất là 5 phút | Chưa có test chuyên biệt | **THIẾU TEST** | Cần bổ sung test kiểm tra nội dung tin nhắn tự động hiển thị đúng 5 phút. |
| **CR-03** | Holding slot TTL 5 phút & tự động nhả slot | Slot giữ tạm 5 phút; hết 5 phút tự động cancelled và nhả lại slot | `booking_process_salons.test.js` (Test 2, 4, 7) | **CẦN CẬP NHẬT** | Đang test TTL 10 phút. Cần cập nhật assert xấp xỉ 5 phút (`diffMins >= 4 && diffMins <= 6`). |
| **CR-04** | Timeout phiên chat AI 2 giai đoạn | 5 phút im lặng gửi cảnh báo; thêm 5 phút chuyển sang CLOSED (tổng 10 phút) | Chưa có test | **THIẾU 100%** | Cần tạo mới `tests/session_lifecycle.test.js` để kiểm thử cảnh báo 5p và đóng phiên 10p. |
| **CR-05** | Khách nhắn lại vào phiên đã CLOSED | Phiên cũ chuyển sang read-only; tự động mở phiên mới và bot chào lại từ đầu | Chưa có test | **THIẾU 100%** | Hiện tại backend trả 400. Cần viết test cho luồng read-only + new session + greeting. |
| **CR-06** | Nhân viên thật tiếp nhận (Human handover) | Timeout kéo dài lên 60 phút không tương tác mới tự động đóng phiên | `conversations.test.js`, `admin_chat_ai_transition.test.js` | **THIẾU TEST TIMEOUT** | Đã test claim và chat nhân viên, nhưng chưa có test cho timeout 60 phút của human mode. |
| **AC-01** | Đặt lịch hợp lệ | Lịch được xác nhận, có mã đặt lịch và trừ đúng các slot | `appointments.test.js`, `booking_process_salons.test.js`, `ai_booking_flow.test.js` | **ĐÃ PHỦ (PASS)** | Đã test tạo lịch thành công, sinh `booking_code` chuẩn `BK-YYYYMMDD-XXXX`. |
| **AC-02** | Slot bắt đầu hết chỗ | Không xác nhận lịch; đưa ra giờ khác hợp lệ | `ai_alternate_slots.test.js`, `appointments.test.js` | **ĐÃ PHỦ (PASS)** | Đã test trả về danh sách slot còn trống khi slot chọn bị kín. |
| **AC-03** | Nhiều khách đặt lượt cuối đồng thời | Chỉ một lịch thành công; lịch còn lại nhận thông báo hết chỗ (409) | `appointments.test.js` (Test 3), `booking_process_salons.test.js` (Test 3, 6) | **ĐÃ PHỦ (PASS)** | Đã test concurrency conflict, trả về 409 `SLOT_CONFLICT`. |
| **AC-04** | Gửi lặp yêu cầu xác nhận | Không tạo lịch trùng | `chat_deduplication.test.js`, `booking_process_salons.test.js` | **ĐÃ PHỦ (PASS)** | Đã test idempotency và deduplication. |
| **AC-05** | Hủy lịch | Trạng thái đổi thành hủy và hoàn đúng sức chứa | `booking_process_salons.test.js` (Test 4) | **PHỦ 1 PHẦN** | Mới test `release-hold`. Cần bổ sung test hủy lịch đã `confirmed` qua `/api/appointments/cancel/:id`. |
| **AC-06** | Đổi lịch hợp lệ | Lịch đổi giờ và sức chứa được chuyển chính xác | Chưa có test | **THIẾU TEST** | Route `PUT /api/appointments/:id/reschedule` đã có trong code nhưng chưa có test case gọi thử. |
| **AC-07** | Đổi lịch không đủ chỗ | Lịch cũ giữ nguyên và có gợi ý giờ khác | Chưa có test | **THIẾU TEST** | Cần test reschedule vào slot đã bị chiếm. |
| **AC-08** | Đặt nhiều dịch vụ | Tính đúng tổng giá, tổng thời lượng và tất cả slot bị ảnh hưởng | Chưa có test | **THIẾU TEST** | Cần test đặt lịch với dịch vụ có `duration_minutes` > 30 (ví dụ 60p, 90p) chiếm nhiều slot liên tiếp. |
| **AC-09** | Lịch vượt giờ đóng cửa | Không cho xác nhận | `appointments.test.js` (Test 1) | **PHỦ 1 PHẦN** | Đã test khung giờ làm việc kết thúc 20:30, cần bổ sung test chặn slot vượt quá 20:30. |
| **AC-10** | Dịch vụ ngừng hoạt động | Không cho đặt lịch mới bằng dịch vụ đó | Chưa có test | **THIẾU TEST** | Cần test đặt lịch với sản phẩm có `is_active: false`. |
| **AC-11** | Admin sửa giá/thời lượng dịch vụ | Lịch cũ giữ nguyên; lịch mới áp dụng thông tin mới | Chưa có test | **THIẾU TEST** | Cần test tính độc lập của lịch cũ khi dịch vụ bị chỉnh sửa trong mock JSON. |
| **AC-12** | Giảm sức chứa slot | Không cho giảm thấp hơn số lượt đang chiếm chỗ | Chưa có test | **THIẾU TEST** | Hiện tại hệ thống dùng mock JSON với sức chứa mặc định 1 lượt/slot. |
| **AC-13** | Ngày nghỉ hoặc slot đóng | Không nhận lịch mới trong khoảng thời gian bị đóng | `ai_slots_fix.test.js` (Test 8) | **PHỦ 1 PHẦN** | Đã test ngày kín toàn bộ lịch. Cần bổ sung test cấu hình ngày nghỉ salon. |
| **AC-14** | Lễ tân tạo lịch trực tiếp | Vẫn áp dụng toàn bộ quy tắc đặt lịch | `booking_process_salons.test.js` (Test 9) | **ĐÃ PHỦ (PASS)** | Lễ tân gọi API đặt lịch tuân thủ các quy tắc slot. |
| **AC-15** | Người dùng thao tác ngoài quyền | Hệ thống từ chối thao tác (401, 403) | `rbac_and_users.test.js`, `task1_auth_separation.test.js`, `products.test.js` | **ĐÃ PHỦ (PASS)** | Rất đầy đủ: User không vào được `/api/admin/*`, Lễ tân không đổi được status hay xóa nhân sự. |
| **AC-16** | Khách tiếp tục chat bằng mã chat | Mở đúng cuộc trò chuyện cũ | `conversations.test.js`, `admin_chat_ai_transition.test.js` | **ĐÃ PHỦ (PASS)** | Tra cứu và tiếp tục chat bằng `guest_session` / `conversationId`. |
| **AC-17** | Tra cứu lịch | Cần đúng mã lịch và số điện thoại tương ứng | `appointments.test.js` (Test 4) | **CẦN NÂNG CẤP** | Đang test qua confirmation_token. Cần nâng cấp theo CR-01: tra cứu bằng SĐT + `booking_code`. |
| **AC-18** | Xem lịch sử lịch hẹn | Hiển thị thay đổi, thời gian và người thực hiện | Chưa có test | **THIẾU TEST** | Cần test trường `updated_at`, `notes`, lịch sử trạng thái trong appointment record. |
| **AC-19** | Tìm kiếm, lọc, thống kê | Kết quả phản ánh dữ liệu lịch hẹn thực tế | `rbac_and_users.test.js` (Test 4), `unread_messages_count.test.js` | **ĐÃ PHỦ (PASS)** | Đã test API danh sách lọc theo status, date, pagination, đếm unread. |
| **AC-20** | Thay đổi codebase | Giao diện và chức năng hiện có không bị thay đổi ngoài phạm vi | Toàn bộ bộ test | **ĐANG THEO DÕI** | Đảm bảo 100% bộ test regression pass sau khi hoàn thiện các CR. |

---

## 5. PHÂN TÍCH NGUYÊN NHÂN CÁC TEST CASE ĐANG FAIL VÀ GIẢI PHÁP KHẮC PHỤC

### 5.1. `ai_slots_fix.test.js` (3 test cases fail)
- **Nguyên nhân:** Test 1, 2, 3 ghi cứng chuỗi ngày `'2026-10-29'`. Vào ngày chạy kiểm thử (`2026-10-30`), `'2026-10-29'` trở thành ngày trong quá khứ. Hàm `appointmentService.checkAvailableSlots` phát hiện ngày quá khứ và ném lỗi `Cannot book appointments in the past`, khiến `res.success` trả về `false !== true`.
- **Giải pháp:** Sử dụng ngày tương đối (ví dụ `getTomorrowDate()` hoặc ngày tương lai cách 2-3 ngày) thay vì ngày cố định `'2026-10-29'`.

### 5.2. `ai_provider_switching.test.js` & `ai_provider_business_flow.test.js` (4 test cases fail)
- **Nguyên nhân:** Các test case kết nối trực tiếp đến máy chủ Ollama cục bộ (`http://localhost:11434`). Trong môi trường CI/CD hoặc máy kiểm thử không chạy sẵn Ollama daemon, tiến trình bị lỗi `ECONNREFUSED`.
- **Giải pháp:** Bổ sung cơ chế Mock Provider hoặc kiểm tra tính khả dụng của Ollama: nếu Ollama không phản hồi trong 500ms thì chuyển sang chế độ Mock Provider hợp lệ để kiểm thử logic chuyển đổi switching và tool calling mà không bị phụ thuộc vào dịch vụ bên ngoài.

### 5.3. `ai_alternate_slots.test.js` (1 test case fail)
- **Nguyên nhân:**
  1. Test 4 thử hold slot `11:00` ngày mai, nhưng do các test trước đó (hoặc file mock `appointments.json`) chưa dọn dẹp triệt để slot bị giữ bởi holding token 10 phút, nên bị xung đột `SLOT_CONFLICT`.
  2. Test 4 có assertion ghi cứng: `assert.match(res.content, /giữ chỗ tạm thời.*10 phút/i)` và `assert.match(res.content, /email/i)` (yêu cầu email).
- **Giải pháp:** Làm sạch `appointments.json` trong `beforeEach` và cập nhật assertion thành 5 phút + email optional.

### 5.4. Lỗi Treo (Hang) khi chạy `npm test` toàn trình
- **Nguyên nhân:**
  1. Thiếu hook dọn dẹp `stopServer()` và `closeDb()` trong `task1_auth_separation.test.js` và `rate_limit_removal.test.js`.
  2. Trình chạy `node --test` của Node.js mặc định chạy song song nhiều tiến trình con. Khi nhiều tiến trình cùng đọc/ghi đồng thời vào các file JSON trong `database/data/`, xảy ra lỗi xung đột file (I/O race condition).
- **Giải pháp:**
  1. Bổ sung đầy đủ hook `after(async () => { await stopServer(); await closeDb(); })` vào mọi file test.
  2. Điều chỉnh script trong `package.json`:
     ```json
     "test": "node --test --test-concurrency=1 tests/**/*.test.js"
     ```
     Điều này đảm bảo các file test chạy tuần tự, cô lập tuyệt đối dữ liệu JSON database và bảo đảm 100% kết quả tin cậy không bị treo.

---

## 6. KẾ HOẠCH NÂNG CẤP VÀ MỞ RỘNG BỘ TEST ĐỂ ĐẠT 100% PASS RATE

### 6.1. Danh mục các test cần cập nhật (Existing Tests Refactoring)
1. **`tests/booking_process_salons.test.js`:**
   - Cập nhật Test 2: Chuyển assertion TTL từ 10 phút sang 5 phút (`diffMins >= 4 && diffMins <= 6`).
   - Cập nhật Test 7: Cập nhật mô tả và logic kiểm tra giải phóng slot holding sau 5 phút.
2. **`tests/ai_booking_flow.test.js`:**
   - Đảo chiều Test 1: Sửa từ *"Bỏ trống email -> Báo lỗi MISSING_EMAIL"* thành *"Bỏ trống email -> Đặt lịch thành công, lưu email null và sinh booking_code"*.
   - Bổ sung kiểm thử: Nếu nhập email sai định dạng (ví dụ `abc@xyz`) thì vẫn báo lỗi `INVALID_EMAIL`.
3. **`tests/ai_alternate_slots.test.js`:**
   - Cập nhật Test 4: Sửa assertion thông báo giữ chỗ từ `10 phút` sang `5 phút`.
   - Đảm bảo dọn dẹp sạch `appointments.json` trước mỗi test case.
4. **`tests/ai_slots_fix.test.js`:**
   - Thay thế chuỗi ngày tĩnh `'2026-10-29'` bằng ngày tương lai động (`getNextWeekday(2)`).
5. **`tests/task1_auth_separation.test.js` & `tests/rate_limit_removal.test.js`:**
   - Bổ sung hook `after(async () => { await stopServer(); await closeDb(); })` để giải phóng HTTP server socket.

### 6.2. Danh mục các test suite mới cần bổ sung (New Test Suites)

#### Suite 1: `tests/session_lifecycle.test.js` (Chuyên trách CR-04, CR-05, CR-06)
Bao gồm các test case:
1. **Cảnh báo timeout sau 5 phút im lặng:** Tạo phiên chat AI, giả lập 5 phút không có tin nhắn mới -> Kích hoạt cơ chế kiểm tra timeout -> Gửi tin nhắn cảnh báo: *"Bạn cần mình tư vấn dịch vụ nào ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
2. **Tự động đóng phiên (CLOSED) sau 10 phút tổng cộng:** Sau khi đã cảnh báo, nếu khách tiếp tục im lặng thêm 5 phút nữa -> Trạng thái phiên chuyển sang `mode: 'closed'`, kích hoạt event socket `conversation_closed`.
3. **Khách nhắn lại vào phiên đã CLOSED -> Tạo phiên mới, lưu lịch sử read-only (CR-05):**
   - Khách gửi tin nhắn vào phiên đã closed qua POST `/api/conversations/:id/chat` hoặc socket.
   - Hệ thống giữ nguyên phiên cũ ở trạng thái read-only.
   - Tự động khởi tạo phiên chat mới (`new_conversation_id`).
   - AI tự động gửi tin nhắn chào mừng lại từ đầu trong phiên mới.
4. **Kéo dài timeout lên 60 phút khi chuyển sang Nhân viên thật (CR-06):**
   - Khi phiên ở chế độ `human` (đã có nhân viên tiếp nhận), sau 5 phút và 10 phút phiên **KHÔNG ĐƯỢC PHÉP ĐÓNG**.
   - Chỉ khi vượt quá 60 phút không có tương tác từ cả hai phía mới tự động đóng phiên.

#### Suite 2: `tests/booking_lookup_and_optional_email.test.js` (Chuyên trách CR-01 & AC-17)
Bao gồm các test case:
1. **Đặt lịch qua Web Form & API không truyền Email:** Gửi request đặt lịch với `customerEmail: null` hoặc `customerEmail: ""` -> Đặt lịch thành công 200, mã `booking_code` được sinh đầy đủ.
2. **Đặt lịch qua Chat AI không truyền Email:** Chatbot AI hoàn tất đặt lịch mà không yêu cầu email, chốt lịch thành công.
3. **Tra cứu lịch hẹn bằng Số điện thoại + Mã đặt lịch (CR-01 & AC-17):**
   - Khách gọi endpoint tra cứu công khai `POST /api/appointments/lookup-by-code` (hoặc `GET /api/appointments/lookup?phone=...&code=...`) với SĐT và Mã booking -> Trả về đúng thông tin chi tiết lịch hẹn.
   - Tra cứu với sai SĐT hoặc sai Mã booking -> Bị từ chối (404 Not Found).
4. **Tra cứu lịch hẹn qua Chatbot AI bằng SĐT + Mã đặt lịch:** Khách nhắn *"Tra cứu lịch hẹn BK-20261030-ABCD với SĐT 0901234567"* -> AI gọi tool tra cứu và hiển thị đúng lịch hẹn.

---

## 7. KẾT LUẬN VÀ KHUYẾN NGHỊ ĐIỀU PHỐI (ORCHESTRATOR RECOMMENDATION)

1. **Về các điểm hardcoded:** Đã định vị chính xác 100% tất cả các file mã nguồn và file test đang hardcode TTL 10 phút và bắt buộc email.
2. **Về các khoảng trống kiểm thử:** Chat session lifecycle (CR-04..CR-06) hiện chưa có test nào; tra cứu lịch bằng SĐT + Mã booking (CR-01, AC-17) chưa có test.
3. **Về điều kiện 100% Pass Rate:**
   - Cần cập nhật `package.json` với script test tuần tự (`--test-concurrency=1`).
   - Cập nhật 5 file test hiện có (`booking_process_salons`, `ai_booking_flow`, `ai_alternate_slots`, `ai_slots_fix`, `task1_auth_separation`).
   - Bổ sung 2 file test mới (`session_lifecycle.test.js` và `booking_lookup_and_optional_email.test.js`).
   - Đảm bảo toàn bộ 120+ test cases sau mở rộng đều vượt qua 100% khi chạy `npm test`.
