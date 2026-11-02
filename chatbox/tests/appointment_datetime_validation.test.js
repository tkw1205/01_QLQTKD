'use strict';

const { after, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb } = require('./helpers');
const authService = require('../src/services/authService');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const jsonStore = require('../src/config/jsonStore');
const config = require('../src/config');
const createdScheduleSessions = [];
const {
  assertAppointmentIsFuture,
  getLocalDateTimeParts,
  parseAppointmentDateTime,
} = require('../src/utils/appointmentDateTime');

const createdGuestSessions = [];

function createGuestSession() {
  const guestSessionId = `appointment-datetime-${uuidv4()}`;
  createdGuestSessions.push(guestSessionId);
  return guestSessionId;
}

function createScheduledAppointment() {
  const guestSessionId = `appointment-reschedule-${uuidv4()}`;
  const appointment = {
    id: uuidv4(),
    guest_session_id: guestSessionId,
    appointment_date: '2027-06-15',
    appointment_time: '10:00',
    duration_minutes: 30,
    status: 'confirmed',
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  createdScheduleSessions.push(guestSessionId);
  const appointments = jsonStore.getCollection('appointments');
  appointments.push(appointment);
  jsonStore.saveCollection('appointments', appointments);
  return appointment;
}

function formatDate({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addCalendarDays(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day + days);
  value.setUTCHours(0, 0, 0, 0);
  return formatDate({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  });
}

async function findAvailableFutureSlot(startDaysAhead = 7) {
  const today = formatDate(getLocalDateTimeParts());
  for (let offset = startDaysAhead; offset < startDaysAhead + 60; offset++) {
    const date = addCalendarDays(today, offset);
    const slots = await appointmentRepo.findAvailableSlots(date, 30);
    const time = slots.find(slot => !hasAppointmentOverlap(date, slot, 30));
    if (time) return { date, time };
  }
  throw new Error('Unable to find an available future appointment slot for tests');
}

function hasAppointmentOverlap(date, time, duration, staffId = null) {
  const start = time.split(':').map(Number).reduce((hours, value) => hours * 60 + value, 0);
  const appointments = jsonStore.getCollection('appointments');
  return appointments.some(appt => {
    if (
      appt.appointment_date !== date ||
      appt.status === 'cancelled' ||
      (staffId && appt.staff_id !== staffId) ||
      (appt.status === 'holding' && appt.hold_expires_at &&
        new Date(appt.hold_expires_at).getTime() <= Date.now())
    ) {
      return false;
    }

    const [hour, minute] = appt.appointment_time.split(':').map(Number);
    const existingStart = hour * 60 + minute;
    const existingEnd = existingStart + (Number(appt.duration_minutes) || 30);
    return start < existingEnd && start + duration > existingStart;
  });
}

async function findAvailableStaffSlot(date) {
  const users = jsonStore.getCollection('users').filter(user =>
    user.is_active !== false &&
    user.is_available !== false &&
    ['staff', 'admin', 'receptionist'].includes(user.role)
  );
  const slots = await appointmentRepo.findAvailableSlots(date, 30);
  for (const time of slots) {
    const staff = users.find(user => !hasAppointmentOverlap(date, time, 30, user.id));
    if (staff) return { date, time, staff };
  }
  return null;
}

async function findAvailableFutureStaffSlot(startDaysAhead = 7) {
  const today = formatDate(getLocalDateTimeParts());
  for (let offset = startDaysAhead; offset < startDaysAhead + 60; offset++) {
    const date = addCalendarDays(today, offset);
    const slot = await findAvailableStaffSlot(date);
    if (slot) return slot;
  }
  throw new Error('Unable to find a future appointment slot with an available staff member');
}

async function postAppointment(date, time, guestSessionId = createGuestSession()) {
  return apiRequest('/api/appointments', {
    method: 'POST',
    headers: { 'x-guest-session': guestSessionId },
    body: {
      customerName: 'Khách kiểm tra ngày giờ',
      customerPhone: '0901234567',
      appointmentDate: date,
      appointmentTime: time,
      durationMinutes: 30,
    },
  });
}

test('Appointment adjustment modal displays the stored date and submits the selected date', () => {
  const staffPage = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'staff.html'),
    'utf8'
  );

  assert.match(
    staffPage,
    /<input type="date" id="modal-input-date"[^>]*value="\$\{escapeHtml\(appt\.appointment_date \|\| ''\)\}"/
  );
  assert.match(staffPage, /appointmentDate:\s*selectedDate/);
  assert.match(staffPage, /res\.data\.appointment_date !== scheduleDateInput\.value/);
  assert.match(staffPage, /await loadScheduleData\(\);/);
});

