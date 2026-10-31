# Handoff Report — Reviewer 1: Booking Flow & Slot Engine Review (CR-01, CR-02, CR-03)

## Review Summary
- **Target Milestones**: M1 (CR-01) & M2 (CR-02, CR-03)
- **Verdict**: **REQUEST_CHANGES**
- **Integrity Assessment**: No integrity violations detected (no hardcoded cheats, facades, or bypassed logic).
- **Core Status**: CR-01 is 100% complete and verified. CR-03 holding engine (TTL 5m, auto-release, lookup) is 100% complete. However, CR-02 / CR-03c has a Major finding: an un-updated legacy string in `src/routes/appointments.js` line 49 returning 10 minutes instead of 5 minutes.

---

## 1. Observation
1. **Holding Slot TTL & Auto-Release (`src/repositories/appointmentRepository.js`)**:
   - Line 7: `const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL`
   - Lines 49–56: `cleanupExpiredHolds()` automatically marks expired holding appointments as `cancelled` with note `'Holding slot expired (TTL 5m)'`.
   - Lines 32–40: `isSlotOccupiedByAppt()` dynamically evaluates `appt.hold_expires_at <= now` to immediately treat expired holds as vacant.
   - Lines 215–228: `confirmHold()` rejects expired holds with status 410 and message: `'Holding period of 5 minutes has expired. Please select a time slot again.'`.
   - Lines 351–364: `findByBookingCodeAndPhone(bookingCode, phone)` is fully implemented, normalizing phone and uppercase booking code.

2. **Optional Email & Lookup API (`src/services/appointmentService.js`)**:
   - Lines 112–118: `confirmHoldingSlot()` normalizes `customerEmail`: if empty string, whitespace, or null, it becomes `null`. Email regex validation runs only if a non-empty string is provided.
   - Lines 158–164: `createAppointment()` identically normalizes email and commits `trimmedEmail` to storage.
   - Lines 232–307: `lookupAppointmentByPhoneAndBookingCode(phone, bookingCode)` normalizes inputs, calls `appointmentRepo.findByBookingCodeAndPhone`, with resilient fallbacks to `findAll` and `jsonStore`.
   - Line 6: `const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;` permits `user@domain..com` (consecutive dots in domain).

3. **Routing & Legacy Hold Response Message (`src/routes/appointments.js`)**:
   - Line 24: `// POST /api/appointments/hold - Step 6: Temporary Hold Slot (TTL 10 mins)`
   - Lines 47–51:
     ```javascript
     res.status(201).json({
       success: true,
       message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.',
       data: held,
     });
     ```
     *Verbatim observation*: Line 49 explicitly returns `'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`, even though `held.hold_expires_at` is 5 minutes from `now`.
   - Lines 177–201: `GET /api/appointments/lookup?phone=...&bookingCode=...` is correctly exposed without requiring `guest_session_id` cookies, enabling public lookup across devices.

4. **AI Tools & Orchestrator (`src/ai/tools.js` & `src/ai/orchestrator.js`)**:
   - `tools.js` line 39: `hold_appointment_slot` description specifies `5 phút (TTL 5m)`.
   - `tools.js` lines 59 & 80: `confirm_appointment` and `create_appointment` specify `required: ['customer_name', 'customer_phone']`; email is documented and handled as optional.
   - `tools.js` line 436: Success message specifies `trong 5 phút. Hãy thông báo đã giữ chỗ cho khách và xin Họ tên, SĐT (10 số)... (email là tuỳ chọn)`.
   - `orchestrator.js` lines 143, 166, 172, 173: System prompts explicitly mandate 5-minute hold rules and optional email.
   - `orchestrator.js` line 396: Safety regex `/(?:trong\s*(?:5|10)\s*phút)/gi` clears false hold claims if no active hold exists in DB.

5. **Frontend UI (`public/appointments.html` & `public/js/appointments.js`)**:
   - `public/appointments.html` line 148: Email label updated to `Địa chỉ Email (Không bắt buộc)`. Input does not have `required`.
   - `public/appointments.html` lines 184–221: Dedicated Lookup Card for Phone Number + Booking Code (`form-lookup-code`).
   - `public/js/appointments.js` lines 198–206: `handleBookingSubmit` passes `customerEmail: email || null`.
   - `public/js/appointments.js` lines 244–274: `lookupByPhoneAndCode` calls `/api/appointments/lookup?phone=...&bookingCode=...` and renders appointment details card with booking code badge and status.

6. **Test Execution Results**:
   - Target test suites command:
     `node --test tests/booking_lookup_and_optional_email.test.js tests/booking_process_salons.test.js tests/appointments.test.js`
     Output: **18 tests passed, 0 failed** (100% pass).
   - Full regression suite command:
     `npm test`
     Output: **119 tests across 20 suites passed, 0 failed** (100% pass, runtime 88.5s).
   - Adversarial challenge suite command:
     `node --test tests/adversarial_cr01_cr03.test.js`
     Output: Subtest 5.1 failed with assertion:
     `Expected holding message to state 5 minutes, but got: "Khung giờ đã được giữ chỗ tạm thời trong 10 phút."`

---

