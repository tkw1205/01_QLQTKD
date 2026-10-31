# Dispatch — Challenger 1: Booking Flow & Slot Engine Adversarial Verification

## Mission
Empirically stress-test and challenge the correctness and robustness of CR-01, CR-02, CR-03:
1. Concurrency on Last Slot: Run simultaneous booking requests on the same remaining slot capacity. Verify that only 1 succeeds and capacity is not exceeded (AC-03).
2. TTL Expiration Race Condition: Hold a slot, advance time past 5 minutes (300,001 ms), attempt to confirm the expired hold. Verify it is rejected with 410 and capacity is freed for another customer.
3. Optional Email Variations: Send payloads with `customerEmail: null`, `customerEmail: ""`, `customerEmail: "   "`, and omitted `customerEmail`. Verify all normalize cleanly to `null` without throwing 500 or failing validation. Send invalid emails (e.g. `"not-an-email"`) and verify proper 400 validation error.
4. Lookup API Robustness: Test `GET /api/appointments/lookup` with mismatched phone, wrong booking code, missing query parameters, special characters. Verify appropriate 404/400 errors and ensure no internal server errors (500) or crashes.
5. Provide empirical stress test scripts and record verdict: **APPROVE** or **REQUEST_CHANGES**.


## 2026-10-30T08:05:00Z
Received instruction from orchestrator (268096b1-4ea4-4135-bf9f-c4f8c0abc985):
Adversarially stress-test CR-01, CR-02, CR-03:
- Concurrent booking attempts on remaining slot capacity (AC-03).
- TTL expiration race condition at exactly 5m (300,001 ms).
- Edge cases in optional email (null, empty, whitespace, special chars, invalid email format rejection).
- Edge cases in lookup API (missing params, malformed booking codes, nonexistent phone numbers).
- Provide empirical verification results and verdict: APPROVE or REQUEST_CHANGES.
- Write handoff.md and send completion message to orchestrator.
