# Handoff Report — explorer_survey_1_gen2

## 1. Observation

Direct observations from codebase inspection:
1. **Holding Slot TTL (R2 / CR-03):**
   - In `src/repositories/appointmentRepository.js:7`: `const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL`.
   - In `src/repositories/appointmentRepository.js:51`: `appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 10m)';`.
   - In `src/repositories/appointmentRepository.js:222`: `new Error('Holding period of 10 minutes has expired. Please select a time slot again.')`.
   - In `src/routes/appointments.js:49`: `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`.
   - In `src/ai/tools.js:39`: `description: 'Bước 6 trong quy trình BPMN: Khóa giữ chỗ tạm thời khung giờ đã chọn trong 10 phút (TTL 10m)...'`.
   - In `src/ai/tools.js:436`: `message: 'ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 10 phút. Hãy thông báo đã giữ chỗ cho khách và xin Họ tên, SĐT (10 số) và Email (bắt buộc) để hoàn tất đăng ký.'`.
   - In `src/ai/orchestrator.js:166-173,393`: Prompts and safety guardrails mandate "giữ chỗ 10 phút".
   - In `docs/spec/phieu_lam_ro_change_request.md` and `docs/spec/Câu-trả-lời.docx`: Item 4 confirmed 5 minutes for holding slots, and Item 2 confirmed 5 minutes for "Chờ chọn giờ".

2. **Chat Session Lifecycle & Idle Timeout (R3 / CR-04, CR-05, CR-06):**
   - Searching for `setInterval`, `setTimeout`, `timeout` in `src/chat/socketHandler.js`, `src/routes/conversations.js`, `src/services/conversationService.js` reveals zero idle conversation timeout tracking logic.
   - When a conversation is closed (`mode === 'closed'`):
     - `src/routes/conversations.js:41` rejects with `400 { success: false, error: 'Conversation is not in AI mode' }`.
     - `src/routes/conversations.js:125` rejects with `400 { success: false, error: 'Conversation is closed' }`.
     - `src/chat/socketHandler.js:142` emits `{ message: 'Conversation not available' }`.
     - `public/js/chat.js:464` shows toast `'Lỗi gửi tin nhắn'` and halts, rather than spawning a new session and archiving the closed one as read-only.
   - In `docs/spec/Câu-trả-lời.docx`:
     - Item 3 confirmed: 5m silence -> warning, 5m further silence -> close (total 10m).
     - Item 5 confirmed: Returning user into closed session triggers new session, preserves old session as read-only.
     - Item 6 confirmed: Staff takeover extends timeout to 60m.

3. **Email Optionality (R1 / CR-01):**
   - `src/services/appointmentService.js:112,157`: `if (customerEmail && !isValidEmail(customerEmail))` already allows null/empty email.
   - `src/repositories/appointmentRepository.js:254,299`: Already supports `customer_email: customerEmail || null`.
   - `src/ai/tools.js:59,80`: `confirm_appointment` and `create_appointment` specify `'customer_email'` as `required`.
   - `src/ai/tools.js:493-509,626-631`: Execution blocks if `!rawEmail` with error `'MISSING_EMAIL'`.
   - `src/ai/orchestrator.js:177-184`: System prompt orders: `Khách hàng BẮT BUỘC phải cung cấp đủ 3 thông tin... Email hợp lệ (BẮT BUỘC)... KHÔNG tạo hoặc chốt lịch khi chưa có đủ Họ tên, Số điện thoại và Email!`.
   - `public/appointments.html:148`: Label says `Địa chỉ Email` without note `(Không bắt buộc)`.

4. **Appointment Lookup (Phone + Booking Code):**
   - `src/routes/appointments.js:178`: `GET /api/appointments/lookup/:token` delegates to `appointmentService.getAppointmentByToken`.
   - `src/services/appointmentService.js:180-199`: Queries only `findByToken` and `findByHoldingToken` by UUID, and checks `appt.guest_session_id === guestSessionId`. Fails with 403 on new sessions.
   - There is no repository method or endpoint for lookup via Phone + Booking Code.
   - `public/appointments.html:186-196`: UI only has input for UUID `token-input`.

5. **Mock JSON Database Layer (`database/data/`):**
   - `src/config/jsonStore.js:255-263`:
     ```javascript
     function saveCollection(collection, data) {
       ensureDataDir();
       cache[collection] = data;
       const filePath = getFilePath(collection);
       const tempPath = `${filePath}.tmp.${Date.now()}`;
       const serialized = JSON.stringify(data, null, 2);
       fs.writeFileSync(tempPath, serialized, 'utf8');
       fs.renameSync(tempPath, filePath);
     }
     ```
   - On Windows, `fs.renameSync` fails when files are accessed concurrently or held by OS handles (`EPERM`/`EBUSY`).
   - 26 leftover `.tmp.*` files exist in `database/data/` (e.g., `appointments.json.tmp.1793206124454`, `messages.json.tmp.1793342546075`), confirming unhandled `renameSync` failures and missing cleanup.
   - `cache[collection]` is updated before `renameSync` succeeds, risking memory-disk desynchronization.
   - `loadCollection` discards file content and resets to default dummy data if JSON parsing throws.