## 2. Logic Chain
1. Requirement R2 in `ORIGINAL_REQUEST.md`, Acceptance Criteria CR-02, and `docs/spec/Câu-trả-lời.docx` Item 2 state: *"Thống nhất 5 phút cho thời gian chờ chọn giờ và nội dung tin nhắn tự động."*
2. PROJECT.md Feature 9 (CR-03c) specifically mandates: *"Holding Slot Messages & AI Prompts: Updated strings to 5 minutes in routes, tools.js, and orchestrator.js"*.
3. Observation 3 directly demonstrates that `src/routes/appointments.js` line 49 still returns `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`.
4. While Worker M2 correctly updated `appointmentRepository.js`, `tools.js`, and `orchestrator.js` within M2's write boundaries, Worker M1 omitted this update in `src/routes/appointments.js` (Worker M1's write boundary).
5. Existing test `tests/booking_process_salons.test.js` only checked `hold_expires_at` diff in minutes (`diffMins >= 4 && diffMins <= 6`) but did not assert `res.body.message`, allowing this bug to go undetected in standard CI.
6. When an end user or frontend calls `POST /api/appointments/hold`, they are told their hold lasts 10 minutes; after 5 minutes, the backend cancels the hold, creating a severe UX mismatch and unexpected 410 errors.
7. Therefore, work cannot be approved until this message is updated to 5 minutes.

---

## 3. Findings

### [Major] Finding 1: Un-updated holding response message in `src/routes/appointments.js`
- **What**: `POST /api/appointments/hold` returns a legacy 10-minute hold message.
- **Where**: `src/routes/appointments.js`, Line 49 (`message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`) and Line 24 comment (`// POST /api/appointments/hold - Step 6: Temporary Hold Slot (TTL 10 mins)`).
- **Why**: Violates CR-02 and CR-03c. Mismatches backend 5-minute TTL (`HOLD_DURATION_MS = 300000`), misinforming users.
- **Suggestion**:
  - In `src/routes/appointments.js:24`: Change `(TTL 10 mins)` to `(TTL 5 mins)`.
  - In `src/routes/appointments.js:49`: Change `'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'` to `'Khung giờ đã được giữ chỗ tạm thời trong 5 phút.'`.

### [Minor] Finding 2: Permissive email domain regex in `appointmentService.js`
- **What**: `EMAIL_REGEX` matches emails with double dots in domain (`user@domain..com`).
- **Where**: `src/services/appointmentService.js`, Line 6.
- **Why**: Minor format leniency in non-empty email input.
- **Suggestion**: Update to `/^[^\s@]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/` if strict domain dot separation is desired.

### [Advisory] Finding 3: Guest session cookie isolation in adversarial tests
- **What**: In `tests/adversarial_cr01_cr03.test.js`, subtests 1.4 and 2.1–2.3 failed because requests were made without `x-guest-session` headers, causing the server to reject confirmation with 403 Access Denied.
- **Where**: `tests/adversarial_cr01_cr03.test.js`, Lines 184–195 and 228–236.
- **Assessment**: This proves `appointmentRepository.js` correctly enforces guest session ownership security (positive finding). The test harness should provide matching `x-guest-session` headers.

---

## 4. Caveats
- No code was modified by Reviewer 1, strictly honoring the Review-Only constraint.
- CR-04, CR-05, and CR-06 (Session Lifecycle) were outside this reviewer's primary scope (assigned to Reviewer 2), though verified passing in the global `npm test` run.

---

## 5. Conclusion
- **Verdict**: **REQUEST_CHANGES**
- CR-01 (Optional Email & Lookup API/UI) is **APPROVED** as fully implemented with exceptional quality.
- CR-03 (Holding Slot TTL 5m & Auto-Release Engine) is **APPROVED** as robust and verified.
- CR-02 requires Worker M1 to fix the legacy `'10 phút'` string in `src/routes/appointments.js` line 49 to `'5 phút'`.
- Once this 1-line change is made, full approval can be granted immediately.

---

## 6. Verification Method
To verify the fix and full regression:
1. Update `src/routes/appointments.js` line 49 to `'Khung giờ đã được giữ chỗ tạm thời trong 5 phút.'`.
2. Run target suites:
   ```powershell
   node --test tests/booking_lookup_and_optional_email.test.js tests/booking_process_salons.test.js tests/appointments.test.js
   ```
   Expect: 18/18 tests pass.
3. Verify adversarial hold message check:
   ```powershell
   node -e "
   const { apiRequest, stopServer } = require('./tests/helpers');
   (async () => {
     const res = await apiRequest('/api/appointments/hold', {
       method: 'POST',
       body: { appointmentDate: '2028-12-01', appointmentTime: '10:00' }
     });
     if (res.body.message.includes('5 phút') && !res.body.message.includes('10 phút')) {
       console.log('PASS: Holding message correctly states 5 minutes');
     } else {
       console.error('FAIL: Holding message still contains 10 minutes:', res.body.message);
     }
     await stopServer();
   })();
   "
   ```
4. Run full test suite:
   ```powershell
   npm test
   ```
   Expect: 119/119 tests pass across all 20 test suites.
