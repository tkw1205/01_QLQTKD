# Project: Salon Booking & AI Chatbox Production System

## Architecture
- **Runtime Environment**: Node.js, Express, Socket.IO, Mock JSON Database in `database/data/`.
- **Backend Architecture**:
  - `src/routes/`: Express REST endpoints for appointments, conversations, services, slots, auth.
  - `src/services/`: Core business logic services (`appointmentService.js`, `conversationService.js`, `sessionTimeoutService.js`).
  - `src/repositories/`: Data access layer (`appointmentRepository.js`, `slotRepository.js`, `serviceRepository.js`, `userRepository.js`).
  - `src/ai/`: AI orchestration engine (`orchestrator.js`), function calling tools (`tools.js`), slot calculation (`appointmentAssistant.js`).
  - `src/chat/`: Real-time WebSocket connection handling (`socketHandler.js`).
  - `src/config/jsonStore.js`: Thread/process-safe JSON store with atomic file operations and Windows concurrency retries.
- **Frontend Architecture**:
  - `public/`: HTML/JS views (`appointments.html`, `chat.html`, `js/chat.js`, `js/appointments.js`).
- **Test Architecture**:
  - Node built-in test runner (`node:test`, `node:assert/strict`) via `package.json` (`npm test`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CR-01a: Optional Email on Web Form | Web booking form allows empty email; label states optional | M1 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 2 | CR-01b: Optional Email in Chat Booking | AI tools & prompt allow booking without email; only Name + Phone required | M1 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 3 | CR-01c: Optional Email in API & DB | POST /api/appointments accepts null/empty email; stored as null in DB | M1 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 4 | CR-01d: Appointment Lookup by Phone + Booking Code | Customers query appointment status using customer_phone and booking_code | M1 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx, AC-17 |
| 5 | CR-01e: Lookup UI on Web | Form card on appointments.html accepts Phone + Booking Code | M1 | explorer_survey_1_gen2, spec_miner_survey_1_gen2 |
| 6 | CR-02: Slot Selection Wait Time Unified to 5m | Waiting for customer slot selection and reminder message unified to 5 minutes | M2 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 7 | CR-03a: Holding Slot TTL 5 Minutes | `HOLD_DURATION_MS = 5 * 60 * 1000` in appointmentRepository.js | M2 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 8 | CR-03b: Automatic Holding Slot Release | cleanupExpiredHolds marks unconfirmed 5m holds as cancelled, releasing capacity | M2 | appointmentRepository.js, business_spec_booking.md |
| 9 | CR-03c: Holding Slot Messages & AI Prompts | Updated strings to 5 minutes in routes, tools.js, and orchestrator.js | M2 | explorer_survey_1_gen2 |
| 10 | CR-04a: AI Session Inactivity Warning at 5m | Send warning message after 5 minutes of silence via Socket/REST | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 11 | CR-04b: AI Session Auto-Close at 10m | Auto close conversation (`mode: 'closed'`, `is_lead: true`) after further 5m silence (total 10m) | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 12 | CR-05a: Closed Session Read-Only Archival | Past messages and closed conversation preserved as read-only history | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 13 | CR-05b: Customer Return Auto New Session | When customer sends message into closed session, system creates fresh session | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 14 | CR-05c: Fresh AI Greeting on New Session | AI sends greeting message from the beginning in newly spawned session | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 15 | CR-06: Human Staff Handover 60m Timeout | In human/agent mode, inactivity timeout extended to 60 minutes before auto-closing | M3 | phieu_lam_ro_change_request.md, Câu-trả-lời.docx |
| 16 | R5a: Mock JSON DB Stability & Locking | Add write queue mutex and retry loop on Windows renameSync in jsonStore.js | M4 | explorer_survey_1_gen2, follow-up guidance |
| 17 | R5b: Temp File Cleanup | Eliminate orphaned `.tmp.*` files in database/data/ | M4 | explorer_survey_1_gen2, follow-up guidance |
| 18 | R5c: Showcase UX & Branding Polish | Salon Lumière branding, proper labels and responsive UI on web and chat | M4 | explorer_survey_1_gen2, follow-up guidance |
| 19 | R4a: Update Existing Test Suites for 5m TTL | Update booking_process_salons.test.js (Test 2 & 7) and ai_alternate_slots.test.js | M4 | spec_miner_survey_2_gen2 |
| 20 | R4b: Invert Email Test | Invert ai_booking_flow.test.js Test 1 to verify email optionality succeeds | M4 | spec_miner_survey_2_gen2 |
| 21 | R4c: Dynamic Date Fix | Fix hardcoded past date in ai_slots_fix.test.js to dynamic future date | M4 | spec_miner_survey_2_gen2 |
| 22 | R4d: Fix Test Hanging & Server Cleanup | Add after hooks with stopServer() in task1_auth_separation.test.js | M4 | spec_miner_survey_2_gen2 |
| 23 | R4e: New Session Lifecycle Test Suite | Add tests/session_lifecycle.test.js for CR-04, CR-05, CR-06 | M4 | spec_miner_survey_2_gen2 |
| 24 | R4f: New Booking Lookup & Optional Email Test Suite | Add tests/booking_lookup_and_optional_email.test.js for CR-01 & AC-17 | M4 | spec_miner_survey_2_gen2 |
| 25 | R4g: 100% Pass Verification on npm test | Verify all 18+ test suites pass with --test-concurrency=1 | M4 | spec_miner_survey_2_gen2, Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Booking Flow, Email Optional & Lookup (Nhóm 1) | CR-01 (Web/Chat booking with optional email, API validation, Lookup by Phone + Booking Code) | none | DONE |
| 2 | M2: Holding Slot 5-min TTL & Auto-Release (Nhóm 2) | CR-02, CR-03 (Holding slot TTL 5m, auto release, 5m wait time & messages, appointmentRepository.js) | none | DONE |
| 3 | M3: Session Lifecycle & 2-Stage Timeout (Nhóm 3) | CR-04, CR-05, CR-06 (sessionTimeoutService, 5m warning, 10m closed, 60m staff, new session recovery) | none | DONE |
| 4 | M4: Mock DB Stability, UX Polish & Test Suite 100% (Nhóm 4) | R4, R5 (jsonStore concurrency fix, test fixes, new lifecycle & lookup tests, 100% npm test pass) | M1, M2, M3 | DONE |

## Interface Contracts
### M1 ↔ M2 (Booking & Repository Contract)
- `appointmentRepository.findByBookingCodeAndPhone(bookingCode, phone)`:
  - Input: `bookingCode` (string, e.g. `BK-20261030-XXXX`), `phone` (string, 10 digits).
  - Output: appointment object or `null`.
  - Implemented by M2 in `src/repositories/appointmentRepository.js`.
  - Consumed by M1 in `src/services/appointmentService.js` and `src/routes/appointments.js`.
- `appointmentRepository.createHoldingSlot(data)`:
  - Supports `data.customer_email: null | string`.
  - Sets `hold_expires_at = new Date(Date.now() + 5 * 60 * 1000)`.

### M3 (Session Lifecycle Contract)
- `sessionTimeoutService.start()`:
  - Interval check every 15–30 seconds.
  - State transitions:
    - If `mode === 'ai'` and silence >= 5 mins and `!warning_sent`: send warning message, set `warning_sent = true`.
    - If `mode === 'ai'` and silence >= 10 mins: set `mode = 'closed'`, `is_lead = true`, emit session closed.
    - If `mode === 'human'` or `'waiting_for_agent'` and silence >= 60 mins: set `mode = 'closed'`.
- `conversationService.sendMessage(convId, messageData)`:
  - If target conversation has `mode === 'closed'`:
    - Mark old conversation as read-only history.
    - Automatically create new conversation for the user/session.
    - Return new conversation object with initial AI greeting.

## Code Layout
### M1 (Nhóm 1 - Worker 1) Write Boundaries:
- `src/services/appointmentService.js`
- `src/routes/appointments.js`
- `public/appointments.html`
- `public/js/appointments.js`

### M2 (Nhóm 2 - Worker 2) Write Boundaries:
- `src/repositories/appointmentRepository.js`
- `src/repositories/slotRepository.js`
- `src/ai/tools.js`
- `src/ai/orchestrator.js`

### M3 (Nhóm 3 - Worker 3) Write Boundaries:
- `src/services/sessionTimeoutService.js` (NEW)
- `src/services/conversationService.js`
- `src/routes/conversations.js`
- `src/chat/socketHandler.js`
- `public/js/chat.js`
- `public/chat.html`
- `src/app.js`

### M4 (Nhóm 4 - Worker 4) Write Boundaries:
- `src/config/jsonStore.js`
- `package.json`
- `tests/helpers.js`
- `tests/task1_auth_separation.test.js`
- `tests/booking_process_salons.test.js`
- `tests/ai_booking_flow.test.js`
- `tests/ai_alternate_slots.test.js`
- `tests/ai_slots_fix.test.js`
- `tests/session_lifecycle.test.js` (NEW)
- `tests/booking_lookup_and_optional_email.test.js` (NEW)
