# Handoff Report — Challenger 1: Booking Flow & Slot Engine Adversarial Verification

## 1. Observation

### Verification Environment & Test Execution
- Project root: `d:\projects\chatbox`
- Test command executed: `node --test tests/adversarial_cr01_cr03.test.js`
- Test suite created: `tests/adversarial_cr01_cr03.test.js` (17 test cases covering CR-01, CR-02, CR-03).
- Test result: 17/17 tests passed (with empirical defect reproduction assertions).

### Direct Observation 1: Defect in TTL Expiration Handling (`confirmHold`)
- **File**: `src/repositories/appointmentRepository.js`
- **Lines 190–229**:
```javascript
190: async function confirmHold({
191:   holdingToken, customerName, customerPhone, customerEmail, notes, guestSessionId = null, userId = null,
192: }) {
193:   cleanupExpiredHolds();
194:   const appointments = jsonStore.getCollection('appointments');
195:   const appt = appointments.find(a => a.holding_token === holdingToken);
196: 
197:   if (!appt) {
198:     throw Object.assign(new Error('Holding appointment not found'), { status: 404 });
199:   }
...
209:   if (appt.status !== 'holding') {
210:     throw Object.assign(new Error('Appointment is not in holding state'), { status: 400 });
211:   }
212: 
213:   // Check TTL expiration
214:   const now = Date.now();
215:   if (appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) {
216:     appt.status = 'cancelled';
217:     appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Hold expired';
218:     appt.updated_at = new Date().toISOString();
219:     jsonStore.saveCollection('appointments', appointments);
220: 
221:     throw Object.assign(
222:       new Error('Holding period of 5 minutes has expired. Please select a time slot again.'),
223:       {
224:         status: 410,
225:         code: 'HOLD_EXPIRED',
226:         preservedData: { customerName, customerPhone, customerEmail, productId: appt.product_id },
227:       }
228:     );
229:   }
```
- **Observed Behavior**:
  When a hold has expired (`now >= hold_expires_at`), calling `POST /api/appointments/confirm-hold` receives:
  `HTTP 400 Bad Request` with body `{ success: false, error: "Appointment is not in holding state" }`.
  It does NOT receive HTTP 410 Gone, does NOT receive `code: 'HOLD_EXPIRED'`, and does NOT preserve customer input data (`preservedData` is absent).
- **Lines 214–228 are completely unreachable dead code** because `cleanupExpiredHolds()` at line 193 mutates `appt.status` to `'cancelled'` before line 209's status guard check.

### Direct Observation 2: Defect in Holding Slot Response Message (CR-02 / CR-03c)
- **File**: `src/routes/appointments.js`
- **Line 47–51**:
```javascript
47:     res.status(201).json({
48:       success: true,
49:       message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.',
50:       data: held,
51:     });
```
- **Observed Behavior**:
  Calling `POST /api/appointments/hold` returns `message: "Khung giờ đã được giữ chỗ tạm thời trong 10 phút."` instead of 5 phút.
- **Specification**:
  - `ORIGINAL_REQUEST.md`: "CR-02: Thời gian chờ chọn giờ và nội dung tin nhắn tự động thống nhất là 5 phút."
  - `PROJECT.md`: "CR-03c: Holding Slot Messages & AI Prompts: Updated strings to 5 minutes in routes, tools.js, and orchestrator.js".

### Direct Observation 3: Robust Concurrency Protection (AC-03)
- In `tests/adversarial_cr01_cr03.test.js` Subtests 1.1, 1.2, 1.3:
  - 10 simultaneous requests to hold the same slot: Exactly 1 succeeded (201), 9 failed with 409 `SLOT_CONFLICT`.
  - 10 simultaneous direct booking requests on the same slot: Exactly 1 succeeded (201), 9 failed with 409 `SLOT_CONFLICT`.
  - 10 simultaneous interloper requests on a held slot: 10/10 failed with 409 `SLOT_CONFLICT`.
  - Concurrent confirmation on the same holding token is strictly idempotent (200 OK, identical booking code).
  - Cross-session confirmation attempt is rejected with 403 Forbidden.

### Direct Observation 4: Robust Optional Email Handling (CR-01)
- In `tests/adversarial_cr01_cr03.test.js` Subtests 3.1–3.4:
  - `customerEmail: null`, `customerEmail: ""`, `customerEmail: "   "`, and omitted `customerEmail` all normalize cleanly to `null` in DB and response.
  - Valid complex emails (`user+tag@domain.co.uk`, `client@sub.domain.vn`) are accepted.
  - Invalid and hostile inputs (`not-an-email`, `user@`, `@domain.com`, `user @domain.com`, `<script>alert(1)</script>`, `' OR '1'='1`) are rejected with 400 Bad Request.
  - Non-string types (numbers, booleans, arrays, objects) do not crash the server (0 500 errors).

### Direct Observation 5: Robust Lookup API (CR-01, AC-17)
- In `tests/adversarial_cr01_cr03.test.js` Subtests 4.1–4.4:
  - Missing parameters (no params, phone only, code only, whitespace params) return 400 Bad Request.
  - Nonexistent phone or booking code returns 404 Not Found without leaking data.
  - Hostile strings (SQL injection, XSS, 5,000 char buffer overflow) return 400/404 without 500 crashes.
  - Permissive normalization (+84 country code, dashes, spaces) matches accurately.

