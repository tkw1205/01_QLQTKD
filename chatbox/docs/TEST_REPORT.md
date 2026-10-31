# BÁO CÁO KẾT QUẢ KIỂM THỬ (TEST REPORT)

---

## 1. Thông tin chung
- **Dự án**: Chatbox Consulting Platform (Salon Lumière / Mây Hair Studio).
- **Mục tiêu kiểm thử**: Xác minh triệt để việc sửa lỗi bug AI Chatbox thông báo đặt lịch thành công giả mạo (`MBL-...`), không lưu Database, Admin không nhận lịch, và lỗi không nhất quán kiểm tra lịch trống giữa các lần hỏi.
- **Môi trường thực thi**: Node.js v24.11.0, Node Test Runner (`node --test`), OS Windows.
- **File kịch bản kiểm thử**:
  - `chatbox/tests/bug_chatbox_booking_fix.test.js`
  - `chatbox/tests/slot_consistency_bug.test.js`
  - `chatbox/tests/ai_booking_flow.test.js`

---

## 2. Bảng kết quả thực thi kiểm thử chi tiết

| Test Case ID | Loại Test | Mô tả kiểm thử | Dữ liệu đầu vào | Kết quả mong đợi | Kết quả thực tế | Trạng thái |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-UNIT-01** | Unit | Kiểm tra hàm tạo mã đặt lịch chuẩn hệ thống | `targetDate = '2026-11-02'` | Sinh mã bắt đầu bằng `BK-20261102-`, đúng regex `^BK-\d{8}-[A-Z0-9]{4}$`, không chứa `MBL`. | Mã sinh ra dạng `BK-20261102-XXXX`, không chứa tiền tố `MBL`. | **PASS** |
| **TC-UNIT-02** | Unit | Validate định dạng số điện thoại Việt Nam | `0987654321`, `0345678901`, `12345`, `abcdefghij` | Số 10 số đầu 03/05/07/08/09 hợp lệ, các chuỗi khác bị từ chối. | Regex `PHONE_REGEX` hoạt động chính xác 100%. | **PASS** |
| **TC-UNIT-03** | Unit | Validate email tùy chọn trong `confirm_appointment` | Case 1: `email = null`<br>Case 2: `email = 'email_khong_hop_le'` | Case 1: Thành công, lưu `null`.<br>Case 2: Báo lỗi `INVALID_EMAIL`. | Case 1 thành công lưu email `null`.<br>Case 2 báo đúng mã lỗi `INVALID_EMAIL`. | **PASS** |
| **TC-UNIT-04** | Unit | Chặn đặt lịch ngày trong quá khứ | `date = '2020-01-01'` | Ném lỗi từ chối đặt lịch vào ngày trong quá khứ. | Hệ thống ném ngoại lệ với thông báo lỗi rõ ràng. | **PASS** |
| **TC-INT-01** | Integration | Tool `confirm_appointment` lưu bản ghi vào DB và trả về mã thật | `customer_name = 'Nguyễn Văn Thừa'`, `customer_phone = '0987654321'`, `appointment_date = '2026-11-02'`, `appointment_time = '11:00'` | `success: true`, mã booking dạng `BK-...`, bản ghi tồn tại trong `appointments.json` với trạng thái `confirmed`. | `appointments.json` lưu bản ghi thành công với `BK-20261102-...`, trạng thái `confirmed`. | **PASS** |
| **TC-INT-02** | Integration | API Admin `GET /api/appointments?date=2026-11-02` truy xuất lịch vừa tạo | Token Admin hợp lệ, query `date=2026-11-02` | API trả về 200, danh sách chứa lịch hẹn của Nguyễn Văn Thừa với đầy đủ Tên, SĐT, Giờ, Dịch vụ, Mã booking. | Admin API trả về đúng bản ghi của khách hàng Thừa lúc 11:00 ngày 02/11/2026. | **PASS** |
| **TC-E2E-01** | E2E | **(Tái hiện Bug 1 - Sửa)** Đặt lịch Cắt tóc Layer 11:00 ngày 02/11/2026 qua Chatbox | Dịch vụ: Cắt tóc Layer<br>Ngày: 02/11/2026<br>Giờ: 11:00<br>Khách: Nguyễn Văn Thừa - 0987654321 | AI thông báo thành công kèm mã thật `BK-...`, DB có bản ghi, Admin nhìn thấy lịch hẹn. | Đặt lịch thành công, mã `BK-20261102-...`, lưu DB thành công, Admin API hiển thị đầy đủ. | **PASS** |
| **TC-E2E-02** | E2E | Guardrail chặn đứng tuyên bố thành công giả mạo (False Booking Claim Blocked) | Tin nhắn người dùng thông thường, AI không gọi tool chốt lịch | AI không được phép trả lời thành công giả, không có mã `MBL-...`, nếu chưa chốt thì yêu cầu xác nhận. | Guardrail kích hoạt, loại bỏ hoàn toàn câu thành công giả và mã `MBL-...`. | **PASS** |
| **TC-E2E-03** | E2E | Chống trùng lịch khi đặt vào khung giờ đã có hẹn (Slot Conflict) | Yêu cầu giữ chỗ vào 11:00 ngày 02/11/2026 (đã có lịch từ TC-E2E-01) | Báo `success: false`, mã lỗi `SLOT_CONFLICT`, gợi ý danh sách khung giờ khác KHÔNG chứa 11:00. | Trả về `SLOT_CONFLICT`, `available_slots` không chứa 11:00. | **PASS** |
| **TC-E2E-04** | E2E | Chống tạo trùng lịch khi retry hoặc gửi request nhiều lần (Idempotency) | Gọi `confirm_appointment` 2 lần liên tiếp với cùng `holding_token` | Lần 2 trả về bản ghi đã xác nhận, mã booking giữ nguyên, DB chỉ có đúng 1 bản ghi. | Cả 2 lần trả về cùng mã booking, DB chỉ chứa duy nhất 1 bản ghi. | **PASS** |
| **TC-E2E-05** | E2E | Admin lọc lịch theo ngày 02/11/2026 | Query API `GET /api/appointments?date=2026-11-02` | Hiển thị tất cả lịch hẹn đã đặt trong ngày 02/11/2026, không loại bỏ nhầm lịch hợp lệ. | Toàn bộ lịch ngày 02/11 hiển thị chính xác, phân trang và trạng thái đầy đủ. | **PASS** |
| **TC-E2E-06** | E2E | Không hồi quy: Kênh đặt lịch ngoài Chatbox (`POST /api/appointments`) | Gọi trực tiếp API tạo lịch truyền thống | Bản ghi được tạo với status `pending` hoặc `confirmed`, mã booking `BK-...`. | Tạo lịch thành công qua API truyền thống, mã `BK-...`, không phát sinh regression. | **PASS** |
| **TC-E2E-07** | E2E | **(Tái hiện Bug 2 - Sửa)** Hỏi lịch ngày 2/11 lúc 17h30 lần 1 báo đã kín, lần 2 hỏi lại KHÔNG ĐƯỢC đưa ra 17h30 | Lần 1: Giữ chỗ 17:30 ngày 2/11 (đã kín)<br>Lần 2: "ngày đó còn những lịch trống nào nữa" | Lần 1: Báo không khả dụng.<br>Lần 2: Trả về danh sách giờ trống TUYỆT ĐỐI KHÔNG chứa 17:30. | Lần 1: `success: false`.<br>Lần 2: `slots` không chứa 17:30, 17:00 hay 18:00. Tính nhất quán được bảo toàn. | **PASS** |

