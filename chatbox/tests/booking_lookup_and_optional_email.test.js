'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');

const { apiRequest, stopServer, closeDb } = require('./helpers');
const { executeTool } = require('../src/ai/tools');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const appointmentService = require('../src/services/appointmentService');
const jsonStore = require('../src/config/jsonStore');

function getFutureWeekday(daysAhead = 7) {
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

describe('Booking Flow Optional Email & Lookup Suite (CR-01, AC-17)', () => {
  const targetDate1 = getFutureWeekday(8);
  const targetDate2 = getFutureWeekday(9);
  const targetDate3 = getFutureWeekday(10);

  after(async () => {
    // Clean up created appointments on target dates
    const appointments = jsonStore.getCollection('appointments');
    const filtered = appointments.filter(
      a => a.appointment_date !== targetDate1 &&
           a.appointment_date !== targetDate2 &&
           a.appointment_date !== targetDate3
    );
    jsonStore.saveCollection('appointments', filtered);

    await stopServer();
    await closeDb();
  });

  test('1. POST /api/appointments: Đặt lịch trực tiếp khi email là null, rỗng hoặc khoảng trắng -> Thành công và lưu null (CR-01)', async () => {
    // 1.1 customerEmail: null
    const resNull = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Trần Văn Nam',
        customerPhone: '0901111222',
        customerEmail: null,
        appointmentDate: targetDate1,
        appointmentTime: '09:00',
        durationMinutes: 30,
        notes: 'Cắt tóc nam',
      },
    });

    assert.equal(resNull.status, 201);
    assert.equal(resNull.body.success, true);
    assert.equal(resNull.body.data.customer_name, 'Trần Văn Nam');
    assert.equal(resNull.body.data.customer_phone, '0901111222');
    assert.equal(resNull.body.data.customer_email, null, 'Email phải được lưu là null trong DB');
    assert.ok(resNull.body.data.booking_code, 'Phải sinh mã booking');
    assert.match(resNull.body.data.booking_code, /^BK-\d{8}-[A-Z0-9]+$/);

    // 1.2 customerEmail: "" (chuỗi rỗng)
    const resEmpty = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Lê Thị Hoa',
        customerPhone: '0902222333',
        customerEmail: '',
        appointmentDate: targetDate1,
        appointmentTime: '09:30',
        durationMinutes: 30,
      },
    });

    assert.equal(resEmpty.status, 201);
    assert.equal(resEmpty.body.success, true);
    assert.equal(resEmpty.body.data.customer_email, null, 'Chuỗi email rỗng phải được chuẩn hóa thành null');

    // 1.3 customerEmail: "   " (chỉ chứa khoảng trắng)
    const resWhitespace = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Phạm Minh Quân',
        customerPhone: '0903333444',
        customerEmail: '   ',
        appointmentDate: targetDate1,
        appointmentTime: '10:00',
        durationMinutes: 30,
      },
    });

    assert.equal(resWhitespace.status, 201);
    assert.equal(resWhitespace.body.success, true);
    assert.equal(resWhitespace.body.data.customer_email, null, 'Email khoảng trắng phải được chuẩn hóa thành null');

    // 1.4 customerEmail không hợp lệ (không phải null/rỗng nhưng sai cú pháp) -> Vẫn báo lỗi 400
    const resInvalid = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Nguyễn Văn Sai',
        customerPhone: '0904444555',
        customerEmail: 'email-sai-dinh-dang',
        appointmentDate: targetDate1,
        appointmentTime: '10:30',
      },
    });

    assert.equal(resInvalid.status, 400);
    assert.equal(resInvalid.body.success, false);
    assert.match(resInvalid.body.error, /email/i, 'Phải báo lỗi email không hợp lệ');
  });

  test('2. Luồng BPMN 2 giai đoạn (Hold & Confirm): Chốt lịch thành công khi không có email', async () => {
    const guestSession = uuidv4();

    // 2.1 Giữ chỗ tạm thời
    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        appointmentDate: targetDate2,
        appointmentTime: '14:00',
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const holdingToken = holdRes.body.data.holding_token;

    // 2.2 Chốt lịch không gửi email
    const confirmRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': guestSession },
      body: {
        holdingToken,
        customerName: 'Nguyễn Thúy Kiều',
        customerPhone: '0905555666',
        // customerEmail omitted
      },
    });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.success, true);
    assert.equal(confirmRes.body.data.status, 'confirmed');
    assert.equal(confirmRes.body.data.customer_email, null);
    assert.ok(confirmRes.body.data.booking_code);
  });

  test('3. AI Tools: confirm_appointment và create_appointment hoàn tất thành công mà không cần email', async () => {
    const context = {
      conversationId: `conv-test-optional-email-${Date.now()}`,
      guestSessionId: `guest-test-optional-email-${Date.now()}`,
    };

    // 3.1 AI hold slot
    const holdToolRes = await executeTool('hold_appointment_slot', {
      appointment_date: targetDate2,
      appointment_time: '15:00',
    }, context);
    const holdData = JSON.parse(holdToolRes);
    assert.equal(holdData.success, true);

    // 3.2 AI confirm appointment mà không truyền email
    const confirmToolRes = await executeTool('confirm_appointment', {
      holding_token: holdData.holding_token,
      customer_name: 'Đặng Thùy Trâm',
      customer_phone: '0906666777',
      // customer_email is omitted
    }, context);
    const confirmData = JSON.parse(confirmToolRes);

    assert.equal(confirmData.success, true, 'confirm_appointment không có email phải thành công');
    assert.ok(confirmData.booking_code);
    assert.equal(confirmData.customer_email, null);
    assert.equal(confirmData.status, 'confirmed');

    // 3.3 AI create appointment trực tiếp mà không truyền email
    const createToolRes = await executeTool('create_appointment', {
      customer_name: 'Bùi Thị Xuân',
      customer_phone: '0907777888',
      appointment_date: targetDate2,
      appointment_time: '16:00',
      duration_minutes: 30,
      // customer_email is omitted
    }, context);
    const createData = JSON.parse(createToolRes);

    assert.equal(createData.success, true, 'create_appointment không có email phải thành công');
    assert.ok(createData.booking_code);
    assert.equal(createData.customer_email, null);
    assert.equal(createData.status, 'pending');
  });

  test('4. Tra cứu lịch hẹn công khai bằng SĐT + Mã đặt lịch: GET /api/appointments/lookup (CR-01, AC-17)', async () => {
    // 4.1 Tạo lịch hẹn chuẩn bị dữ liệu
    const createRes = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Võ Thị Sáu',
        customerPhone: '0908888999',
        customerEmail: null,
        appointmentDate: targetDate3,
        appointmentTime: '11:00',
        durationMinutes: 30,
        notes: 'Chăm sóc tóc chuyên sâu',
      },
    });
    assert.equal(createRes.status, 201);
    const bookingCode = createRes.body.data.booking_code;
    assert.ok(bookingCode);

    // 4.2 Tra cứu với phone và bookingCode chính xác (gọi từ client mới hoàn toàn, không gửi cookie session)
    const lookupRes = await apiRequest(`/api/appointments/lookup?phone=0908888999&bookingCode=${bookingCode}`);
    assert.equal(lookupRes.status, 200);
    assert.equal(lookupRes.body.success, true);
    assert.equal(lookupRes.body.data.booking_code, bookingCode);
    assert.equal(lookupRes.body.data.customer_name, 'Võ Thị Sáu');
    assert.equal(lookupRes.body.data.customer_phone, '0908888999');
    assert.equal(lookupRes.body.data.appointment_date, targetDate3);
    assert.equal(lookupRes.body.data.appointment_time, '11:00');
    assert.equal(lookupRes.body.data.status, 'pending');

    // 4.3 Tra cứu hỗ trợ alias booking_code (snake_case)
    const lookupAliasRes = await apiRequest(`/api/appointments/lookup?phone=0908888999&booking_code=${bookingCode}`);
    assert.equal(lookupAliasRes.status, 200);
    assert.equal(lookupAliasRes.body.data.booking_code, bookingCode);

    // 4.4 Khả năng tự chuẩn hóa: Số điện thoại có dấu cách hoặc mã booking chữ thường
    const lookupNormalizedRes = await apiRequest(
      `/api/appointments/lookup?phone=090%208888%20999&bookingCode=${bookingCode.toLowerCase()}`
    );
    assert.equal(lookupNormalizedRes.status, 200);
    assert.equal(lookupNormalizedRes.body.data.booking_code, bookingCode);
  });

  test('5. Tra cứu thất bại khi sai SĐT hoặc sai Mã đặt lịch (Bảo mật thông tin khách hàng - AC-17)', async () => {
    // 5.1 Tạo lịch hẹn mẫu
    const createRes = await apiRequest('/api/appointments', {
      method: 'POST',
      body: {
        confirmedBySystem: true,
        customerName: 'Khách Tra Cứu Bảo Mật',
        customerPhone: '0909999000',
        customerEmail: null,
        appointmentDate: targetDate3,
        appointmentTime: '17:00',
      },
    });
    assert.equal(createRes.status, 201);
    const validBookingCode = createRes.body.data.booking_code;

    // 5.2 Đúng mã booking nhưng sai số điện thoại -> 404
    const wrongPhoneRes = await apiRequest(`/api/appointments/lookup?phone=0911222333&bookingCode=${validBookingCode}`);
    assert.equal(wrongPhoneRes.status, 404);
    assert.equal(wrongPhoneRes.body.success, false);

    // 5.3 Đúng số điện thoại nhưng sai mã booking -> 404
    const wrongCodeRes = await apiRequest('/api/appointments/lookup?phone=0909999000&bookingCode=BK-20261030-9999');
    assert.equal(wrongCodeRes.status, 404);
    assert.equal(wrongCodeRes.body.success, false);

    // 5.4 Thiếu tham số (chỉ truyền phone hoặc chỉ truyền code) -> 400 Bad Request
    const missingCodeRes = await apiRequest('/api/appointments/lookup?phone=0909999000');
    assert.equal(missingCodeRes.status, 400);

    const missingPhoneRes = await apiRequest(`/api/appointments/lookup?bookingCode=${validBookingCode}`);
    assert.equal(missingPhoneRes.status, 400);
  });
});
