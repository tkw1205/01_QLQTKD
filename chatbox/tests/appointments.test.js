'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb, query } = require('./helpers');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');

function getNextWeekday(daysAhead = 2) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) { // Skip Saturday and Sunday
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Appointment Service & API Test Suite', () => {
  const testGuestSession1 = uuidv4();
  const testGuestSession2 = uuidv4();
  const futureDate = getNextWeekday(3);

  before(async () => {
    const jsonStore = require('../src/config/jsonStore');
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => a.appointment_date !== futureDate);
    jsonStore.saveCollection('appointments', cleaned);
  });

  after(async () => {
    const jsonStore = require('../src/config/jsonStore');
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => a.appointment_date !== futureDate);
    jsonStore.saveCollection('appointments', cleaned);

    // Cleanup created test appointments
    await query('DELETE FROM appointments WHERE guest_session_id IN ($1, $2)', [
      testGuestSession1,
      testGuestSession2,
    ]).catch(() => {});
    await stopServer();
    await closeDb();
  });

  test('Logic tính toán khung giờ trống (check_available_slots) theo giờ làm việc', async () => {
    // 1. Kiểm tra từ chối ngày trong quá khứ
    await assert.rejects(
      async () => {
        await appointmentService.checkAvailableSlots('2020-01-01');
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /in the past/i);
        return true;
      }
    );

    // 2. Kiểm tra từ chối ngày không hợp lệ
    await assert.rejects(
      async () => {
        await appointmentService.checkAvailableSlots('invalid-date');
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /invalid date/i);
        return true;
      }
    );

    // 3. Kiểm tra ngày tương lai hợp lệ trả về danh sách khung giờ
    const result = await appointmentService.checkAvailableSlots(futureDate, 30);
    assert.equal(result.date, futureDate);
    assert.equal(result.duration, 30);
    assert.ok(Array.isArray(result.slots), 'Slots should be an array');
    assert.ok(result.slots.length > 0, `Should have available slots on ${futureDate}`);
    assert.match(result.slots[0], /^\d{2}:\d{2}$/, 'Slot format should be HH:MM');

    // 4. Kiểm tra endpoint GET /api/appointments/slots
    const res = await apiRequest(`/api/appointments/slots?date=${futureDate}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.slots));
  });

  test('Public appointment creation requires explicit customer confirmation', async () => {
    const response = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        customerName: 'Khách kiểm thử',
        customerPhone: '0901234567',
        appointmentDate: futureDate,
        appointmentTime: '15:00',
      },
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error || response.body.message, /must be confirmed/i);
  });

  test('Đặt lịch hẹn thành công khi đủ thông tin và có xác nhận (confirmedBySystem)', async () => {
    // Kiểm tra thiếu xác nhận (confirmedBySystem) phải bị từ chối
    await assert.rejects(
      async () => {
        await appointmentService.createAppointment({
          guestSessionId: testGuestSession1,
          customerName: 'Nguyễn Văn A',
          customerPhone: '0901234567',
          appointmentDate: futureDate,
          appointmentTime: '09:00',
          confirmedBySystem: false, // chưa xác nhận
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /must be confirmed/i);
        return true;
      }
    );

    // Kiểm tra thiếu trường bắt buộc
    await assert.rejects(
      async () => {
        await appointmentService.createAppointment({
          guestSessionId: testGuestSession1,
          confirmedBySystem: true,
          customerName: '',
          customerPhone: '0901234567',
          appointmentDate: futureDate,
          appointmentTime: '09:00',
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /missing required appointment fields/i);
        return true;
      }
    );

    // Đặt lịch thành công khi đủ thông tin và xác nhận
    const appt = await appointmentService.createAppointment({
      guestSessionId: testGuestSession1,
      customerName: 'Nguyễn Văn A',
      customerPhone: '0901234567',
      customerEmail: 'nguyenvana@example.com',
      appointmentDate: futureDate,
      appointmentTime: '09:00',
      durationMinutes: 30,
      confirmedBySystem: true,
      notes: 'Tư vấn giải pháp Chatbox AI',
    });

    assert.ok(appt.id, 'Appointment should have an ID');
    assert.equal(appt.customer_name, 'Nguyễn Văn A');
    assert.equal(appt.customer_phone, '0901234567');
    assert.equal(appt.status, 'pending');
    assert.ok(appt.confirmation_token, 'Should generate confirmation_token');
  });

  test('Chống đặt lịch trùng giờ (concurrency conflict)', async () => {
    // Thử đặt trùng đúng khung giờ 09:00 ngày futureDate vừa đặt
    await assert.rejects(
      async () => {
        await appointmentService.createAppointment({
          guestSessionId: testGuestSession2,
          customerName: 'Trần Văn B',
          customerPhone: '0987654321',
          appointmentDate: futureDate,
          appointmentTime: '09:00', // Đã bị chiếm bởi test trước
          durationMinutes: 30,
          confirmedBySystem: true,
        });
      },
      (err) => {
        assert.equal(err.status, 409, 'Conflict should return status 409');
        assert.match(err.message, /just been booked/i);
        return true;
      }
    );

    // Thử đặt khung giờ bị giao thoa (ví dụ 09:15)
    await assert.rejects(
      async () => {
        await appointmentService.createAppointment({
          guestSessionId: testGuestSession2,
          customerName: 'Lê Văn C',
          customerPhone: '0912345678',
          appointmentDate: futureDate,
          appointmentTime: '09:15', // Giao thoa với 09:00 - 09:30
          durationMinutes: 30,
          confirmedBySystem: true,
        });
      },
      (err) => {
        assert.equal(err.status, 409);
        return true;
      }
    );
  });

  test('Tra cứu lịch hẹn theo token xác nhận và kiểm tra quyền sở hữu (guest session)', async () => {
    // Tạo 1 lịch hẹn mới cho testGuestSession1
    const appt = await appointmentService.createAppointment({
      guestSessionId: testGuestSession1,
      customerName: 'Phạm Thị D',
      customerPhone: '0933333333',
      appointmentDate: futureDate,
      appointmentTime: '14:00',
      durationMinutes: 30,
      confirmedBySystem: true,
    });

    const token = appt.confirmation_token;
    assert.ok(token);

    // 1. Khách hàng chính chủ tra cứu lịch hẹn qua endpoint lookup -> Thành công 200
    const resOwner = await apiRequest(`/api/appointments/lookup/${token}`, {
      cookie: `guest_session=${testGuestSession1}`,
    });
    assert.equal(resOwner.status, 200);
    assert.equal(resOwner.body.success, true);
    assert.equal(resOwner.body.data.id, appt.id);
    assert.equal(resOwner.body.data.customer_name, 'Phạm Thị D');

    // 2. Khách vãng lai khác (sai session) tra cứu -> Bị chặn 403 Forbidden
    const resOther = await apiRequest(`/api/appointments/lookup/${token}`, {
      cookie: `guest_session=${testGuestSession2}`,
    });
    assert.equal(resOther.status, 403, 'Access denied for non-owner guest session');
    assert.equal(resOther.body.success, false);
    assert.match(resOther.body.error, /access denied/i);

    // 3. Tra cứu bằng token không tồn tại -> 404 Not Found
    const resNotFound = await apiRequest('/api/appointments/lookup/non-existent-token-123456', {
      cookie: `guest_session=${testGuestSession1}`,
    });
    assert.equal(resNotFound.status, 404);
    assert.equal(resNotFound.body.success, false);
  });
});