6. **Frontend UI/UX:**
   - `public/appointments.html:6,154,175`: Header states "Chatbox Store", form says "Sản phẩm cần tư vấn", placeholder says "Cần tư vấn giải pháp cấu hình máy cho doanh nghiệp...".
   - `public/chat.html:6,25`: Displays "Chatbox Store".
   - `public/appointments.html:186`: Lookup card only accepts 36-char UUID token.

---

## 2. Logic Chain

1. **Holding Slot Transition:**
   - From Obs 1: `HOLD_DURATION_MS = 10 * 60 * 1000` directly determines slot release timestamps. Expiration is lazily calculated at booking/slot checks.
   - Since CR-03 and client answers explicitly mandate 5 minutes, changing `HOLD_DURATION_MS` to `5 * 60 * 1000`, along with error strings and AI tool/prompt descriptions, directly achieves the 5-minute requirement without breaking existing repository APIs.

2. **Session Timeout Lifecycle:**
   - From Obs 2: The current system has no background timers or timeout checks, and rejects messages to closed conversations with 400 errors.
   - To fulfill CR-04, CR-05, and CR-06:
     - An active background scheduler (`sessionTimeoutService`) running at 15-30s intervals is required to check idle conversations against 5m (warning), 10m (AI close), and 60m (staff close) thresholds.
     - The conversation handler in `routes/conversations.js` and `public/js/chat.js` must intercept messages destined for closed conversations, treat the closed conversation as read-only history, and initialize a new active session with fresh greeting.

3. **Email Optionality:**
   - From Obs 3: The database schema and appointment service already support null emails. The sole blockers preventing email-optional booking are the AI tool schemas (`tools.js`), tool execution validators (`tools.js`), and orchestrator prompts (`orchestrator.js`).
   - Making email optional in `tools.js` and `orchestrator.js` will immediately enable conversational bookings with phone + name only.

4. **Appointment Lookup:**
   - From Obs 4: Guests lose the ability to look up appointments once their session ID changes, and booking codes are not searchable.
   - Creating `findByBookingCodeAndPhone(bookingCode, phone)` in `appointmentRepository.js` and exposing it via `/api/appointments/lookup` satisfies CR-01 and mirrors the business specification.

5. **JSON DB Concurrency & Stability:**
   - From Obs 5: The presence of 26 `.tmp.*` files proves that `fs.renameSync` on Windows encounters transient locks.
   - Adding a write mutex queue per collection, a retry loop with exponential backoff on `renameSync`, guaranteed `unlinkSync` on temp failure, and `.bak` backup will prevent data loss and orphaned files.

---

## 3. Caveats

1. Benchmark integrity mode: Code investigation was conducted strictly on source code files, documents, and specifications without reverse engineering test suites.
2. Production concurrency: The mock JSON database is sufficient for local demo and showcase, but in multi-process clustering (PM2/cluster mode), process-level memory mutexes would not share state across worker processes; file-level locking (`proper-lockfile`) or a real database (PostgreSQL) would be needed for distributed production.
3. Network / AI Provider: In offline environments where Gemini API or external LLMs cannot be reached, fallback maintenance messages or local Ollama should be used.

---

## 4. Conclusion

The application has a clean Express + Socket.IO + Repository structure, but contains 5 specific architectural gaps:
1. Hardcoded 10-minute hold slot TTL in repository, route messages, and AI prompts.
2. Missing 2-stage idle timeout scheduler (5m warning / 10m close for AI; 60m for staff) and missing returning user new session spawning.
3. AI tools and prompts strictly mandate email despite service and DB supporting null email.
4. Lookup by Phone + Booking Code is completely missing in API, repository, AI tools, and UI.
5. `jsonStore.js` lacks Windows file lock retries and temp file cleanup, leaving orphaned `.tmp.*` files.

All gaps can be resolved modularly across 4 distinct worker tasks without altering core architectural paradigms.

---

## 5. Verification Method

Independent verification steps:
1. **Holding Slot 5m TTL:**
   - Inspect `src/repositories/appointmentRepository.js:7` to verify `HOLD_DURATION_MS = 5 * 60 * 1000`.
   - Call `POST /api/appointments/hold` and inspect `data.hold_expires_at` (must be 5 minutes from `created_at`).
2. **Session Timeout & Closed Session Recovery:**
   - Start an AI chat, simulate 5 minutes inactivity; verify warning message is sent via Socket.IO.
   - Simulate further 5 minutes; verify conversation mode transitions to `closed`.
   - Send message to closed conversation; verify a new conversation is spawned and old one remains unchanged.
   - Switch conversation to agent (`mode: 'human'`); verify idle timeout is 60 minutes.
3. **Email Optionality:**
   - Call `POST /api/appointments/hold` and `POST /api/appointments/confirm-hold` with `{ customerName: 'Test', customerPhone: '0901234567', customerEmail: '' }`; verify 200 OK.
   - Test AI dialogue chốt lịch with only Name and Phone; verify booking succeeds.
4. **Appointment Lookup:**
   - Book an appointment to get a `booking_code` (e.g. `BK-20261030-XXXX`).
   - In an incognito window (new `guest_session_id`), call `GET /api/appointments/lookup?bookingCode=BK-20261030-XXXX&phone=0901234567`; verify appointment is returned.
5. **JSON DB Stability:**
   - Inspect `database/data/` to verify zero leftover `.tmp.*` files after writes.
   - Run concurrent writes to verify no `EPERM` unhandled crash.
