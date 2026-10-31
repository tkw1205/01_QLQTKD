# Dispatch — Worker M2: Holding Slot 5-min TTL & Auto-Release Slot Engine (Nhóm 2)

## Scope & Objective
Implement CR-02 and CR-03:
1. Holding Slot TTL 5 minutes:
   - In `src/repositories/appointmentRepository.js`:
     - Update line 7: `const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL`
     - Update line 51: notes `'Holding slot expired (TTL 5m)'`
     - Update line 222: error message `'Holding period of 5 minutes has expired. Please select a time slot again.'`
     - Implement `findByBookingCodeAndPhone(bookingCode, phone)`: returns appointment if `appt.booking_code === bookingCode` and `appt.customer_phone === phone`.
     - Ensure `cleanupExpiredHolds()` correctly marks appointments expired after 5 minutes and frees their slots.
2. Unify 5 minutes wait time and automated messages:
   - In `src/ai/tools.js`:
     - Update tool description for `hold_slot` / `confirm_appointment` / `create_appointment` to 5 minutes (TTL 5m).
     - Update message strings (e.g. line 436: `"ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 5 phút..."`).
     - In `confirm_appointment` and `create_appointment`: Remove `customer_email` from `required` parameters array (`required: ['customer_name', 'customer_phone']`). Allow `customer_email` to be optional or null (do not return `MISSING_EMAIL` if omitted).
   - In `src/ai/orchestrator.js`:
     - Update system prompt instructions from 10 minutes to 5 minutes.
     - Update prompt regarding customer email: email is optional; customer only needs to provide Name and Phone number to complete booking.

## Exclusive Write Ownership
You own ONLY these files:
- `src/repositories/appointmentRepository.js`
- `src/repositories/slotRepository.js`
- `src/ai/tools.js`
- `src/ai/orchestrator.js`
DO NOT modify any other files.

## References
- `d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md`
- `d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md`
- `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2\spec_inventory.md`
- `d:\projects\chatbox\.agents\teamwork\explorer_survey_1_gen2\codebase_analysis.md`

## 2026-10-30T07:23:34Z
You are worker_m2. Your working directory is d:\projects\chatbox\.agents\teamwork\worker_m2.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.

MANDATORY FIRST STEPS:
1. Read d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read d:\projects\chatbox\.agents\teamwork\worker_m2\DISPATCH.md.
3. Read d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md.
4. Initialize your BRIEFING.md and progress.md in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE BOUNDARIES:
You own ONLY these files:
- src/repositories/appointmentRepository.js
- src/repositories/slotRepository.js
- src/ai/tools.js
- src/ai/orchestrator.js
DO NOT modify any other files.

TASK DETAILS:
Implement CR-02 and CR-03:
1. Holding Slot TTL 5 minutes in `src/repositories/appointmentRepository.js`:
   - Line 7: `const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL`
   - Line 51: notes `'Holding slot expired (TTL 5m)'`
   - Line 222: error message `'Holding period of 5 minutes has expired. Please select a time slot again.'`
   - Implement `findByBookingCodeAndPhone(bookingCode, phone)`: returns matching appointment.
   - Verify `cleanupExpiredHolds()` correctly expires slots older than 5 minutes.
2. Unify 5 minutes wait time and automated messages:
   - In `src/ai/tools.js`:
     - Update descriptions for holding slot (5 minutes TTL).
     - Update message strings (line 436: `"ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 5 phút..."`).
     - In `confirm_appointment` and `create_appointment`: Remove `customer_email` from required parameter array (`required: ['customer_name', 'customer_phone']`). Allow `customer_email` to be optional or null (do NOT return `MISSING_EMAIL` if missing).
   - In `src/ai/orchestrator.js`:
     - Update system prompt instructions from 10 minutes to 5 minutes.
     - Update prompt to treat email as optional (do not block or repeatedly insist on email).

VERIFICATION & HANDOFF:
- Test your changes thoroughly (run syntax checks and verification commands).
- Write handoff.md in your working directory following the 5-component protocol: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send a message to parent orchestrator (268096b1-4ea4-4135-bf9f-c4f8c0abc985) when done.