async function putAssignment(appointmentId, body) {
  const { token } = await authService.login('admin@example.com', 'Admin@123456');
  return apiRequest(`/api/appointments/${appointmentId}/assign`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

async function withMockedNow(timestamp, callback) {
  const originalNow = Date.now;
  Date.now = () => timestamp;
  try {
    return await callback();
  } finally {
    Date.now = originalNow;
  }
}

describe('Appointment date and time validation', () => {
  after(async () => {
    const appointments = jsonStore.getCollection('appointments');
    jsonStore.saveCollection(
      'appointments',
      appointments.filter(appt =>
        !createdGuestSessions.includes(appt.guest_session_id) &&
        !createdScheduleSessions.includes(appt.guest_session_id)
      )
    );
    await stopServer();
    await closeDb();
  });

  test('Rejects assigning an appointment on a past date through the backend API', async () => {
    const appointment = createScheduledAppointment();
    const staff = jsonStore.getCollection('users')
      .find(user => user.role === 'staff' && user.is_active !== false);
    assert.ok(staff, 'An active staff member is required for this test');

    const response = await putAssignment(appointment.id, {
      staffId: staff.id,
      appointmentDate: '2020-01-01',
      appointmentTime: '10:00',
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'APPOINTMENT_IN_PAST');
    assert.equal(response.body.error, 'Thời gian đặt lịch đã qua. Vui lòng chọn thời gian khác.');
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, '2027-06-15');
    assert.equal(savedAppointment.appointment_time, '10:00');
    assert.equal(savedAppointment.staff_id, undefined);
  });

  test('Rejects assigning an appointment at the current local time through the backend API', async () => {
    const appointment = createScheduledAppointment();
    const staff = jsonStore.getCollection('users')
      .find(user => user.role === 'staff' && user.is_active !== false);
    assert.ok(staff, 'An active staff member is required for this test');
    const now = getLocalDateTimeParts();

    const response = await putAssignment(appointment.id, {
      staffId: staff.id,
      appointmentDate: formatDate(now),
      appointmentTime: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'APPOINTMENT_IN_PAST');
    assert.equal(response.body.error, 'Thời gian đặt lịch đã qua. Vui lòng chọn thời gian khác.');
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, '2027-06-15');
    assert.equal(savedAppointment.appointment_time, '10:00');
    assert.equal(savedAppointment.staff_id, undefined);
  });

  test('Allows a future date and time when reassigning a staff member', async () => {
    const appointment = createScheduledAppointment();
    const slot = await findAvailableFutureStaffSlot();

    const response = await putAssignment(appointment.id, {
      staffId: slot.staff.id,
      appointmentDate: slot.date,
      appointmentTime: slot.time,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.appointment_date, slot.date);
    assert.equal(response.body.data.appointment_time, slot.time);
    assert.equal(response.body.data.staff_id, slot.staff.id);
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, slot.date);
  });

  test('Updates only the appointment date through the API and preserves the start time', async () => {
    const appointment = createScheduledAppointment();
    const slot = await findAvailableFutureStaffSlot();
    appointment.staff_id = slot.staff.id;
    appointment.staff_name = slot.staff.name;
    appointment.appointment_time = slot.time;
    jsonStore.saveCollection('appointments', jsonStore.getCollection('appointments'));

    const response = await putAssignment(appointment.id, {
      staffId: slot.staff.id,
      appointmentDate: slot.date,
      appointmentTime: slot.time,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.appointment_date, slot.date);
    assert.equal(response.body.data.appointment_time, slot.time);
    const lastChange = response.body.data.history[response.body.data.history.length - 1];
    assert.equal(lastChange.old_date, '2027-06-15');
    assert.equal(lastChange.new_date, slot.date);
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, slot.date);
    assert.equal(savedAppointment.appointment_time, slot.time);

    const { token } = await authService.login('admin@example.com', 'Admin@123456');
    const reloadResponse = await apiRequest(`/api/appointments?date=${slot.date}&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(reloadResponse.status, 200);
    assert.ok(reloadResponse.body.data.some(item => item.id === appointment.id));
  });

  test('Updates the appointment date and staff together through the API', async () => {
    const appointment = createScheduledAppointment();
    const slot = await findAvailableFutureStaffSlot();

    const response = await putAssignment(appointment.id, {
      staffId: slot.staff.id,
      appointmentDate: slot.date,
      appointmentTime: slot.time,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.appointment_date, slot.date);
    assert.equal(response.body.data.staff_id, slot.staff.id);
    const lastChange = response.body.data.history[response.body.data.history.length - 1];
    assert.equal(lastChange.new_date, slot.date);
    assert.equal(lastChange.new_staff_id, slot.staff.id);
  });

  test('Allows changing an appointment to a future time today through the API', async () => {
    const appointment = createScheduledAppointment();
    const today = formatDate(getLocalDateTimeParts());
    const simulatedNow = parseAppointmentDateTime(today, '08:00', config.timezone).getTime();

    await withMockedNow(simulatedNow, async () => {
      const slot = await findAvailableStaffSlot(today);
      assert.ok(slot, 'An available staff slot is required for today');

      const response = await putAssignment(appointment.id, {
        staffId: slot.staff.id,
        appointmentDate: today,
        appointmentTime: slot.time,
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.appointment_date, today);
      assert.equal(response.body.data.appointment_time, slot.time);
    });
  });

  test('Does not create an update or audit entry when assignment values are unchanged', async () => {
    const appointment = createScheduledAppointment();

    const response = await putAssignment(appointment.id, {
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.history.length, 0);
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, appointment.appointment_date);
    assert.equal(savedAppointment.appointment_time, appointment.appointment_time);
  });

  test('Rejects reassigning a staff member who already has an overlapping appointment', async () => {
    const appointment = createScheduledAppointment();
    const slot = await findAvailableFutureStaffSlot();
    const blocker = createScheduledAppointment();
    blocker.appointment_date = slot.date;
    blocker.appointment_time = slot.time;
    blocker.staff_id = slot.staff.id;
    blocker.status = 'confirmed';
    const appointments = jsonStore.getCollection('appointments');
    jsonStore.saveCollection('appointments', appointments);

    const response = await putAssignment(appointment.id, {
      staffId: slot.staff.id,
      appointmentDate: slot.date,
      appointmentTime: slot.time,
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'STAFF_TIME_CONFLICT');
    const savedAppointment = await appointmentRepo.findById(appointment.id);
    assert.equal(savedAppointment.appointment_date, '2027-06-15');
    assert.equal(savedAppointment.appointment_time, '10:00');
    assert.equal(savedAppointment.staff_id, undefined);
  });

  test('Uses UTC+7 when converting appointment date and time to an instant', () => {
    const appointmentDateTime = parseAppointmentDateTime('2026-11-03', '00:30');

    assert.equal(config.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(appointmentDateTime.toISOString(), '2026-11-02T17:30:00.000Z');
  });

  test('Rejects an appointment on a past date', async () => {
    await assert.rejects(
      appointmentService.createAppointment({
        confirmedBySystem: true,
        customerName: 'Khách kiểm tra ngày quá khứ',
        customerPhone: '0901234567',
        appointmentDate: '2020-01-01',
        appointmentTime: '10:00',
      }),
      error => error.status === 400 && error.code === 'APPOINTMENT_IN_PAST'
    );
  });

  test('Rejects a time earlier than now on the current date', async () => {
    const appointmentDate = '2026-10-31';
    const now = parseAppointmentDateTime(appointmentDate, '20:48', config.timezone).getTime();

    await withMockedNow(now, async () => {
      await assert.rejects(
        appointmentService.createAppointment({
          confirmedBySystem: true,
          customerName: 'Khách kiểm tra giờ đã qua',
          customerPhone: '0901234567',
          appointmentDate,
          appointmentTime: '10:00',
        }),
        error => error.status === 400 && error.code === 'APPOINTMENT_IN_PAST'
      );
    });
  });

  test('Rejects an appointment exactly at the current date and time through the API', async () => {
    const appointmentDate = '2026-10-31';
    const now = parseAppointmentDateTime(appointmentDate, '20:48', config.timezone).getTime();
    let response;

    await withMockedNow(now, async () => {
      response = await postAppointment(appointmentDate, '20:48');
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'APPOINTMENT_IN_PAST');
  });

  test('Treats 21:00 as future when the current local time is 20:48', () => {
    const appointmentDate = '2026-10-31';
    const now = parseAppointmentDateTime(appointmentDate, '20:48', config.timezone).getTime();
    const appointmentDateTime = assertAppointmentIsFuture(
      appointmentDate,
      '21:00',
      now,
      config.timezone
    );

    assert.ok(appointmentDateTime.getTime() > now);
  });

  test('Allows a future date and time to continue through the API booking validations', async () => {
    const { date, time } = await findAvailableFutureSlot();
    assert.ok(parseAppointmentDateTime(date, time, config.timezone).getTime() > Date.now());

    const response = await postAppointment(date, time);

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.appointment_date, date);
    assert.equal(response.body.data.appointment_time, time);
  });

  test('Rejects an appointment outside business hours', async () => {
    const { date } = await findAvailableFutureSlot();
    const response = await postAppointment(date, '07:00');

    assert.equal(response.status, 400);
    assert.match(response.body.error, /outside salon opening hours|giờ hoạt động|giờ mở cửa/i);
  });

  test('Rejects an appointment that conflicts with an existing booking', async () => {
    const { date, time } = await findAvailableFutureSlot(14);
    const firstResponse = await postAppointment(date, time);
    assert.equal(firstResponse.status, 201);

    const conflictResponse = await postAppointment(date, time);

    assert.equal(conflictResponse.status, 409);
    assert.match(conflictResponse.body.error, /booked|conflict|trùng/i);
  });

  test('Rejects past date and time submitted directly to the backend API', async () => {
    const response = await postAppointment('2020-01-01', '10:00');

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, 'APPOINTMENT_IN_PAST');
  });

  test('Rejects a past date submitted to the hold API without persisting a hold', async () => {
    const guestSessionId = createGuestSession();
    const response = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSessionId },
      body: {
        appointmentDate: '2020-01-01',
        appointmentTime: '10:00',
      },
    });

    const savedHolds = jsonStore.getCollection('appointments')
      .filter(appt => appt.guest_session_id === guestSessionId);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'APPOINTMENT_IN_PAST');
    assert.equal(savedHolds.length, 0);
  });

  test('Does not confirm a held slot after its appointment time has passed', async () => {
    const { date, time } = await findAvailableFutureSlot(21);
    const guestSessionId = createGuestSession();
    const appointmentTime = parseAppointmentDateTime(date, time, config.timezone).getTime();
    let hold;

    await withMockedNow(appointmentTime - 60_000, async () => {
      hold = await appointmentService.holdSlot({
        guestSessionId,
        appointmentDate: date,
        appointmentTime: time,
      });
    });

    await withMockedNow(appointmentTime, async () => {
      await assert.rejects(
        appointmentService.confirmHoldingSlot({
          holdingToken: hold.holding_token,
          customerName: 'Khách kiểm tra giữ chỗ hết giờ',
          customerPhone: '0901234567',
          guestSessionId,
        }),
        error => error.status === 400 && error.code === 'APPOINTMENT_IN_PAST'
      );
    });

    const savedHold = jsonStore.getCollection('appointments')
      .find(appt => appt.holding_token === hold.holding_token);
    assert.equal(savedHold.status, 'holding');
    assert.equal(savedHold.customer_name, null);
    assert.equal(savedHold.booking_code, null);
  });

  test('Rejects rescheduling to a past date without modifying the appointment', async () => {
    const appointment = createScheduledAppointment();

    await assert.rejects(
      appointmentRepo.reschedule(appointment.id, {
        appointmentDate: '2020-01-01',
        appointmentTime: '10:00',
      }),
      error => error.status === 400 && error.code === 'APPOINTMENT_IN_PAST'
    );

    const savedAppointment = jsonStore.getCollection('appointments')
      .find(appt => appt.id === appointment.id);
    assert.equal(savedAppointment.appointment_date, '2027-06-15');
    assert.equal(savedAppointment.appointment_time, '10:00');
    assert.deepEqual(savedAppointment.history, []);
  });

  test('Rejects assigning a staff member at a past time today without modifying the appointment', async () => {
    const appointment = createScheduledAppointment();
    const staff = jsonStore.getCollection('users')
      .find(user => user.role === 'staff' && user.is_active !== false);
    assert.ok(staff, 'An active staff member is required for this test');

    const appointmentDate = '2026-10-31';
    const now = parseAppointmentDateTime(appointmentDate, '20:48', config.timezone).getTime();
    await withMockedNow(now, async () => {
      await assert.rejects(
        appointmentRepo.reassignStaff(appointment.id, {
          newStaffId: staff.id,
          appointmentDate,
          appointmentTime: '20:48',
          changedBy: 'Test',
        }),
        error =>
          error.status === 400 &&
          error.code === 'APPOINTMENT_IN_PAST' &&
          error.message === 'Thời gian đặt lịch đã qua. Vui lòng chọn thời gian khác.'
      );
    });

    const savedAppointment = jsonStore.getCollection('appointments')
      .find(appt => appt.id === appointment.id);
    assert.equal(savedAppointment.appointment_date, '2027-06-15');
    assert.equal(savedAppointment.appointment_time, '10:00');
    assert.equal(savedAppointment.staff_id, undefined);
    assert.deepEqual(savedAppointment.history, []);
  });

  test('Does not persist an appointment when date/time validation fails', async () => {
    const guestSessionId = createGuestSession();
    const beforeCount = jsonStore.getCollection('appointments')
      .filter(appt => appt.guest_session_id === guestSessionId).length;

    const response = await postAppointment('2020-01-01', '10:00', guestSessionId);

    const afterCount = jsonStore.getCollection('appointments')
      .filter(appt => appt.guest_session_id === guestSessionId).length;
    assert.equal(response.status, 400);
    assert.equal(afterCount, beforeCount);
  });
});
