'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/app');
const { executeTool } = require('../src/ai/tools');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('AI Booking Flow, Email Validation & Admin Sync Test Suite', () => {

  const testConvId = 'conv-test-ai-booking-flow';
  const testGuestId = 'guest-test-ai-booking-flow';
  const testDate = '2027-05-20';
  const testTime = '11:00';
  const context = {
    conversationId: testConvId,
    guestSessionId: testGuestId
  };

  let server;
  let serverUrl;
  let adminToken;

  before(async () => {
    // 1. Clean up old test appointments to ensure idempotency
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => a.customer_email !== 'nguyenvanan@example.com' && a.conversation_id !== testConvId && a.appointment_date !== testDate && a.appointment_date !== '2027-05-22');
    jsonStore.saveCollection('appointments', cleaned);

    // 2. Ensure test conversation exists
    await conversationService.getOrCreate(testGuestId, null);

    // 3. Start test HTTP server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    serverUrl = `http://127.0.0.1:${port}`;

    // 4. Generate admin token
    adminToken = signToken({ userId: '00000000-0000-0000-0000-000000000001', role: 'admin' });
  });

  after(async () => {
    // Clean up test data after run
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => a.customer_email !== 'nguyenvanan@example.com' && a.conversation_id !== testConvId && a.appointment_date !== testDate && a.appointment_date !== '2027-05-22');
    jsonStore.saveCollection('appointments', cleaned);

    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    const { stopServer, closeDb } = require('./helpers');
    await stopServer();
    await closeDb();
  });

  test('1. Bỏ trống email khi gọi confirm_appointment -> Chốt lịch thành công với email null (CR-01)', async () => {
    // 1.1 Khách chọn ngày giờ riêng cho test 1 để không chiếm slot của test 4
    const test1Date = '2027-05-22';
    const test1Time = '14:00';
    const holdResStr = await executeTool('hold_appointment_slot', {
      appointment_date: test1Date,
      appointment_time: test1Time,
      product_name: 'Cắt tóc Layer Nữ'
    }, context);
    const holdRes = JSON.parse(holdResStr);
    assert.equal(holdRes.success, true, 'Hold slot phải thành công');
    const holdingToken = holdRes.holding_token;
    assert.ok(holdingToken, 'Phải có holding_token');

    // 1.2 Khách cung cấp tên và số điện thoại, bỏ trống email -> confirm_appointment chốt lịch thành công
    const confirmResStr = await executeTool('confirm_appointment', {
      holding_token: holdingToken,
      customer_name: 'Nguyễn Văn An Test Optional Email',
      customer_phone: '0901234567'
      // customer_email is omitted (optional)
    }, context);
    const confirmRes = JSON.parse(confirmResStr);

    assert.equal(confirmRes.success, true, 'Confirm appointment khi không có email phải thành công');
    assert.ok(confirmRes.booking_code, 'Phải có booking_code thật từ hệ thống');
    assert.match(confirmRes.booking_code, /^BK-\d{8}-[A-Z0-9]+$/, 'Mã booking phải đúng chuẩn BK-YYYYMMDD-XXXX');
    assert.equal(confirmRes.status, 'confirmed', 'Trạng thái phải là confirmed');
    assert.equal(confirmRes.customer_name, 'Nguyễn Văn An Test Optional Email');
    assert.equal(confirmRes.customer_phone, '0901234567');
    assert.equal(confirmRes.customer_email, null, 'Email phải được lưu là null');
  });

  test('2. Nhập email sai định dạng -> Báo lỗi INVALID_EMAIL', async () => {
    const confirmResStr = await executeTool('confirm_appointment', {
      customer_name: 'Nguyễn Văn An',
      customer_phone: '0901234567',
      customer_email: 'nguyenvanan_khong_hop_le'
    }, context);
    const confirmRes = JSON.parse(confirmResStr);

    assert.equal(confirmRes.success, false);
    assert.equal(confirmRes.code, 'INVALID_EMAIL');
    assert.ok(confirmRes.message.includes('hợp lệ'), 'Phải thông báo email không đúng định dạng');
  });

  test('3. Nhập số điện thoại sai định dạng -> Báo lỗi INVALID_PHONE', async () => {
    const confirmResStr = await executeTool('confirm_appointment', {
      customer_name: 'Nguyễn Văn An',
      customer_phone: '12345',
      customer_email: 'nguyenvanan@example.com'
    }, context);
    const confirmRes = JSON.parse(confirmResStr);

    assert.equal(confirmRes.success, false);
    assert.equal(confirmRes.code, 'INVALID_PHONE');
  });

  test('4. Đầy đủ thông tin hợp lệ -> confirm_appointment tự tìm holding_token của conversation và chốt lịch thành công', async () => {
    // 4.1 Khách chọn ngày giờ -> AI giữ chỗ tạm thời cho conversation
    const holdResStr = await executeTool('hold_appointment_slot', {
      appointment_date: testDate,
      appointment_time: testTime,
      product_name: 'Cắt tóc Layer Nữ'
    }, context);
    const holdRes = JSON.parse(holdResStr);
    assert.equal(holdRes.success, true, 'Hold slot cho conversation phải thành công');

    // 4.2 Khách cung cấp đầy đủ: Tên, SĐT hợp lệ, Email hợp lệ (không cần holding_token AI vẫn tự match bản ghi giữ chỗ)
    const confirmResStr = await executeTool('confirm_appointment', {
      customer_name: 'Nguyễn Văn An',
      customer_phone: '0901 234 567', // Có khoảng trắng -> tự chuẩn hóa thành 0901234567
      customer_email: 'nguyenvanan@example.com',
      notes: 'Khách muốn cắt layer và uốn phồng'
    }, context);
    const confirmRes = JSON.parse(confirmResStr);

    assert.equal(confirmRes.success, true, 'Confirm appointment phải thành công');
    assert.ok(confirmRes.booking_code, 'Phải có booking_code thật từ hệ thống');
    assert.match(confirmRes.booking_code, /^BK-\d{8}-[A-Z0-9]+$/, 'Mã booking phải đúng chuẩn BK-YYYYMMDD-XXXX');
    assert.equal(confirmRes.status, 'confirmed', 'Trạng thái phải là confirmed');
    assert.equal(confirmRes.customer_name, 'Nguyễn Văn An');
    assert.equal(confirmRes.customer_phone, '0901234567');
    assert.equal(confirmRes.customer_email, 'nguyenvanan@example.com');
  });

  test('5. Kiểm tra lịch hẹn xuất hiện chính xác trong Admin API với đầy đủ Tên, SĐT, Email, Mã booking', async () => {
    const fetchRes = await fetch(`${serverUrl}/api/appointments?limit=100`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(fetchRes.status, 200);

    const body = await fetchRes.json();
    assert.equal(body.success, true);

    const appts = Array.isArray(body.data) ? body.data : (body.data.rows || []);
    const vanAnAppt = appts.find(a => a.customer_email === 'nguyenvanan@example.com');

    assert.ok(vanAnAppt, 'Lịch hẹn của Nguyễn Văn An phải có trong danh sách Admin');
    assert.equal(vanAnAppt.customer_name, 'Nguyễn Văn An');
    assert.equal(vanAnAppt.customer_phone, '0901234567');
    assert.equal(vanAnAppt.customer_email, 'nguyenvanan@example.com');
    assert.equal(vanAnAppt.status, 'confirmed');
    assert.ok(vanAnAppt.booking_code, 'Admin phải đọc được booking_code thật');
    assert.equal(vanAnAppt.booking_code.startsWith('BK-'), true);
  });

  test('6. Kiểm tra conversation được đồng bộ thông tin khách hàng (customer_name, customer_phone, customer_email)', async () => {
    const conv = await conversationRepo.findById(testConvId);
    if (conv) {
      assert.equal(conv.customer_name, 'Nguyễn Văn An');
      assert.equal(conv.customer_phone, '0901234567');
      assert.equal(conv.customer_email, 'nguyenvanan@example.com');
    }
  });

  test('7. Thử tạo lịch trùng giờ đã đặt -> Báo lỗi SLOT_CONFLICT / không còn chỗ trống', async () => {
    const newContext = {
      conversationId: 'conv-test-conflict',
      guestSessionId: 'guest-test-conflict'
    };

    // Cố gắng giữ chỗ cùng khung giờ testDate và testTime đã được chốt ở Test 4
    const holdResStr = await executeTool('hold_appointment_slot', {
      appointment_date: testDate,
      appointment_time: testTime,
      product_name: 'Nhuộm tóc'
    }, newContext);
    const holdRes = JSON.parse(holdResStr);

    assert.equal(holdRes.success, false, 'Không được phép đặt vào khung giờ đã có lịch');
    assert.ok(holdRes.error.includes('available') || holdRes.error.includes('đã có người đặt') || holdRes.code === 'SLOT_CONFLICT');
  });

  test('8. Kiểm tra tính bền vững (Persistence): Dữ liệu lưu vĩnh viễn vào file appointments.json và đọc lại được sau reload', async () => {
    const rawAppointments = jsonStore.getCollection('appointments');
    const saved = rawAppointments.find(a => a.customer_email === 'nguyenvanan@example.com' && a.appointment_date === testDate);

    assert.ok(saved, 'Bản ghi phải được lưu vĩnh viễn trong database/data/appointments.json');
    assert.equal(saved.customer_name, 'Nguyễn Văn An');
    assert.equal(saved.customer_phone, '0901234567');
    assert.equal(saved.customer_email, 'nguyenvanan@example.com');
    assert.equal(saved.status, 'confirmed');
    assert.ok(saved.booking_code, 'Mã booking phải được lưu bền vững');
  });

});
