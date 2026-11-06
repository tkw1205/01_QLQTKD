'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');

const { apiRequest, startServer, stopServer, closeDb } = require('./helpers');
const { executeTool } = require('../src/ai/tools');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const appointmentService = require('../src/services/appointmentService');
const jsonStore = require('../src/config/jsonStore');

function getFutureWeekday(daysAhead = 14) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Adversarial Stress Test Suite: CR-01, CR-02, CR-03', () => {
  const stressDate1 = getFutureWeekday(15);
  const stressDate2 = getFutureWeekday(16);
  const stressDate3 = getFutureWeekday(17);
  const stressDate4 = getFutureWeekday(18);

  before(async () => {
    const appointments = jsonStore.getCollection('appointments');
    const testDates = new Set([stressDate1, stressDate2, stressDate3, stressDate4]);
    jsonStore.saveCollection(
      'appointments',
      appointments.filter(appointment => !testDates.has(appointment.appointment_date))
    );
    await startServer();
  });

  after(async () => {
    // Clean up created appointments on stress test dates
    const appointments = jsonStore.getCollection('appointments');
    const filtered = appointments.filter(
      a => a.appointment_date !== stressDate1 &&
           a.appointment_date !== stressDate2 &&
           a.appointment_date !== stressDate3 &&
           a.appointment_date !== stressDate4
    );
    jsonStore.saveCollection('appointments', filtered);

    await stopServer();
    await closeDb();
  });

  // =========================================================================
  // 1. CONCURRENT BOOKING ATTEMPTS ON REMAINING SLOT CAPACITY (AC-03)
  // =========================================================================

  test('1.1 Concurrency Stress: 10 simultaneous requests to hold the same slot -> Exactly 1 succeeds, 9 fail with 409', async () => {
    const timeSlot = '09:00';
    const concurrency = 10;

    const promises = Array.from({ length: concurrency }, (_, i) => {
      const guestSession = `guest-concurrent-hold-${i}-${Date.now()}`;
      return apiRequest('/api/appointments/hold', {
        method: 'POST',
        headers: { 'x-guest-session': guestSession },
        body: {
          appointmentDate: stressDate1,
          appointmentTime: timeSlot,
          durationMinutes: 30,
        },
      });
    });

    const results = await Promise.all(promises);

    const succeeded = results.filter(r => r.status === 201);
    const conflicted = results.filter(r => r.status === 409);

    assert.equal(succeeded.length, 1, `Expected exactly 1 success, got ${succeeded.length}`);
    assert.equal(conflicted.length, concurrency - 1, `Expected ${concurrency - 1} conflicts, got ${conflicted.length}`);

    // Verify database state: only 1 active holding appointment exists for this slot
    const appointments = jsonStore.getCollection('appointments');
    const matched = appointments.filter(
      a => a.appointment_date === stressDate1 &&
           a.appointment_time === timeSlot &&
           a.status === 'holding'
    );
    assert.equal(matched.length, 1, 'Only 1 active holding slot must exist in DB');
  });

  test('1.2 Concurrency Stress: 10 simultaneous direct booking requests for the same slot -> Exactly 1 succeeds, 9 fail with 409', async () => {
    const timeSlot = '09:30';
    const concurrency = 10;

    const promises = Array.from({ length: concurrency }, (_, i) => {
      return apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: `Concurrent User ${i}`,
          confirmedBySystem: true,
          customerPhone: `090111122${i}`,
          customerEmail: null,
          appointmentDate: stressDate1,
          appointmentTime: timeSlot,
          durationMinutes: 30,
        },
      });
    });

    const results = await Promise.all(promises);

    const succeeded = results.filter(r => r.status === 201);
    const conflicted = results.filter(r => r.status === 409);

    assert.equal(succeeded.length, 1, `Expected exactly 1 booking to succeed, got ${succeeded.length}`);
    assert.equal(conflicted.length, concurrency - 1, `Expected ${concurrency - 1} conflicts, got ${conflicted.length}`);

    const appointments = jsonStore.getCollection('appointments');
    const matched = appointments.filter(
      a => a.appointment_date === stressDate1 &&
           a.appointment_time === timeSlot &&
           a.status === 'pending'
    );
    assert.equal(matched.length, 1, 'Only 1 pending appointment must exist in DB');
  });

  test('1.3 Concurrency Stress: Slot held by Client A -> 10 simultaneous direct & hold attempts by others all fail with 409', async () => {
    const timeSlot = '10:00';
    const sessionA = uuidv4();

    // Step 1: Client A holds the slot
    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': sessionA },
      body: {
        appointmentDate: stressDate1,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);

    // Step 2: 5 direct booking requests + 5 hold requests fired concurrently
    const promises = [
      ...Array.from({ length: 5 }, (_, i) =>
        apiRequest('/api/appointments', {
          method: 'POST',
          headers: { 'x-guest-session': uuidv4() },
          body: {
            customerName: `Interloper Direct ${i}`,
            confirmedBySystem: true,
            customerPhone: `090222233${i}`,
            appointmentDate: stressDate1,
            appointmentTime: timeSlot,
            durationMinutes: 30,
          },
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        apiRequest('/api/appointments/hold', {
          method: 'POST',
          headers: { 'x-guest-session': uuidv4() },
          body: {
            appointmentDate: stressDate1,
            appointmentTime: timeSlot,
            durationMinutes: 30,
          },
        })
      ),
    ];

    const results = await Promise.all(promises);
    const allRejected = results.every(r => r.status === 409);
    assert.ok(allRejected, 'All 10 interloping requests must receive 409 SLOT_CONFLICT');
  });

  test('1.4 Concurrency Stress: Concurrent confirmation of the same holding token is idempotent', async () => {
    const timeSlot = '10:30';
    const sessionClient = uuidv4();

    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': sessionClient },
      body: {
        appointmentDate: stressDate1,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const holdingToken = holdRes.body.data.holding_token;

    // Simulate double click / multi-tab submission from the same guest session
    const promises = Array.from({ length: 5 }, () =>
      apiRequest('/api/appointments/confirm-hold', {
        method: 'POST',
        headers: { 'x-guest-session': sessionClient },
        body: {
          holdingToken,
          customerName: 'Khách Đặt Trùng Click',
          customerPhone: '0903333444',
          customerEmail: null,
        },
      })
    );

    const results = await Promise.all(promises);
    assert.ok(results.every(r => r.status === 200), 'All concurrent confirmations on same token from same session must return 200');

    // Booking code must be identical across all responses
    const bookingCodes = new Set(results.map(r => r.body.data.booking_code));
    assert.equal(bookingCodes.size, 1, 'Idempotent confirmations must share the same booking code');
  });

  test('1.5 Session Isolation: Attempting to confirm hold from a different guest session is rejected with 403', async () => {
    const timeSlot = '11:00';
    const originalSession = uuidv4();
    const maliciousSession = uuidv4();

    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': originalSession },
      body: {
        appointmentDate: stressDate1,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const holdingToken = holdRes.body.data.holding_token;

    const stealRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': maliciousSession },
      body: {
        holdingToken,
        customerName: 'Kẻ Trộm Slot',
        customerPhone: '0903999888',
      },
    });

    assert.equal(stealRes.status, 403, 'Cross-session confirm attempt must be rejected with 403');
  });

  // =========================================================================
  // 2. TTL EXPIRATION RACE CONDITION AT EXACTLY 5M (300,001 MS)
  // =========================================================================

  test('2.1 TTL Boundary: Confirmation at 299,999 ms (< 5m) succeeds', async () => {
    const timeSlot = '14:00';
    const guestSession = uuidv4();

    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        appointmentDate: stressDate2,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const holdingToken = holdRes.body.data.holding_token;

    // Set hold_expires_at to 1 second in the future (unexpired)
    const appointments = jsonStore.getCollection('appointments');
    const appt = appointments.find(a => a.holding_token === holdingToken);
    appt.hold_expires_at = new Date(Date.now() + 1000).toISOString();
    jsonStore.saveCollection('appointments', appointments);

    const confirmRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        holdingToken,
        customerName: 'Khách Gần Hết Hạn',
        customerPhone: '0904444555',
      },
    });

    assert.equal(confirmRes.status, 200, 'Confirmation before expiry must succeed');
    assert.equal(confirmRes.body.data.status, 'confirmed');
  });

  test('2.2 TTL Expiration Verification: Confirmation at 300,001 ms returns 410 HOLD_EXPIRED with preservedData', async () => {
    const timeSlot = '14:30';
    const guestSession = uuidv4();

    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        appointmentDate: stressDate2,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const holdingToken = holdRes.body.data.holding_token;

    // Simulate hold created 300,001 ms ago (hold_expires_at was 1 ms in the past)
    const appointments = jsonStore.getCollection('appointments');
    const appt = appointments.find(a => a.holding_token === holdingToken);
    appt.created_at = new Date(Date.now() - 300001).toISOString();
    appt.hold_expires_at = new Date(Date.now() - 1).toISOString(); // Expired 1ms ago
    jsonStore.saveCollection('appointments', appointments);

    const confirmRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        holdingToken,
        customerName: 'Khách Hết Hạn 300001ms',
        customerPhone: '0905555666',
      },
    });

    // Remediated verification:
    // Specification: status 410, code 'HOLD_EXPIRED', with preservedData
    assert.equal(confirmRes.status, 410, 'Expired hold confirmation must return 410 Gone');
    assert.equal(confirmRes.body.code, 'HOLD_EXPIRED');
    assert.equal(confirmRes.body.error, 'The temporary hold has expired. Please select a time slot again.');
    assert.ok(confirmRes.body.preservedData, 'preservedData must be returned');
    assert.equal(confirmRes.body.preservedData.customerPhone, '0905555666');

    // DB status was cancelled
    const reloaded = jsonStore.getCollection('appointments').find(a => a.holding_token === holdingToken);
    assert.equal(reloaded.status, 'cancelled');
  });

  test('2.3 TTL Capacity Liberation: At 300,001 ms expired hold frees slot and allows another customer to re-book', async () => {
    const timeSlot = '15:00';
    const sessionA = uuidv4();
    const sessionB = uuidv4();

    // Client A holds slot
    const holdA = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': sessionA },
      body: {
        appointmentDate: stressDate2,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });
    assert.equal(holdA.status, 201);
    const holdingTokenA = holdA.body.data.holding_token;

    // Fast-forward Client A hold past 300,001 ms
    const appointments = jsonStore.getCollection('appointments');
    const apptA = appointments.find(a => a.holding_token === holdingTokenA);
    apptA.hold_expires_at = new Date(Date.now() - 10).toISOString();
    jsonStore.saveCollection('appointments', appointments);

    // Client B attempts to hold the same slot
    const holdB = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': sessionB },
      body: {
        appointmentDate: stressDate2,
        appointmentTime: timeSlot,
        durationMinutes: 30,
      },
    });

    assert.equal(holdB.status, 201, 'Client B must successfully hold slot freed by expired TTL');
    assert.notEqual(holdB.body.data.holding_token, holdingTokenA);

    // Client B confirms hold -> 200 Success
    const confirmB = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': sessionB },
      body: {
        holdingToken: holdB.body.data.holding_token,
        customerName: 'Khách B Nhanh Tay',
        customerPhone: '0907777888',
      },
    });
    assert.equal(confirmB.status, 200);
    assert.equal(confirmB.body.data.status, 'confirmed');
  });

  // =========================================================================
  // 3. OPTIONAL EMAIL EDGE CASES & INJECTION RESILIENCE (CR-01)
  // =========================================================================

  test('3.1 Optional Email Variations: null, "", "   ", omitted all normalize to null', async () => {
    const variations = [
      { email: null, label: 'null' },
      { email: '', label: 'empty string' },
      { email: '   ', label: 'whitespace' },
      { email: undefined, label: 'omitted' },
    ];

    let startMinute = 0;
    for (const v of variations) {
      const timeStr = `16:${String(startMinute).padStart(2, '0')}`;
      startMinute += 10;

      const body = {
        customerName: `Khách Email ${v.label}`,
        confirmedBySystem: true,
        customerPhone: '0908888111',
        appointmentDate: stressDate3,
        appointmentTime: timeStr,
        durationMinutes: 10,
      };
      if (v.email !== undefined) {
        body.customerEmail = v.email;
      }

      const res = await apiRequest('/api/appointments', {
        method: 'POST',
        body,
      });

      assert.equal(res.status, 201, `Failed for variation: ${v.label}`);
      assert.equal(res.body.data.customer_email, null, `customer_email must be null for ${v.label}`);
    }
  });

  test('3.2 Email Validation: Valid complex emails are accepted', async () => {
    const validEmails = [
      'user.name+tag@example.co.uk',
      'salon_client-123@sub.domain.vn',
      'contact@salonlumiere.com',
    ];

    let minute = 40;
    for (const email of validEmails) {
      const timeStr = `16:${minute}`;
      minute += 5;

      const res = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: 'Khách Email Chuẩn',
          confirmedBySystem: true,
          customerPhone: '0908888222',
          customerEmail: email,
          appointmentDate: stressDate3,
          appointmentTime: timeStr,
          durationMinutes: 5,
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.customer_email, email);
    }
  });

  test('3.3 Email Validation: Malformed and hostile email strings are rejected with 400 Bad Request', async () => {
    const invalidEmails = [
      'not-an-email',
      'user@',
      '@domain.com',
      'user@domain',
      'user @domain.com',
      '<script>alert(1)</script>',
      "' OR '1'='1",
    ];

    for (const email of invalidEmails) {
      const res = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: 'Khách Email Lỗi',
          confirmedBySystem: true,
          customerPhone: '0908888333',
          customerEmail: email,
          appointmentDate: stressDate3,
          appointmentTime: '17:00',
          durationMinutes: 30,
        },
      });

      assert.equal(res.status, 400, `Expected 400 for invalid email: "${email}", got ${res.status}`);
      assert.match(res.body.error, /email/i, `Expected error message to mention email for: "${email}"`);
    }
  });

  test('3.4 Email Type Resilience: Non-string values (numbers, booleans, arrays) do not crash server with 500', async () => {
    const nonStringTypes = [
      12345,
      true,
      false,
      { malicious: 'object' },
      ['array@domain.com'],
    ];

    let minute = 0;
    for (const badVal of nonStringTypes) {
      const timeStr = `08:${String(minute).padStart(2, '0')}`;
      minute += 10;

      const res = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: 'Khách Type Coercion',
          confirmedBySystem: true,
          customerPhone: '0908888444',
          customerEmail: badVal,
          appointmentDate: stressDate4,
          appointmentTime: timeStr,
          durationMinutes: 10,
        },
      });

      // Must not crash or return 500. Either safely normalized or 400 rejected
      assert.notEqual(res.status, 500, `Server crashed with 500 for bad type: ${JSON.stringify(badVal)}`);
      assert.ok([201, 400].includes(res.status), `Expected 201 or 400, got ${res.status}`);
    }
  });

  // =========================================================================
  // 4. EDGE CASES IN LOOKUP API (CR-01, AC-17)
  // =========================================================================

  test('4.1 Lookup API: Missing parameters return 400 Bad Request', async () => {
    // No params
    const r1 = await apiRequest('/api/appointments/lookup');
    assert.equal(r1.status, 400);

    // Only phone
    const r2 = await apiRequest('/api/appointments/lookup?phone=0901234567');
    assert.equal(r2.status, 400);

    // Only bookingCode
    const r3 = await apiRequest('/api/appointments/lookup?bookingCode=BK-20261125-ABCD');
    assert.equal(r3.status, 400);

    // Empty query strings
    const r4 = await apiRequest('/api/appointments/lookup?phone=&bookingCode=');
    assert.equal(r4.status, 400);

    // Whitespace strings
    const r5 = await apiRequest('/api/appointments/lookup?phone=%20%20&bookingCode=%20%20');
    assert.equal(r5.status, 400);
  });

  test('4.2 Lookup API: Nonexistent phone or booking code returns 404 Not Found without leaking data', async () => {
    // Prepare valid appointment
    const created = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        customerName: 'Khách Lookup Bảo Mật',
        confirmedBySystem: true,
        customerPhone: '0909999111',
        customerEmail: null,
        appointmentDate: stressDate4,
        appointmentTime: '11:00',
        durationMinutes: 30,
      },
    });
    assert.equal(created.status, 201);
    const validCode = created.body.data.booking_code;

    // Case A: Right code, wrong phone
    const resA = await apiRequest(`/api/appointments/lookup?phone=0909999999&bookingCode=${validCode}`);
    assert.equal(resA.status, 404);
    assert.equal(resA.body.success, false);

    // Case B: Right phone, wrong code
    const resB = await apiRequest('/api/appointments/lookup?phone=0909999111&bookingCode=BK-99999999-XXXX');
    assert.equal(resB.status, 404);

    // Case C: Both nonexistent
    const resC = await apiRequest('/api/appointments/lookup?phone=0912000000&bookingCode=BK-00000000-0000');
    assert.equal(resC.status, 404);
  });

  test('4.3 Lookup API: Malformed, special chars, SQL-injection and long strings do not crash server', async () => {
    const maliciousCases = [
      { phone: '0909999111', code: "BK-'; DROP TABLE appointments;--" },
      { phone: '0909999111', code: 'BK-<script>alert("xss")</script>' },
      { phone: '0909999111', code: 'BK-$$$%%%@@@' },
      { phone: '<script>alert(1)</script>', code: 'BK-20261125-ABCD' },
      { phone: '0909999111', code: 'A'.repeat(5000) }, // Buffer stress
    ];

    for (const c of maliciousCases) {
      const res = await apiRequest(
        `/api/appointments/lookup?phone=${encodeURIComponent(c.phone)}&bookingCode=${encodeURIComponent(c.code)}`
      );
      assert.notEqual(res.status, 500, `Server crashed (500) on input: phone=${c.phone}, code=${c.code}`);
      assert.ok([400, 404].includes(res.status), `Expected 400 or 404, got ${res.status}`);
    }
  });

  test('4.4 Lookup API: Phone format normalization (+84, dashes, spaces) successfully matches', async () => {
    const created = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        customerName: 'Khách Normalization Phone',
        confirmedBySystem: true,
        customerPhone: '0909999222',
        customerEmail: null,
        appointmentDate: stressDate4,
        appointmentTime: '11:30',
        durationMinutes: 30,
      },
    });
    assert.equal(created.status, 201);
    const code = created.body.data.booking_code;

    // Lookup with +84 country code
    const resPlus84 = await apiRequest(`/api/appointments/lookup?phone=%2B84909999222&bookingCode=${code}`);
    assert.equal(resPlus84.status, 200, 'Must match +84 format');
    assert.equal(resPlus84.body.data.booking_code, code);

    // Lookup with dashes: 090-999-9222
    const resDashes = await apiRequest(`/api/appointments/lookup?phone=090-999-9222&bookingCode=${code}`);
    assert.equal(resDashes.status, 200, 'Must match dashes format');

    // Lookup with spaces: 090 999 9222
    const resSpaces = await apiRequest(`/api/appointments/lookup?phone=090%20999%209222&bookingCode=${code}`);
    assert.equal(resSpaces.status, 200, 'Must match spaces format');
  });

  // =========================================================================
  // 5. HOLDING MESSAGE SPECIFICATION VERIFICATION (CR-02, CR-03c)
  // =========================================================================

  test('5.1 Holding slot response does not disclose internal hold duration', async () => {
    const availableSlots = await appointmentService.checkAvailableSlots(stressDate4, 30);
    assert.ok(availableSlots.slots.length, 'Test date should have an available slot');
    const res = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      body: {
        appointmentDate: stressDate4,
        appointmentTime: availableSlots.slots[0],
        durationMinutes: 30,
      },
    });

    assert.equal(res.status, 201);
    assert.doesNotMatch(res.body.message, /\b(?:5|10)\s*phút\b/iu);
  });
});
