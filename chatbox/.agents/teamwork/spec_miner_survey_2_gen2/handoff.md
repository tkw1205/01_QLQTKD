# HANDOFF REPORT — spec_miner_survey_2_gen2

**Date:** 2026-10-30T07:20:00Z  
**Agent:** `spec_miner_survey_2_gen2`  
**Working Directory:** `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2`  
**Parent Orchestrator:** `268096b1-4ea4-4135-bf9f-c4f8c0abc985`  
**Handoff Type:** Hard (Task complete)

---

## 1. OBSERVATION

1. **Test Infrastructure & Package.json:**
   - In `package.json` line 12: `"test": "node --test tests/**/*.test.js"`.
   - The test runner is Node's built-in test runner (`node:test`, `node:assert/strict`).
   - The `tests/` directory contains 19 files: 18 test files (`*.test.js`) and 1 helper module (`tests/helpers.js`).
   - Static analysis via `count_tests.js` identified exactly **18 Test Suites (`describe`)** and **108 Test Cases (`test`)**.
   - Running `npm test` (`node --test tests/**/*.test.js`) in parallel hangs indefinitely because:
     - `tests/task1_auth_separation.test.js` and `tests/rate_limit_removal.test.js` call `apiRequest` (which invokes `startServer()` in `helpers.js`), but **lack an `after()` hook calling `stopServer()` and `closeDb()`**, leaving an unclosed server socket handle on Node's event loop.
     - Concurrent file I/O operations on the shared mock JSON database in `database/data/*.json` trigger file lock/write collisions.

2. **Holding Slot TTL Hardcoding (10 minutes vs 5 minutes):**
   - In `src/repositories/appointmentRepository.js` line 7:
     `const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL`
   - In `src/repositories/appointmentRepository.js` line 51:
     `appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 10m)';`
   - In `src/routes/appointments.js` line 49:
     `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`
   - In `src/ai/tools.js` line 436:
     `message: 'ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 10 phút. Hãy thông báo đã giữ chỗ cho khách và xin Họ tên, SĐT (10 số) và Email (bắt buộc) để hoàn tất đăng ký.'`
   - In `tests/booking_process_salons.test.js` line 88 (Test 2):
     `assert.ok(diffMins >= 9 && diffMins <= 11, 'TTL phải xấp xỉ 10 phút');`
   - In `tests/booking_process_salons.test.js` line 234 (Test 7):
     `test('7. Cơ chế TTL 10 phút: Tự động giải phóng các bản ghi holding hết hạn (REQ-012)', ...)`
   - In `tests/ai_alternate_slots.test.js` line 283 (Test 4):
     `assert.match(res.content, /giữ chỗ tạm thời.*10 phút/i, 'Khi giữ chỗ thành công thì được thông báo 10 phút');`

3. **Email Requirement & Appointment Lookup (CR-01):**
   - In `src/ai/tools.js` lines 493-500 (in `confirm_appointment`):
     `if (!rawEmail) { return JSON.stringify({ success: false, error: 'MISSING_EMAIL', code: 'MISSING_EMAIL', message: 'Khách hàng chưa cung cấp địa chỉ Email...' }); }`
   - In `src/ai/tools.js` lines 626-628 (in `create_appointment`):
     `if (!rawEmail) { return JSON.stringify({ success: false, error: 'MISSING_EMAIL', code: 'MISSING_EMAIL', message: 'Vui lòng hỏi địa chỉ Email của khách hàng trước khi tạo lịch.' }); }`
   - In `tests/ai_booking_flow.test.js` lines 61-84 (Test 1):
     `test('1. Bỏ trống email khi gọi confirm_appointment -> Báo lỗi MISSING_EMAIL', ...)` explicitly asserts that omitting email results in failure (`assert.equal(confirmRes.success, false); assert.equal(confirmRes.code, 'MISSING_EMAIL');`).
   - In `tests/appointments.test.js` lines 188-226: Only tests token lookup (`GET /api/appointments/lookup/:token`).
   - **Zero tests exist for appointment lookup by Phone Number + Booking Code (`booking_code`)**, despite being mandated by CR-01 and AC-17.

4. **Chat Session Lifecycle Coverage (CR-04, CR-05, CR-06):**
   - **0% coverage across the entire test suite**: There are no tests for:
     - 5-minute inactivity warning message ("...phiên chat sẽ kết thúc sau 5 phút").
     - 10-minute total inactivity transition to status `closed`.
     - 60-minute staff handover inactivity timeout.
     - Handling customer return on a closed session (CR-05): currently `src/services/conversationService.js` line 29 throws `400 Conversation is closed`, rather than setting the old session to read-only history and starting a fresh session.

5. **Existing Test Suite Baseline Execution Results:**
   - Sequential execution of all 18 test files revealed:
     - 12 test files pass completely (100% of their test cases).
     - `ai_slots_fix.test.js`: 3 tests failed due to hardcoded past date `'2026-10-29'` (current date is `2026-10-30`, so `appointmentService.checkAvailableSlots` throws `'Cannot book appointments in the past'`).
     - `ai_provider_switching.test.js` (3 failed) & `ai_provider_business_flow.test.js` (1 failed): failed due to unmocked connection attempts to `http://localhost:11434` (Ollama offline).
     - `ai_alternate_slots.test.js`: 1 test failed due to active hold from preceding test colliding on slot `11:00`.
     - `task1_auth_separation.test.js`: 5 passed but hung until timeout due to unclosed HTTP server.