---

## 3. Tổng kết số liệu kiểm thử

- **Tổng số test case thực thi**: 13/13 test cases.
- **Số test case đạt (PASS)**: **13 (100%)**.
- **Số test case lỗi (FAIL)**: **0 (0%)**.
- **Thời gian thực thi**: ~1.34 giây.
- **Hồi quy (Regression)**: **0 lỗi hồi quy**, tất cả các suite `ai_booking_flow.test.js` (8/8 pass) và `slot_consistency_bug.test.js` (6/6 pass) đều đạt 100%.

---

## 4. Bằng chứng log kiểm thử thực tế

```text
▶ COMPREHENSIVE TEST SUITE: Bug Chatbox Booking Fix & Verification
  ▶ 6.1. Unit Tests
    ✔ 6.1.1. Tạo mã đặt lịch chuẩn hệ thống (BK-YYYYMMDD-XXXX), tuyệt đối không sinh mã MBL-... (1.3874ms)
    ✔ 6.1.2. Validate dữ liệu đầu vào: Số điện thoại Việt Nam hợp lệ và không hợp lệ (0.2947ms)
    ✔ 6.1.3. Validate email tùy chọn: Hợp lệ, null và báo lỗi khi sai cú pháp (6.7792ms)
    ✔ 6.1.4. Kiểm tra điều kiện lịch trống và không cho phép đặt ngày quá khứ (21.6274ms)
  ✔ 6.1. Unit Tests (30.9475ms)
  ▶ 6.2. Integration Tests
    ✔ 6.2.1. Tool confirm_appointment tạo bản ghi chuẩn trong Database và trả về booking_code thật (9.8849ms)
    ✔ 6.2.2. API Admin GET /api/appointments lấy chính xác lịch vừa tạo với đầy đủ thông tin (74.5972ms)
  ✔ 6.2. Integration Tests (85.0392ms)
  ▶ 6.3. End-to-End Test Cases (REQ-01 -> REQ-06)
    ✔ Test Case 01: Đặt lịch thành công qua Chatbox -> Có mã thật, lưu DB, Admin thấy (30.3106ms)
    ✔ Test Case 02: Guardrail chặn thông báo thành công giả khi chưa lưu DB (False Booking Claim Blocked) (8.2965ms)
    ✔ Test Case 03: Đặt lịch trùng thời gian -> Từ chối, chống trùng lịch, AI báo chính xác (2.6912ms)
    ✔ Test Case 04: Gửi yêu cầu đặt lịch nhiều lần -> Không tạo lịch trùng (Idempotency) (11.3636ms)
    ✔ Test Case 05: Admin lọc lịch theo ngày 02/11/2026 -> Thấy đầy đủ, không loại bỏ nhầm (9.2948ms)
    ✔ Test Case 06: Đặt lịch từ kênh khác (POST /api/appointments) hoạt động bình thường, không hồi quy (38.6484ms)
    ✔ Test Case 07 (Slot Consistency): Hỏi lịch ngày 2/11 lúc 17h30 lần 1 báo đã kín, lần 2 hỏi lại KHÔNG ĐƯỢC đưa ra 17h30 (3.3955ms)
  ✔ 6.3. End-to-End Test Cases (REQ-01 -> REQ-06) (104.9523ms)
✔ COMPREHENSIVE TEST SUITE: Bug Chatbox Booking Fix & Verification (264.4689ms)
ℹ tests 13
ℹ suites 4
ℹ pass 13
ℹ fail 0
```
