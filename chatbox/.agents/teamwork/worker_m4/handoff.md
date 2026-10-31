# Handoff Report — Milestone M4: Mock DB Stability, UX Polish & Test Suite 100%

## 1. Observation
- **Concurrency & File Locks in `src/config/jsonStore.js`**:
  - `saveCollection` wrote directly to `.tmp` without collection-level write serialization. On Windows, concurrent writes or transient file locks from file system indexers/antivirus caused `EPERM` or `EBUSY` when renaming `.tmp` over the target JSON file.
  - Startup did not clean up orphaned `.tmp` files.
- **Test Runner in `package.json`**:
  - Script was `"test": "node --test tests/**/*.test.js"`, which ran test files concurrently and caused concurrent file contention on shared Mock JSON collections.
- **5-Minute TTL & Optional Email Regressions**:
  - `tests/booking_process_salons.test.js`: Test 2 asserted `diffMins >= 9 && diffMins <= 11` (based on old 10m TTL), and Test 7 asserted `TTL 10m` in notes.
  - `tests/ai_booking_flow.test.js`: Test 1 asserted rejection without email (`Thiếu thông tin email`), conflicting with CR-01 where email is optional. Test 4 depended on holding state from Test 1.
  - `tests/ai_alternate_slots.test.js`: Test 4 asserted prompt notes with 10 minutes, and in full suite runs encountered `SLOT_CONFLICT` due to overlapping 45-minute slots at 10:30 from previous tests.
  - `tests/ai_slots_fix.test.js`: Test 4 hardcoded past date `'2026-10-29'`, causing `SLOT_UNAVAILABLE` because past dates are rejected.
  - `tests/ai_provider_switching.test.js` & `tests/ai_provider_business_flow.test.js`: Directly attempted HTTP connection to `http://localhost:11434` for Ollama; when Ollama was not running locally, tests threw unhandled connection errors (`ECONNREFUSED`).
  - `tests/helpers.js` & `tests/task1_auth_separation.test.js`: An active HTTP server listening handle in `helpers.js` (`testServer`) kept Node's event loop alive, causing test processes to hang.
- **Verification Command Execution**:
  - Command: `npm test` (`node --test --test-concurrency=1 tests/**/*.test.js`)
  - Verbatim Output:
    ```
    TAP version 13
    ...
    1..20
    # tests 119
    # suites 20
    # pass 119
    # fail 0
    # cancelled 0
    # skipped 0
    # todo 0
    # duration_ms 70561.3781
    ```

## 2. Logic Chain
1. *Observation*: Windows file system operations are sensitive to file locks (`EPERM`/`EBUSY`) when performing atomic file swaps via `fs.renameSync`.
   *Action*: Added a synchronous mutex queue (`collectionLocks`) using `Atomics.wait` on `SharedArrayBuffer` in `src/config/jsonStore.js`. Added a 5-retry loop around `fs.renameSync` with exponential backoff (50-100ms) and unique temporary file naming (`.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`). Added `cleanupOrphanedTmpFiles()` on startup and on error.
2. *Observation*: Running 20 integration test files concurrently causes cross-file race conditions on the single shared JSON datastore.
   *Action*: Updated `package.json` to `"test": "node --test --test-concurrency=1 tests/**/*.test.js"`.
3. *Observation*: Node's event loop hung when `testServer` in `tests/helpers.js` remained open and `sessionTimeoutService` interval ran in the background.
   *Action*: In `tests/helpers.js`, called `testServer.unref()`, added `'Connection': 'close'` to default request headers, and added a `process.on('beforeExit')` hook calling `sessionTimeoutService.stop()` and `testServer.closeAllConnections()`. Added `await stopServer(); await closeDb();` in `tests/task1_auth_separation.test.js`.
4. *Observation*: M1/M2 requirements changed holding TTL from 10 minutes to 5 minutes, and made email optional (CR-01).
   *Action*:
   - In `tests/booking_process_salons.test.js`: Updated Test 2 assertion to `diffMins >= 4 && diffMins <= 6` and Test 7 notes assertion to `TTL 5m`.
   - In `tests/ai_booking_flow.test.js`: Inverted Test 1 to verify that booking without email succeeds with `customer_email: null`, returning a 201 response and booking code. In Test 4, added explicit hold setup so it runs independently.
   - In `tests/ai_alternate_slots.test.js`: Cleaned overlapping appointments on `tomorrow` in `before()`, `after()`, and Test 4 (`(start < 690 && end > 660)` filter) to prevent collision with lingering 45-minute slots.
   - In `tests/ai_slots_fix.test.js`: Replaced `'2026-10-29'` with dynamic future date `getVietnamDate(5)`.
   - In `tests/ai_provider_switching.test.js` & `tests/ai_provider_business_flow.test.js`: Added offline Ollama check with mock fallback so the tests pass reliably in CI/offline environments.
5. *Observation*: CR-04, CR-05, CR-06, and CR-01/AC-17 required new test coverage.
   *Action*:
   - Created `tests/session_lifecycle.test.js` (6 tests):
     1. CR-04 Phase 1: 5m silence in AI mode -> Warning message and `warning_sent = true`.
     2. CR-04 User interaction: Customer message after warning -> Resets warning (`warning_sent = false`).
     3. CR-04 Phase 2: 10m total silence -> Session closes (`mode: 'closed'`, `is_lead: true`, holding slot cancelled).
     4. CR-05 Returning customer: Old session stays read-only, new session auto-created with Salon Lumière greeting.
     5. CR-05 REST API test: `POST /api/conversations/:id/chat` on closed session returns new session and greeting.
     6. CR-06 Human Handover: Timeout extended to 60m, does not close at 5m or 10m.
   - Created `tests/booking_lookup_and_optional_email.test.js` (5 tests):
     1. CR-01 Direct API / BPMN booking without email succeeds.
     2. CR-01 AI booking flow without email succeeds (`customer_email: null`).
     3. CR-01 Public booking lookup by Phone + Booking Code (Phone: `0909123456`, Booking Code: `BK-20261031-ABCD`).
     4. CR-01 Lookup case-insensitive & snake_case / camelCase compatibility.
     5. CR-01 Security & 404 validation (mismatched phone/code returns 404, missing fields return 400).

## 3. Caveats
- No external real Ollama server is required to pass the test suite; the suite tests graceful degradation and provider switching when Ollama is offline.
- Gemini provider test makes a live call if `GEMINI_API_KEY` is present in `.env`, which succeeded within ~4.6 seconds.
- Exclusive write boundary strictly maintained: Only `src/config/jsonStore.js`, `package.json`, `tests/helpers.js`, and the 10 test suites within our assignment were modified or created.

## 4. Conclusion
All R4 and R5 objectives have been completed:
- `src/config/jsonStore.js` is hardened against race conditions and Windows file locks.
- `package.json` test runner executes sequentially with `--test-concurrency=1`.
- All 8 existing test suites updated for 5-minute TTL, optional email, and offline resilience.
- 2 new test suites created covering Session Lifecycle (CR-04, CR-05, CR-06) and Booking Lookup / Optional Email (CR-01, AC-17).
- 100% of tests pass across all 20 test suites (119/119 tests pass, 0 fail).

## 5. Verification Method
- Execute the project test command:
  ```powershell
  npm test
  ```
- Expected result:
  `# tests 119`
  `# suites 20`
  `# pass 119`
  `# fail 0`
- Inspect modified files:
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
  - `tests/session_lifecycle.test.js`
  - `tests/booking_lookup_and_optional_email.test.js`
