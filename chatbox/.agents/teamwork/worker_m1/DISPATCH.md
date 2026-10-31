# Dispatch — Worker M1: Booking Flow, Email Optional & Lookup (Nhóm 1)

## Scope & Objective
Implement CR-01:
1. Email optionality:
   - Allow booking appointments without requiring email on Web booking form (`public/appointments.html`, `public/js/appointments.js`) and API (`src/routes/appointments.js`, `src/services/appointmentService.js`).
   - If email is empty string, convert to `null`.
   - Update Web booking form: label for email should clearly state "(Không bắt buộc)" / Optional.
2. Appointment lookup by Phone + Booking Code:
   - Implement appointment lookup using Phone number + Booking code (`BK-YYYYMMDD-XXXX`).
   - Add API endpoint in `src/routes/appointments.js`: `GET /api/appointments/lookup` supporting query params `phone` and `bookingCode` (or `booking_code`). Return the appointment details (service, time, slot, status, customer info) if matched, 404 if not found.
   - Do NOT require `guest_session_id` match for lookup by phone + booking_code (so customers can check from any browser or incognito window).
   - Add a clean, responsive lookup UI card on `public/appointments.html` and `public/js/appointments.js` allowing customers to input Phone Number and Booking Code to retrieve and display their booking status and details.
   - Call `appointmentRepository.findByBookingCodeAndPhone(bookingCode, phone)` (or find in collection if repository method pending).

## Exclusive Write Ownership
You own ONLY these files:
- `src/services/appointmentService.js`
- `src/routes/appointments.js`
- `public/appointments.html`
- `public/js/appointments.js`
DO NOT modify any other files.

## References
- `d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md`
- `d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md`
- `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2\spec_inventory.md`
- `d:\projects\chatbox\.agents\teamwork\explorer_survey_1_gen2\codebase_analysis.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-30T07:23:21Z
You are worker_m1. Your working directory is d:\projects\chatbox\.agents\teamwork\worker_m1.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.

MANDATORY FIRST STEPS:
1. Read d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read d:\projects\chatbox\.agents\teamwork\worker_m1\DISPATCH.md.
3. Read d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md.
4. Initialize your BRIEFING.md and progress.md in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE BOUNDARIES:
You own ONLY these files:
- src/services/appointmentService.js
- src/routes/appointments.js
- public/appointments.html
- public/js/appointments.js
DO NOT modify any other files.

TASK DETAILS:
Implement CR-01:
1. Optional Email on Web booking form and API:
   - Accept null/empty email in `src/routes/appointments.js` and `src/services/appointmentService.js`.
   - Update `public/appointments.html` and `public/js/appointments.js` so email is optional (label with "(Không bắt buộc)").
2. Appointment Lookup by Phone + Booking Code:
   - Implement `GET /api/appointments/lookup?phone=...&bookingCode=...` (support query param aliases `bookingCode` and `booking_code`). Return appointment details with 200 OK or 404 if not found.
   - Do NOT require guest_session_id match for phone + booking_code lookup.
   - Call `appointmentRepository.findByBookingCodeAndPhone(bookingCode, phone)`. If not yet defined in repository, implement fallback query on `appointmentRepository.getAll()` / `findBySession()` until repository is updated.
   - Add a clean, responsive lookup UI section in `public/appointments.html` and `public/js/appointments.js` where customers can enter their Phone Number and Booking Code to see their appointment status.

VERIFICATION & HANDOFF:
- Test your changes thoroughly (run syntax checks and verification commands).
- Write handoff.md in your working directory following the 5-component protocol: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send a message to parent orchestrator (268096b1-4ea4-4135-bf9f-c4f8c0abc985) when done.
