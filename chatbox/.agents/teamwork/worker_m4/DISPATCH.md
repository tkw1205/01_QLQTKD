# Dispatch — Worker M4: Mock DB Stability, UX Polish & Comprehensive Test Expansion (Nhóm 4)

## Scope & Objective
Implement R4, R5, and ensure 100% test pass across all acceptance criteria (CR-01..CR-06 and AC-01..AC-20):

1. **Mock JSON Database Stability & Concurrency (R5)**:
   - In `src/config/jsonStore.js`:
     - Add write mutex queue per collection to prevent concurrent write collisions on the JSON files.
     - Protect `fs.renameSync` on Windows against transient file locks (`EPERM`/`EBUSY`) with a retry loop (5 retries, 50-100ms exponential backoff).
     - Clean up any `.tmp.*` files on error or startup.
     - Ensure memory cache and disk are atomic.
2. **Update Test Runner Script in `package.json`**:
   - Update test script to: `"test": "node --test --test-concurrency=1 tests/**/*.test.js"` to prevent race conditions during test runs.
3. **Fix and Update Existing Test Suites**:
   - `tests/booking_process_salons.test.js`: Update Test 2 (assert 5-min TTL `diffMins >= 4 && diffMins <= 6`) and Test 7 (assert `TTL 5m`).
   - `tests/ai_booking_flow.test.js`: Invert Test 1 to assert that booking succeeds when email is omitted/null (optional email).
   - `tests/ai_alternate_slots.test.js`: Update Test 4 prompt assertion (5-min TTL, optional email) and ensure DB cleanup.
   - `tests/ai_slots_fix.test.js`: Replace hardcoded past date `'2026-10-29'` with dynamic future date (e.g. `getFutureWeekday(2)`).
   - `tests/task1_auth_separation.test.js` & `tests/rate_limit_removal.test.js`: Add missing `after` hook calling `await stopServer(); await closeDb();` to prevent hanging open socket handles.
   - `tests/ai_provider_switching.test.js` & `tests/ai_provider_business_flow.test.js`: Ensure tests handle offline local Ollama gracefully without crashing.
4. **Create New Comprehensive Test Suites**:
   - `tests/session_lifecycle.test.js`:
     - Test CR-04: 5-min silence triggers Stage 1 warning message and sets `warning_sent = true`.
     - Test CR-04: Additional 5-min silence (total 10m) triggers Stage 2 auto-close (`mode = 'closed'`, `is_lead = true`, `closed_at`).
     - Test CR-05: Customer message on closed session keeps old session read-only, spawns new session with Salon Lumière greeting.
     - Test CR-06: Staff handover extends timeout to 60 minutes before auto-close.
   - `tests/booking_lookup_and_optional_email.test.js`:
     - Test CR-01: Booking via Web API with null/empty email succeeds.
     - Test CR-01: Booking via AI tools without email succeeds.
     - Test CR-01 & AC-17: Lookup by Phone number + Booking Code (`booking_code`) via `GET /api/appointments/lookup` succeeds across independent sessions.
5. **Execute and Verify**:
   - Run `npm test` and verify that 100% of test suites pass with 0 failures!

## Exclusive Write Ownership
You own ONLY these files:
- `src/config/jsonStore.js`
- `package.json`
- `tests/helpers.js`
- `tests/task1_auth_separation.test.js`
- `tests/rate_limit_removal.test.js`
- `tests/booking_process_salons.test.js`
- `tests/ai_booking_flow.test.js`
- `tests/ai_alternate_slots.test.js`
- `tests/ai_slots_fix.test.js`
- `tests/ai_provider_switching.test.js`
- `tests/ai_provider_business_flow.test.js`
- `tests/session_lifecycle.test.js` (NEW)
- `tests/booking_lookup_and_optional_email.test.js` (NEW)
DO NOT modify any other files.

## References
- `d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md`
- `d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md`
- `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2\test_inventory.md`
- `d:\projects\chatbox\.agents\teamwork\explorer_survey_1_gen2\codebase_analysis.md`
- Worker M1, M2, M3 handoffs in `.agents/teamwork/worker_m1/`, `worker_m2/`, `worker_m3/`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-30T07:38:48Z
You are worker_m4. Your working directory is d:\projects\chatbox\.agents\teamwork\worker_m4.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.