---

## 2. LOGIC CHAIN

1. **Step 1 — Change Request Impact on Existing Tests:**
   - From Observation 2: `tests/booking_process_salons.test.js` Test 2 currently asserts `diffMins >= 9 && diffMins <= 11`. When developers modify `HOLD_DURATION_MS` in `appointmentRepository.js` from 10m to 5m to satisfy CR-03, Test 2 will immediately fail unless updated to assert `diffMins >= 4 && diffMins <= 6`.
   - From Observation 3: `tests/ai_booking_flow.test.js` Test 1 currently enforces that omitting email returns `MISSING_EMAIL`. When developers make email optional per CR-01, Test 1 will immediately fail unless inverted to assert that booking succeeds with `customer_email: null`.
   - From Observation 2: `tests/ai_alternate_slots.test.js` Test 4 asserts prompt text `/giữ chỗ tạm thời.*10 phút/i` and `/email/i`. When bot prompt is unified to 5 minutes and optional email per CR-02 and CR-01, this test will fail unless prompt assertion is adjusted.

2. **Step 2 — Identification of Critical Test Gaps:**
   - From Observation 4: CR-04 (5-min warning, 10-min close), CR-05 (customer return creates new session and archives old as read-only), and CR-06 (60-min staff timeout) have zero tests in `tests/`. Without new automated tests, these features cannot be verified.
   - From Observation 3: CR-01 and AC-17 require appointment lookup by Phone number + Booking code. Currently neither route nor test exists for this lookup method.

3. **Step 3 — Flaky/Broken Test Rectification:**
   - From Observation 5: In `ai_slots_fix.test.js`, tests 1, 2, 3 failed simply because `'2026-10-29'` is in the past. Replacing hardcoded `'2026-10-29'` with dynamic future dates (`getFutureWeekday(2)`) will immediately restore these 3 tests to 100% pass.
   - From Observation 1 & 5: Adding missing `after(async () => { await stopServer(); await closeDb(); })` hooks to `task1_auth_separation.test.js` and `rate_limit_removal.test.js`, and running tests with `--test-concurrency=1`, completely resolves test hanging and race conditions.

---

## 3. CAVEATS

1. **Ollama Integration Tests:** Tests in `ai_provider_switching.test.js` and `ai_provider_business_flow.test.js` that target Ollama (`http://localhost:11434`) require either a running local Ollama instance or mock fallbacks when offline. For benchmark / mock database testing mode, mock fallback is strongly recommended.
2. **Gemini API Key:** Chat tests involving live Gemini API calls depend on network connectivity and valid `GEMINI_API_KEY` in `.env`.
3. **No Code Modified:** As a spec miner agent, I remained strictly read-only and did not modify any source code or test files. All findings are purely observational and analytical.

---

## 4. CONCLUSION

- The existing test suite contains **18 test files, 18 suites, and 108 test cases**.
- Achieving a **100% test pass rate** across CR-01..CR-06 and AC-01..AC-20 requires:
  1. **Updating 5 existing test files:**
     - `tests/booking_process_salons.test.js`: Update Test 2 (5-min TTL assertion) & Test 7.
     - `tests/ai_booking_flow.test.js`: Invert Test 1 to verify email is optional.
     - `tests/ai_alternate_slots.test.js`: Update Test 4 prompt assertion (5-min TTL, optional email) and ensure DB cleanup.
     - `tests/ai_slots_fix.test.js`: Replace hardcoded past date `'2026-10-29'` with dynamic future date.
     - `tests/task1_auth_separation.test.js`: Add `after` hook calling `stopServer()` and `closeDb()`.
  2. **Adding 2 new test suites:**
     - `tests/session_lifecycle.test.js`: Covering CR-04 (5-min warning, 10-min close), CR-05 (customer message on closed session creates new session with fresh AI greeting and sets old session read-only), and CR-06 (60-min staff timeout).
     - `tests/booking_lookup_and_optional_email.test.js`: Covering CR-01 and AC-17 (lookup by Phone + Booking Code via Web API and AI chat, booking without email via Web & AI).
  3. **Updating `package.json` test script:**
     - Add `--test-concurrency=1` to `"test": "node --test --test-concurrency=1 tests/**/*.test.js"` to eliminate mock JSON database write contention and hanging sockets.

All detailed mappings, matrices, and tables have been documented in:
`d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2\test_inventory.md`.

---

## 5. VERIFICATION METHOD

To independently verify all observations and conclusions:

1. **Inspect Test Inventory Document:**
   - File: `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2\test_inventory.md`
2. **Verify Hardcoded TTL in Source and Tests:**
   - Run: `grep -n "HOLD_DURATION_MS" src/repositories/appointmentRepository.js` (line 7)
   - Run: `grep -n "TTL phải xấp xỉ" tests/booking_process_salons.test.js` (line 88)
   - Run: `grep -n "MISSING_EMAIL" tests/ai_booking_flow.test.js` (line 61)
3. **Verify Past Date Failure in `ai_slots_fix.test.js`:**
   - Run: `node --test tests/ai_slots_fix.test.js`
   - Observe failures on subtests 1, 2, 3 due to `'Cannot book appointments in the past'` for date `'2026-10-29'`.
4. **Verify Hanging Process Cause:**
   - Inspect `tests/task1_auth_separation.test.js` and verify absence of `after` hook with `stopServer()`.
