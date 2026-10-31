# Handoff Report: Specification Mining Survey (CR-01 to CR-06 & AC-01 to AC-20)

- **Agent**: `spec_miner_survey_1_gen2`
- **Working Directory**: `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2`
- **Recipient**: Parent Orchestrator (`268096b1-4ea4-4135-bf9f-c4f8c0abc985`)
- **Deliverable**: `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2\spec_inventory.md`

---

## 1. Observation

Direct observations extracted from the authoritative specification files and codebase:

### 1.1. Authoritative Change Request Approvals (`docs/spec/Câu-trả-lời.docx`)
Extracted verbatim text from `docs/spec/Câu-trả-lời.docx`:
- **Vấn đề 1 (Email)**:
  > `[x] Phương án A (Không bắt buộc)`  
  > *"Email không bắt buộc. Tra cứu lịch ưu tiên bằng số điện thoại."*
- **Vấn đề 2 (Chờ chọn giờ)**:
  > `[x] Phương án B (5 phút)`  
  > *"Thống nhất thời gian chờ và nội dung tin nhắn là 5 phút."*
- **Vấn đề 3 (Cơ chế timeout)**:
  > `[x] Phương án B (Đợi 5 phút cảnh báo, 5 phút sau đóng)`  
  > *"Tổng thời gian 10 phút mới đóng phiên."*
- **Vấn đề 4 (Thời gian giữ chỗ)**:
  > `[x] Phương án B (5 phút)`  
  > *"Giữ chỗ trong 5 phút để khách hoàn tất thông tin."*
- **Vấn đề 5 (Khách nhắn lại khi đã đóng)**:
  > `[x] Phương án A (Mở phiên mới, lưu lịch sử cũ)`  
  > *"Phiên cũ chuyển sang chỉ đọc, bot chào lại từ đầu trong phiên mới."*
- **Vấn đề 6 (Chat với nhân viên thật)**:
  > `[x] Phương án B (Kéo dài timeout lên 30–60 phút)`  
  > *"Thời gian chờ 60 phút trước khi tự động đóng phiên."*

### 1.2. Baseline Code Observations
- **`src/repositories/appointmentRepository.js`**:
  - Line 7: `const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL` (Needs update to 5 minutes: `5 * 60 * 1000`).
  - Line 51: `appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 10m)';` (Needs update to `TTL 5m`).
  - Line 222: `new Error('Holding period of 10 minutes has expired. Please select a time slot again.')` (Needs update to 5 minutes).
  - Lines 330-363: Has `findByToken`, `findByHoldingToken`, `findById`, `findBySession`, `findByUserId`, but NO method to look up appointments by `customerPhone + booking_code`.
- **`src/routes/appointments.js`**:
  - Lines 49, 178-184: Message states *"Khung giờ đã được giữ chỗ tạm thời trong 10 phút"* and lookup endpoint `GET /lookup/:token` only checks confirmationToken or holdingToken UUID, not Phone + Booking Code.
- **`src/ai/tools.js`**:
  - Lines 39, 59, 64, 80, 84:
    - Line 39: Description says *"Khóa giữ chỗ tạm thời khung giờ đã chọn trong 10 phút (TTL 10m)"*.
    - Line 59: `required: ['customer_name', 'customer_phone', 'customer_email']` (Enforces email as mandatory).
    - Line 64: `customer_email: { type: 'string', description: 'Địa chỉ email của khách hàng (bắt buộc để nhận xác nhận)' }`.
- **`src/ai/orchestrator.js`**:
  - Lines 143, 166, 172-183: System prompt strictly enforces 10-minute hold and mandatory email collection:
    - Line 177: *"Khách hàng BẮT BUỘC phải cung cấp đủ 3 thông tin cá nhân: Họ và tên, SĐT, Địa chỉ Email hợp lệ (BẮT BUỘC)"*.
    - Line 181: *"NẾU KHÁCH CHƯA CUNG CẤP EMAIL: Bạn PHẢI chủ động hỏi địa chỉ Email..."*.
- **`src/services/conversationService.js` & `src/routes/conversations.js`**:
  - `src/services/conversationService.js:29`: `if (conv.mode === 'closed') throw Object.assign(new Error('Conversation is closed'), { status: 400 });` (Throws 400 error instead of creating new session and greeting from start).
  - `src/routes/conversations.js:41-43`: In `POST /:id/chat`: `if (conv.mode !== 'ai') return res.status(400).json({ success: false, error: 'Conversation is not in AI mode' });`.
  - Inactivity timeout: There is currently NO automated background or scheduled check for 5-minute silence, 10-minute closure, or 60-minute staff timeout.
