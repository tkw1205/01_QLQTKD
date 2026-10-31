# Handoff Report — Worker M2: Holding Slot 5-min TTL & Auto-Release Engine (CR-02 & CR-03)

## 1. Observation
- `src/repositories/appointmentRepository.js`:
  - Line 7 originally was: `const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL`
  - Line 51 originally was: `appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 10m)';`
  - Line 222 originally was: `new Error('Holding period of 10 minutes has expired. Please select a time slot again.')`
  - `findByBookingCodeAndPhone` did not exist in the repository or `module.exports`.
- `src/ai/tools.js`:
  - `hold_appointment_slot` description had: `'...trong 10 phút (TTL 10m)...'`
  - `confirm_appointment` and `create_appointment` had `customer_email` in their `required` parameters array: `required: ['customer_name', 'customer_phone', 'customer_email']`.
  - Line 436 originally was: `message: \`ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ \${held.appointment_time} ngày \${held.appointment_date} trong 10 phút. Hãy thông báo đã giữ chỗ cho khách và xin Họ tên, SĐT (10 số) và Email (bắt buộc) để hoàn tất đăng ký.\``
  - Lines 493-500 & lines 621-628 returned `code: 'MISSING_EMAIL'` if `!rawEmail`.
- `src/ai/orchestrator.js`:
  - Line 143: `'...Hãy thu thập đủ Tên, SĐT và Email của khách để gọi công cụ confirm_appointment chốt lịch!'`
  - Lines 166, 169, 172, 173: instructed AI that slot holds are 10 minutes.
  - Lines 177-183: mandated that customers MUST provide email before booking.
  - Line 397: `falseHoldRegex` matched `trong 10 phút`.
- `src/repositories/slotRepository.js`:
  - Does not exist as a separate file; slot allocation logic is consolidated in `src/repositories/appointmentRepository.js`.

## 2. Logic Chain
1. By changing `HOLD_DURATION_MS` to `5 * 60 * 1000` (5 minutes) in `src/repositories/appointmentRepository.js`, all new holding appointments receive `hold_expires_at = new Date(Date.now() + 300000).toISOString()`.
2. In `cleanupExpiredHolds()`, appointments in status `'holding'` with `hold_expires_at <= now` transition to `'cancelled'` with note `'Holding slot expired (TTL 5m)'`. Furthermore, `isSlotOccupiedByAppt()` immediately treats holds older than `hold_expires_at` as unoccupied, releasing the slot capacity even prior to batch persistence.
3. In `confirmHold()`, if `hold_expires_at <= now`, the system cancels the appointment and throws a 410 error: `'Holding period of 5 minutes has expired. Please select a time slot again.'`.
4. Implementing `findByBookingCodeAndPhone(bookingCode, phone)` in `src/repositories/appointmentRepository.js` provides the data access method required by Worker M1's service/route lookup endpoint. It normalizes inputs and queries the appointment collection matching both `booking_code` and `customer_phone`.
5. Removing `customer_email` from the `required` array in `confirm_appointment` and `create_appointment` in `src/ai/tools.js`, and only validating email format when `rawEmail` is non-empty, enables customers to complete bookings with only Name and Phone number.
6. Aligning tool messages (line 436) and system prompt instructions in `src/ai/orchestrator.js` unifies all holding slot messaging across AI and human touchpoints to 5 minutes, preventing customer confusion and false promises.

## 3. Caveats
- `src/routes/appointments.js` contains a legacy string `"10 phút"` in hold route handler response; this file is in Worker M1's exclusive write boundary and is updated by Worker M1.
- Test suites `tests/booking_process_salons.test.js` (Test 2) and `tests/ai_booking_flow.test.js` (Test 1) assert 10m TTL and mandatory email; their write boundaries belong to Worker M4, who is assigned tasks R4a & R4b to update/invert those assertions.

## 4. Conclusion
CR-02 and CR-03 have been fully and genuinely implemented within Worker M2's exclusive write boundaries:
- Holding slot TTL is 5 minutes (300,000 ms) in `appointmentRepository.js`.
- Automated release engine `cleanupExpiredHolds()` expires holds after 5 minutes and marks notes as `TTL 5m`.
- `findByBookingCodeAndPhone(bookingCode, phone)` is implemented and exported in `appointmentRepository.js`.
- Tool definitions and execution in `tools.js` treat email as optional and message 5-minute holds.
- AI system prompt in `orchestrator.js` enforces 5-minute hold rules and optional email without blocking on missing email.

## 5. Verification Method
To independently verify the implementation:
1. Syntax check:
   ```powershell
   node --check src/repositories/appointmentRepository.js
   node --check src/ai/tools.js
   node --check src/ai/orchestrator.js
   ```
2. Run test suites:
   ```powershell
   node --test tests/ai_alternate_slots.test.js
   node --test tests/appointments.test.js
   ```
3. Run integration verification script:
   ```powershell
   node -e "
   const assert = require('assert');
   const apptRepo = require('./src/repositories/appointmentRepository');
   const tools = require('./src/ai/tools');

   assert.strictEqual(typeof apptRepo.findByBookingCodeAndPhone, 'function');
   assert.strictEqual(typeof apptRepo.createHoldingSlot, 'function');
   const confirmDef = tools.TOOL_DEFINITIONS.find(t => t.function.name === 'confirm_appointment');
   assert.deepStrictEqual(confirmDef.function.parameters.required, ['customer_name', 'customer_phone']);
   console.log('Verification passed!');
   "
   ```
4. Invalidation condition: If `HOLD_DURATION_MS !== 300000`, or if `confirm_appointment` rejects a booking with `MISSING_EMAIL` when name and phone are valid, the implementation is invalidated.
