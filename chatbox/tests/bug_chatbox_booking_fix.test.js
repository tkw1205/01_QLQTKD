'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/app');
const { executeTool, extractDateFromText, extractDateFromUserAndHistory, detectAvailableSlotsQuery } = require('../src/ai/tools');
const orchestrator = require('../src/ai/orchestrator');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('COMPREHENSIVE TEST SUITE: Bug Chatbox Booking Fix & Verification', () => {
  const targetDate = '2026-11-02';
  const targetTime = '11:00';
  const customerName = 'Nguyễn Văn Thừa';
  const customerPhone = '0987654321';
  const customerEmail = 'nguyenvanthua@example.com';
  const testGuestSession = 'guest-session-test-e2e-001';
  const testConvId = 'conv-test-e2e-001';

  let server;
  let serverUrl;
  let adminToken;
  let originalAppointments = [];

  before(async () => {
    originalAppointments = JSON.parse(JSON.stringify(jsonStore.getCollection('appointments')));

    // Clean up test appointments for idempotency
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a =>
      a.customer_phone !== customerPhone &&
      a.customer_name !== customerName &&
      !(a.appointment_date === targetDate && a.appointment_time === targetTime)
    );
    jsonStore.saveCollection('appointments', cleaned);

    // Ensure conversation exists
    await conversationService.getOrCreate(testGuestSession, null);

    // Setup HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    serverUrl = `http://127.0.0.1:${port}`;

    adminToken = signToken({ userId: '00000000-0000-0000-0000-000000000001', role: 'admin' });
  });

  after(async () => {
    // Restore initial appointments
    jsonStore.saveCollection('appointments', originalAppointments);

    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // 6.1 UNIT TESTS
  // =========================================================================
  describe('6.1. Unit Tests', () => {
    test('6.1.1. Tạo mã đặt lịch chuẩn hệ thống (BK-YYYYMMDD-XXXX), tuyệt đối không sinh mã MBL-...', () => {
      const code = appointmentRepo.generateBookingCode(targetDate);
      assert.ok(code.startsWith('BK-20261102-'), 'Mã phải bắt đầu bằng BK-20261102-');
      assert.match(code, /^BK-\d{8}-[A-Z0-9]{4}$/, 'Mã phải đúng chuẩn BK-YYYYMMDD-XXXX');
      assert.equal(code.includes('MBL'), false, 'Mã không được phép chứa tiền tố ảo MBL');
    });

    test('6.1.2. Validate dữ liệu đầu vào: Số điện thoại Việt Nam hợp lệ và không hợp lệ', () => {
      assert.equal(appointmentService.PHONE_REGEX.test('0987654321'), true);
      assert.equal(appointmentService.PHONE_REGEX.test('0345678901'), true);
      assert.equal(appointmentService.PHONE_REGEX.test('12345'), false);
      assert.equal(appointmentService.PHONE_REGEX.test('abcdefghij'), false);
    });

    test('6.1.3. Validate email tùy chọn: Hợp lệ, null và báo lỗi khi sai cú pháp', async () => {
      // Email null -> OK
      const resNull = await executeTool('confirm_appointment', {
        customer_name: 'Test Null Email',
        customer_phone: '0987654321',
        customer_email: null,
        appointment_date: '2026-11-20',
        appointment_time: '09:00',
      }, { conversationId: testConvId, guestSessionId: testGuestSession });
      const parsedNull = JSON.parse(resNull);
      assert.equal(parsedNull.success, true);
      assert.equal(parsedNull.customer_email, null);

      // Email sai cú pháp -> Báo lỗi INVALID_EMAIL
      const resInvalid = await executeTool('confirm_appointment', {
        customer_name: 'Test Invalid Email',
        customer_phone: '0987654321',
        customer_email: 'email_khong_hop_le',
        appointment_date: '2026-11-20',
        appointment_time: '09:30',
      }, { conversationId: testConvId, guestSessionId: testGuestSession });
      const parsedInvalid = JSON.parse(resInvalid);
      assert.equal(parsedInvalid.success, false);
      assert.equal(parsedInvalid.code, 'INVALID_EMAIL');
    });

    test('6.1.4. Kiểm tra điều kiện lịch trống và không cho phép đặt ngày quá khứ', async () => {
      await assert.rejects(
        async () => appointmentService.checkAvailableSlots('2020-01-01', 30),
        /quá khứ/i
      );
    });
  });

  // =========================================================================
  // 6.2 INTEGRATION TESTS
  // =========================================================================
  describe('6.2. Integration Tests', () => {
    test('6.2.1. Tool confirm_appointment tạo bản ghi chuẩn trong Database và trả về booking_code thật', async () => {
      // Giữ chỗ
      const holdRes = JSON.parse(await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: targetTime,
      }, { conversationId: testConvId, guestSessionId: testGuestSession }));
      assert.equal(holdRes.success, true);

      // Xác nhận chốt lịch
      const confirmRes = JSON.parse(await executeTool('confirm_appointment', {
        holding_token: holdRes.holding_token,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
      }, { conversationId: testConvId, guestSessionId: testGuestSession }));

      assert.equal(confirmRes.success, true);
      assert.ok(confirmRes.booking_code.startsWith('BK-20261102-'));
      assert.equal(confirmRes.customer_name, customerName);
      assert.equal(confirmRes.customer_phone, customerPhone);
      assert.equal(confirmRes.status, 'confirmed');

      // Kiểm tra trực tiếp trong Database
      const appts = jsonStore.getCollection('appointments');
      const foundInDb = appts.find(a => a.booking_code === confirmRes.booking_code);
      assert.ok(foundInDb, 'Bản ghi phải tồn tại trong Database');
      assert.equal(foundInDb.customer_name, customerName);
      assert.equal(foundInDb.appointment_date, targetDate);
      assert.equal(foundInDb.appointment_time, targetTime);
      assert.equal(foundInDb.status, 'confirmed');
    });

    test('6.2.2. API Admin GET /api/appointments lấy chính xác lịch vừa tạo với đầy đủ thông tin', async () => {
      const fetchRes = await fetch(`${serverUrl}/api/appointments?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(fetchRes.status, 200);

      const json = await fetchRes.json();
      assert.equal(json.success, true);

      const list = json.data || [];
      const appt = list.find(a => a.customer_phone === customerPhone && a.appointment_date === targetDate);
      assert.ok(appt, 'Admin phải tìm thấy lịch hẹn của Nguyễn Văn Thừa ngày 02/11/2026');
      assert.equal(appt.customer_name, customerName);
      assert.equal(appt.appointment_time, targetTime);
      assert.equal(appt.status, 'confirmed');
      assert.ok(appt.booking_code.startsWith('BK-'));
    });
  });

  // =========================================================================
  // 6.3 END-TO-END TESTS (Test Cases 01 -> 06)
  // =========================================================================
  describe('6.3. End-to-End Test Cases (REQ-01 -> REQ-06)', () => {

    test('Test Case 01: Đặt lịch thành công qua Chatbox -> Có mã thật, lưu DB, Admin thấy', async () => {
      // Mô phỏng cuộc chat hoàn chỉnh qua orchestrator
      const conv = await conversationRepo.create({ guestSessionId: 'e2e-tc01-guest' });

      // Bước 1: Khách chọn giữ chỗ 15:00 ngày 2026-11-02
      const holdRes = JSON.parse(await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: '15:00',
      }, { conversationId: conv.id, guestSessionId: 'e2e-tc01-guest' }));
      assert.equal(holdRes.success, true);

      // Bước 2: Khách cung cấp tên, SĐT và xác nhận chốt lịch
      const confirmToolRes = JSON.parse(await executeTool('confirm_appointment', {
        holding_token: holdRes.holding_token,
        customer_name: 'Trần Văn Layer',
        customer_phone: '0912345678',
      }, { conversationId: conv.id, guestSessionId: 'e2e-tc01-guest' }));

      assert.equal(confirmToolRes.success, true);
      assert.ok(confirmToolRes.booking_code.startsWith('BK-20261102-'));

      // Kiểm tra Admin API thấy ngay lịch
      const adminRes = await fetch(`${serverUrl}/api/appointments?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const adminData = await adminRes.json();
      const match = adminData.data.find(a => a.booking_code === confirmToolRes.booking_code);
      assert.ok(match, 'Lịch phải xuất hiện trong Admin');
      assert.equal(match.customer_name, 'Trần Văn Layer');
      assert.equal(match.appointment_time, '15:00');
    });

    test('Test Case 02: Guardrail chặn thông báo thành công giả khi chưa lưu DB (False Booking Claim Blocked)', async () => {
      // Mô phỏng trường hợp AI hallucinate văn bản: "Đặt lịch thành công! Mã đặt lịch: MBL-20261102-1100-THƯA"
      // mà KHÔNG có tool call nào chốt lịch thành công
      const conv = await conversationRepo.create({ guestSessionId: 'e2e-tc02-guest' });

      // Gửi tin nhắn qua orchestrator chat
      const chatRes = await orchestrator.chat({
        conversationId: conv.id,
        guestSessionId: 'e2e-tc02-guest',
        userMessage: 'tôi muốn hỏi tư vấn dịch vụ uốn tóc',
      });

      // Nếu câu trả lời không có tool chốt lịch, tuyệt đối không được có mã MBL hoặc khẳng định chốt lịch thành công
      assert.equal(chatRes.content.includes('MBL-'), false, 'Không được phép có mã giả MBL');
      assert.equal(
        /(?:đặt lịch|chốt lịch) thành công!/i.test(chatRes.content) && !chatRes.content.includes('BK-'),
        false,
        'Không được báo thành công nếu không có mã thật BK-'
      );
    });

    test('Test Case 03: Đặt lịch trùng thời gian -> Từ chối, chống trùng lịch, AI báo chính xác', async () => {
      // Thử đặt lại vào 11:00 ngày 2026-11-02 (đã có lịch ở test 6.2.1)
      const conflictResStr = await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: targetTime,
      }, { conversationId: 'conv-conflict-test', guestSessionId: 'guest-conflict' });

      const conflictRes = JSON.parse(conflictResStr);
      assert.equal(conflictRes.success, false, 'Phải từ chối giữ chỗ khung giờ đã có lịch');
      assert.ok(
        conflictRes.code === 'SLOT_CONFLICT' || conflictRes.code === 'SLOT_UNAVAILABLE',
        'Mã lỗi phải là SLOT_CONFLICT hoặc SLOT_UNAVAILABLE'
      );
      assert.ok(
        !conflictRes.available_slots.includes(targetTime),
        'Danh sách giờ trống gợi ý KHÔNG ĐƯỢC chứa 11:00'
      );
    });

    test('Test Case 04: Gửi yêu cầu đặt lịch nhiều lần -> Không tạo lịch trùng (Idempotency)', async () => {
      // Giữ chỗ một khung giờ mới
      const newTime = '16:00';
      const holdRes = JSON.parse(await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: newTime,
      }, { conversationId: testConvId, guestSessionId: testGuestSession }));
      assert.equal(holdRes.success, true);

      // Chốt lịch lần 1 -> Thành công
      const confirm1 = JSON.parse(await executeTool('confirm_appointment', {
        holding_token: holdRes.holding_token,
        customer_name: 'Khách Retry',
        customer_phone: '0933333333',
      }, { conversationId: testConvId, guestSessionId: testGuestSession }));
      assert.equal(confirm1.success, true);

      // Cố tình gọi lại confirm_appointment lần 2 với cùng holding_token (Retry) -> Trả về bản ghi đã confirm, không tạo bản ghi mới trùng lặp
      const confirm2 = JSON.parse(await executeTool('confirm_appointment', {
        holding_token: holdRes.holding_token,
        customer_name: 'Khách Retry',
        customer_phone: '0933333333',
      }, { conversationId: testConvId, guestSessionId: testGuestSession }));

      assert.equal(confirm2.success, true);
      assert.equal(confirm2.booking_code, confirm1.booking_code, 'Mã booking phải như nhau, không sinh thêm cuộc hẹn mới');

      // Đếm số lượng cuộc hẹn trong DB lúc 16:00
      const appts = jsonStore.getCollection('appointments');
      const matches = appts.filter(a => a.appointment_date === targetDate && a.appointment_time === newTime && a.status === 'confirmed');
      assert.equal(matches.length, 1, 'Chỉ duy nhất 1 bản ghi được lưu, chống trùng lặp thành công');
    });

    test('Test Case 05: Admin lọc lịch theo ngày 02/11/2026 -> Thấy đầy đủ, không loại bỏ nhầm', async () => {
      const res = await fetch(`${serverUrl}/api/appointments?date=${targetDate}&limit=100`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.length >= 2, 'Phải có các lịch đã tạo thành công trong ngày 02/11/2026');

      // Kiểm tra tất cả đều đúng ngày 2026-11-02
      data.data.forEach(appt => {
        assert.equal(appt.appointment_date, targetDate, 'Ngày hẹn phải khớp chính xác bộ lọc');
      });
    });

    test('Test Case 06: Đặt lịch từ kênh khác (POST /api/appointments) hoạt động bình thường, không hồi quy', async () => {
      const directRes = await fetch(`${serverUrl}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: 'Khách Kênh Web Trực Tiếp',
          customerPhone: '0944444444',
          appointmentDate: targetDate,
          appointmentTime: '08:30',
          durationMinutes: 30,
        })
      });
      assert.equal(directRes.status, 201);
      const body = await directRes.json();
      assert.equal(body.success, true);
      assert.ok(body.data.booking_code.startsWith('BK-20261102-'));
      assert.equal(body.data.customer_name, 'Khách Kênh Web Trực Tiếp');
    });

    test('Test Case 07 (Slot Consistency): Hỏi lịch ngày 2/11 lúc 17h30 lần 1 báo đã kín, lần 2 hỏi lại KHÔNG ĐƯỢC đưa ra 17h30', async () => {
      // Đảm bảo 17:30 ngày 2026-11-02 đã có lịch
      const appts = jsonStore.getCollection('appointments');
      let slot1730 = appts.find(a => a.appointment_date === targetDate && a.appointment_time === '17:30' && a.status === 'confirmed');
      if (!slot1730) {
        appts.push({
          id: 'test-booked-appt-1730-fixed',
          booking_code: `BK-20261102-1730`,
          customer_name: 'Nguyễn Thị Thu Hà',
          customer_phone: '0846166245',
          appointment_date: targetDate,
          appointment_time: '17:30',
          duration_minutes: 45,
          status: 'confirmed',
          created_at: new Date().toISOString()
        });
        jsonStore.saveCollection('appointments', appts);
      }

      // Lần hỏi 1: Giữ chỗ 17:30 -> Phải báo không khả dụng
      const res1 = JSON.parse(await executeTool('hold_appointment_slot', {
        appointment_date: '2/11',
        appointment_time: '17:30',
        duration: 45
      }, {}));
      assert.equal(res1.success, false, 'Lần 1: Khung giờ 17:30 phải báo không khả dụng');

      // Lần hỏi 2: Khách hỏi "ngày đó còn những lịch trống nào nữa"
      const historyContext = [
        { sender_type: 'user', content: 't muốn đặt một lịch làm tóc vào 17:30 ngày 2/11' },
        { sender_type: 'assistant', content: 'Rất tiếc, khung giờ 17:30 ngày 02/11 đã có người đặt.' }
      ];

      const res2 = JSON.parse(await executeTool('check_available_slots', {}, {
        history: historyContext,
        targetDate: targetDate
      }));

      assert.equal(res2.success, true);
      assert.equal(res2.date, targetDate);
      assert.equal(
        res2.slots.includes('17:30'),
        false,
        'Lần 2: TUYỆT ĐỐI KHÔNG ĐƯỢC chứa 17:30 trong danh sách lịch trống'
      );
    });

  });

});