- **`public/appointments.html`**:
  - Line 148-150: Email field exists on form, but lookup section (Lines 185-197) only has `token-input` ("Mã xác nhận (UUID)..."), lacking fields for SĐT + Mã đặt lịch (booking code).

### 1.3. Core Booking Business Rules (`docs/spec/business_spec_booking.md` §17)
- Observed AC-01 through AC-20 defined verbatim in Section 17, governing capacity calculation, idempotency (AC-04), non-working hours and 20:30 closing (AC-09), max 7-day advance booking limit (§2.1, §5.3), RBAC role prohibitions (§2.2, AC-15), and audit logging (AC-18).

---

## 2. Logic Chain

1. **Step 1: Identifying Authoritative Reconciliation**:
   - `phieu_lam_ro_change_request.md` documented open conflicts between the old spec (`business_spec_booking.md`, `N1.QLQTKD.md`) and the new CR draft (`Thay_doi_-_bo_sung.docx`).
   - `Câu-trả-lời.docx` represents the definitive decision from the Product Owner / Stakeholder, officially checking Options 1A, 2B, 3B, 4B, 5A, and 6B.

2. **Step 2: Deriving CR-01 Implementation Scope**:
   - Because `Câu-trả-lời.docx` approved Option 1A ("Không bắt buộc"): Email remains on forms as optional, API validation must permit null/empty email, and DB must allow `customer_email: null`.
   - Because "Tra cứu lịch ưu tiên bằng số điện thoại", lookup requires matching customer phone number + booking code (`BK-YYYYMMDD-XXXX`), complementing token lookup.

3. **Step 3: Deriving CR-02 & CR-03 Implementation Scope**:
   - Option 2B unified slot selection wait time and reminder message to 5 minutes, resolving the 3m vs 5m contradiction.
   - Option 4B unified the temporary holding slot TTL to 5 minutes (`HOLD_DURATION_MS = 5 * 60 * 1000`). If unconfirmed after 5 minutes, `cleanupExpiredHolds` marks it `cancelled` and frees capacity for other customers.

4. **Step 4: Deriving CR-04 & CR-05 Session Lifecycle Scope**:
   - Option 3B confirmed the 2-stage timeout: 5 minutes silence triggers Stage 1 warning reminder; further 5 minutes silence (total 10 minutes) triggers Stage 2 auto-closure (`mode: 'closed'`, `is_lead: true`).
   - Option 5A confirmed that sending a message to a closed session must preserve the old session as read-only, automatically create a new session, and have the AI greet from the start.

5. **Step 5: Deriving CR-06 Human Handover Timeout**:
   - Option 6B confirmed that when a session enters `waiting_for_agent` or `human` mode, the 10-minute AI timeout is suspended, and an extended 60-minute inactivity timeout is applied before auto-closing.

6. **Step 6: Harmonizing with AC-01 through AC-20**:
   - All 20 core acceptance criteria from `business_spec_booking.md` remain strictly active and are mapped in `spec_inventory.md` alongside CR-01..CR-06 to ensure zero regression.

---

## 3. Caveats

- **No Caveats**: All specification documents (`business_spec_booking.md`, `phieu_lam_ro_change_request.md`, `Câu-trả-lời.docx`, `Thay_doi_-_bo_sung.docx`, `N1.QLQTKD.md`, and prepared documents) were inspected directly and completely reconciled.
- Note on Integrity Constraint: Test source files in `tests/` were not read or referenced for behavioral requirements, strictly adhering to the benchmark integrity guidelines. All behavioral expectations are derived exclusively from specification documents and runtime interfaces.

---

## 4. Conclusion

The specification mining phase is **100% complete**. All 6 Change Requests (CR-01 through CR-06) and 20 Core Acceptance Criteria (AC-01 through AC-20) have been comprehensively extracted, reconciled, and documented into `spec_inventory.md`. The inventory provides:
- 38 Discovered features categorized with full inputs, outputs, error behaviors, and discovery sources.
- 35 Edge cases covering boundary conditions, concurrency, null states, and timeout phase transitions.
- Complete data models, API schema contracts, and a file-level Traceability Matrix for the implementation team.

---

## 5. Verification Method

To independently verify this specification inventory:
1. **Inspect Artifacts**:
   - Review `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2\spec_inventory.md`.
   - Verify approval answers in `docs/spec/Câu-trả-lời.docx` against Section 1 of this report.
   - Verify core business acceptance criteria in `docs/spec/business_spec_booking.md` Section 17.
2. **Execute Test Suite**:
   - Run command: `npm test`
   - Expected status: Baseline tests execute in Node.js test runner against current codebase.
3. **Invalidation Conditions**:
   - If PO modifies answers in `Câu-trả-lời.docx` (e.g. reverts to 10-minute hold or removes email completely instead of optional).
   - If business rules in `business_spec_booking.md` are revised by stakeholders.