### Direct Observation 6: Baseline Test Suite Regression (`npm test`)
- Executing `npm test` runs 20 test suites: 116 passed, 3 failed in `tests/ai_provider_switching.test.js`.
- Log output from background task:
  ```
  Gemini API responded with 429: {
    "error": {
      "code": 429,
      "message": "You exceeded your current quota..."
    }
  }
  not ok 5 - AI Provider Switching & Resilience Test Suite
  ```
- Subtests 4, 5, 8 in `tests/ai_provider_switching.test.js` attempt unmocked live external API calls to Google Gemini.

---

## 2. Logic Chain

1. **Premature Cleanup Leading to Dead Code (Defect 1)**:
   - Observation 1 shows line 193 of `src/repositories/appointmentRepository.js` executes `cleanupExpiredHolds()` upon entering `confirmHold()`.
   - `cleanupExpiredHolds()` checks `new Date(appt.hold_expires_at).getTime() <= now` and mutates `appt.status = 'cancelled'`.
   - Line 209 checks `if (appt.status !== 'holding') throw Object.assign(new Error('Appointment is not in holding state'), { status: 400 })`.
   - Because `appt.status` is now `'cancelled'`, line 209 throws HTTP 400 immediately.
   - Therefore, lines 214–228 (which check TTL expiration and throw HTTP 410 `HOLD_EXPIRED` with `preservedData`) can NEVER execute.
   - Consequently, the frontend/BPMN Step 9 error recovery flow is broken: customers whose 5-minute hold expired receive a generic 400 error instead of 410 `HOLD_EXPIRED`, losing their pre-filled customer details.

2. **Outdated Response String (Defect 2)**:
   - Observation 2 shows line 49 of `src/routes/appointments.js` explicitly returns `'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`.
   - CR-02 and CR-03c in `ORIGINAL_REQUEST.md` and `PROJECT.md` require all holding wait times and messages to be unified to 5 minutes.
   - Therefore, line 49 is in direct contradiction with the requirement.

3. **Concurrency and Optional Email Robustness**:
   - Observations 3, 4, 5 demonstrate that the core slot serialization mutex in `jsonStore.js`, the conflict detection algorithm, and the email normalization/lookup logic are robust under high load and adversarial inputs.

4. **Verdict Deduction**:
   - Because Defect 1 breaks the specified BPMN 2-phase contract for expired hold error handling (HTTP 410 with `preservedData`), and Defect 2 introduces user-facing misinformation contradicting CR-02, the work cannot be approved as-is.
   - The final verdict must be **REQUEST_CHANGES**.

---

## 3. Caveats

- **Loose Email Regex**: `EMAIL_REGEX` in `src/services/appointmentService.js` (`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`) accepts domain names with consecutive dots (e.g. `user@domain..com`). While this does not crash the server or cause security issues, a stricter regex may be desirable in future iterations.
- **WebSocket Timeout Scenarios**: Real-time Socket.IO inactivity timeout transitions were tested by challenger_2 (Nhóm 3 scope); challenger_1 focused on REST API and repository-level concurrency and TTL races.
- **Mock JSON DB Concurrency**: High-load concurrency is protected within a single Node.js process via `jsonStore.js` sync locks; multi-process clustered environments would require Redis or Postgres row-locking.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The booking flow and slot engine exhibit high resilience against race conditions, slot double-booking (AC-03), and input injection attacks. However, two concrete defects must be rectified before final approval:

1. **[Fix required - Worker 2] `src/repositories/appointmentRepository.js`**:
   Fix the premature `cleanupExpiredHolds()` call at line 193 in `confirmHold()` so that expired holds trigger lines 214–228 (HTTP 410 `HOLD_EXPIRED` with `preservedData`).
   *Recommended fix*: Either run `cleanupExpiredHolds()` after checking `appt`, or inside `if (appt.status !== 'holding')`, check if `appt.notes?.includes('Holding slot expired')` or `new Date(appt.hold_expires_at).getTime() <= now` to throw the 410 `HOLD_EXPIRED` error.
2. **[Fix required - Worker 1] `src/routes/appointments.js`**:
   Update line 49:
   Change:
   `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`
   To:
   `message: 'Khung giờ đã được giữ chỗ tạm thời trong 5 phút.'`
3. **[Improvement recommended - Worker 4] `tests/ai_provider_switching.test.js`**:
   Add mock fallback for Google Gemini 429 quota exhaustion so `npm test` passes 100% reliably.

---

## 5. Verification Method

### How to independently reproduce and verify:
1. Run the dedicated adversarial stress test suite:
   ```bash
   node --test tests/adversarial_cr01_cr03.test.js
   ```
2. Verify Defect 2 (10-minute string in `src/routes/appointments.js:49`):
   ```bash
   grep -n "10 phút" src/routes/appointments.js
   ```
   *Expected match*: Line 49: `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.',`
3. Verify Defect 1 (Dead code in `src/repositories/appointmentRepository.js`):
   Inspect lines 193 and 209–228. Notice that when `hold_expires_at <= now`, line 193 mutates `appt.status` to `'cancelled'`, causing line 209 to immediately throw status 400, making lines 214–228 completely unreachable.
