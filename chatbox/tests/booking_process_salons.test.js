'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb } = require('./helpers');
const authService = require('../src/services/authService');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const jsonStore = require('../src/config/jsonStore');

function getFutureWeekday(daysAhead = 4) {
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

describe('Salon BPMN 2-Phase Booking Process & Gap Verification Suite', () => {
  const testSession1 = uuidv4();
  const testSession2 = uuidv4();
  const targetDate = getFutureWeekday(5);
  const targetTime = '09:15';
  let receptionistToken = null;

  before(async () => {
    // Clean up any stale test appointments on targetDate
    const appointments = jsonStore.getCollection('appointments');
    const filtered = appointments.filter(a => a.appointment_date !== targetDate);
    jsonStore.saveCollection('appointments', filtered);

    try {
      const recLogin = await authService.login('receptionist@example.com', 'Receptionist@123456');
      receptionistToken = recLogin.token;
    } catch (e) {
      console.warn('Receptionist login failed in before hook:', e.message);
    }
  });

  after(async () => {
    // Cleanup created appointments
    const appointments = jsonStore.getCollection('appointments');
    const filtered = appointments.filter(a => a.appointment_date !== targetDate);
    jsonStore.saveCollection('appointments', filtered);

    await stopServer();
    await closeDb();
  });

  test('1. Kiểm tra khung giờ hoạt động mở cửa từ 08:30 đến 20:30 (REQ-007)', async () => {
    const res = await apiRequest(`/api/appointments/slots?date=${targetDate}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const slots = res.body.data.slots;
    assert.ok(slots.length > 0, 'Phải có khung giờ trống');
    assert.ok(slots.includes('08:30'), 'Giờ mở cửa phải bắt đầu từ 08:30');
    assert.ok(slots.includes(targetTime), `Khung giờ ${targetTime} phải có sẵn ban đầu`);
  });

  let heldToken = null;
  test('2. Bước 6 BPMN: Khách chọn slot -> Giữ chỗ tạm thời (TTL 5 phút) (REQ-001, REQ-005)', async () => {
    const res = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession1 },
      body: {
        appointmentDate: targetDate,
        appointmentTime: targetTime,
        durationMinutes: 30,
        notes: 'Khách muốn tư vấn uốn sóng lơi',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.holding_token, 'Phải sinh ra holding_token');
    assert.equal(res.body.data.status, 'holding', 'Trạng thái phải là holding');
    assert.ok(res.body.data.hold_expires_at, 'Phải có thời hạn hold_expires_at');

    const expiresAt = new Date(res.body.data.hold_expires_at).getTime();
    const now = Date.now();
    const diffMins = Math.round((expiresAt - now) / 60000);
    assert.ok(diffMins >= 4 && diffMins <= 6, 'TTL phải xấp xỉ 5 phút');

    heldToken = res.body.data.holding_token;
  });

  test('3. Chống đặt trùng khi slot đang bị giữ chỗ tạm thời (REQ-001, REQ-003)', async () => {
    // 3.1. Slot vừa được hold không còn xuất hiện trong API checkAvailableSlots
    const slotsRes = await apiRequest(`/api/appointments/slots?date=${targetDate}`);
    const availableSlots = slotsRes.body.data.slots;
    assert.equal(
      availableSlots.includes(targetTime),
      false,
      `Slot ${targetTime} đang bị hold nên không được xuất hiện trong danh sách slot trống`
    );

    // 3.2. Khách khác cố tình hold cùng slot đó sẽ nhận lỗi 409 SLOT_CONFLICT
    const conflictRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession2 },
      body: {
        appointmentDate: targetDate,
        appointmentTime: targetTime,
        durationMinutes: 30,
      },
    });

    assert.equal(conflictRes.status, 409);
    assert.equal(conflictRes.body.code, 'SLOT_CONFLICT');
  });

  test('4. Bước 8 BPMN: Giải phóng slot giữ chỗ tạm thời khi khách hủy hoặc timeout (REQ-006)', async () => {
    const releaseRes = await apiRequest('/api/appointments/release-hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession1 },
      body: { holdingToken: heldToken },
    });

    assert.equal(releaseRes.status, 200);
    assert.equal(releaseRes.body.success, true);
    assert.equal(releaseRes.body.data.status, 'cancelled');

    // Slot phải mở lại ngay lập tức
    const slotsRes = await apiRequest(`/api/appointments/slots?date=${targetDate}`);
    assert.ok(
      slotsRes.body.data.slots.includes(targetTime),
      `Slot ${targetTime} phải xuất hiện trở lại sau khi được giải phóng`
    );
  });

  test('5. Bước 9 BPMN: Xác thực lại slot và chốt lịch chính thức vào CSDL (REQ-002, REQ-005)', async () => {
    // 5.1. Hold lại slot
    const holdRes = await apiRequest('/api/appointments/hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession1 },
      body: {
        appointmentDate: targetDate,
        appointmentTime: targetTime,
        durationMinutes: 30,
      },
    });
    assert.equal(holdRes.status, 201);
    const newHoldToken = holdRes.body.data.holding_token;

    // 5.2. Chặn số điện thoại sai định dạng
    const invalidPhoneRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession1 },
      body: {
        holdingToken: newHoldToken,
        customerName: 'Nguyễn Văn A',
        customerPhone: '12345', // Không hợp lệ
      },
    });
    assert.equal(invalidPhoneRes.status, 400);

    // 5.3. Xác thực thành công với SĐT hợp lệ
    const confirmRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession1 },
      body: {
        holdingToken: newHoldToken,
        customerName: 'Trần Thị Mai',
        customerPhone: '0905123456',
        customerEmail: 'mai.tran@example.com',
        notes: 'Yêu cầu phục hồi tóc hư tổn',
      },
    });

    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.success, true);
    const confirmedData = confirmRes.body.data;
    assert.equal(confirmedData.status, 'confirmed', 'Trạng thái chuyển thành confirmed');
    assert.ok(confirmedData.booking_code, 'Phải sinh mã booking');
    assert.match(confirmedData.booking_code, /^BK-\d{8}-[A-Z0-9]+$/, 'Định dạng mã booking chuẩn');
    assert.equal(confirmedData.customer_name, 'Trần Thị Mai');
    assert.equal(confirmedData.customer_phone, '0905123456');
  });

  test('6. Bảo toàn dữ liệu khi xảy ra xung đột slot ở Bước 9 (REQ-004)', async () => {
    const conflictTime = '16:00';
    const altTime = '16:45';

    // 6.1. Hold slot 16:00 và chốt bởi khách 1
    const firstHold = await appointmentService.holdSlot({
      guestSessionId: testSession1,
      appointmentDate: targetDate,
      appointmentTime: conflictTime,
    });
    await appointmentService.confirmHoldingSlot({
      holdingToken: firstHold.holding_token,
      customerName: 'Khách Đã Chốt Trước',
      customerPhone: '0912345678',
    });

    // 6.2. Khách 2 hold slot 16:45
    const secondHold = await appointmentService.holdSlot({
      guestSessionId: testSession2,
      appointmentDate: targetDate,
      appointmentTime: altTime,
    });

    // Giả lập slot của khách 2 bị thay đổi sang 16:00 (bị tranh chấp trước khi confirm)
    const appts = jsonStore.getCollection('appointments');
    const target = appts.find(a => a.id === secondHold.id);
    target.appointment_time = conflictTime;
    jsonStore.saveCollection('appointments', appts);

    // Bước 9 xác thực phát hiện conflict
    const conflictRes = await apiRequest('/api/appointments/confirm-hold', {
      method: 'POST',
      headers: { 'x-guest-session': testSession2 },
      body: {
        holdingToken: secondHold.holding_token,
        customerName: 'Lê Thị Thu',
        customerPhone: '0988776655',
        customerEmail: 'thu.le@example.com',
      },
    });

    assert.equal(conflictRes.status, 409);
    assert.equal(conflictRes.body.code, 'SLOT_CONFLICT');
    assert.ok(conflictRes.body.preservedData, 'Phải bảo tồn dữ liệu khách hàng');
    assert.equal(conflictRes.body.preservedData.customerName, 'Lê Thị Thu');
    assert.equal(conflictRes.body.preservedData.customerPhone, '0988776655');
  });

  test('7. Cơ chế TTL 5 phút: Tự động giải phóng các bản ghi holding hết hạn (REQ-012)', async () => {
    // Tạo 1 holding slot giả lập đã quá hạn 10 phút trước (quá 5 phút TTL)
    const expiredHold = await appointmentService.holdSlot({
      guestSessionId: testSession1,
      appointmentDate: targetDate,
      appointmentTime: '15:00',
    });

    const appts = jsonStore.getCollection('appointments');
    const target = appts.find(a => a.id === expiredHold.id);
    target.hold_expires_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    jsonStore.saveCollection('appointments', appts);

    // Kích hoạt dọn dẹp
    const cleanedCount = appointmentRepo.cleanupExpiredHolds();
    assert.ok(cleanedCount >= 1, 'Phải dọn dẹp ít nhất 1 slot quá hạn');

    // Slot 15:00 phải được trả lại tự do
    const slots = await appointmentRepo.findAvailableSlots(targetDate, 30);
    assert.ok(slots.includes('15:00'), 'Slot 15:00 phải khả dụng sau khi holding hết hạn');

    const apptsAfter = jsonStore.getCollection('appointments');
    const cleanedAppt = apptsAfter.find(a => a.id === expiredHold.id);
    assert.ok(cleanedAppt.notes.includes('TTL 5m'), 'Ghi chú phải ghi rõ TTL 5m');
  });

  test('8. Lưu trữ Lead khi phiên đóng do timeout không phản hồi (REQ-011)', async () => {
    const conv = await conversationRepo.create({
      guestSessionId: testSession1,
      productContextId: null,
    });

    const closedLead = await conversationService.closeAsLead(conv.id, testSession1, {
      leadPhone: '0933221100',
      customerName: 'Khách Tiềm Năng',
      leadNotes: 'Khách hỏi dịch vụ nhuộm balayage nhưng im lặng sau khi nhắc 5 phút',
    });

    assert.equal(closedLead.mode, 'closed');
    assert.equal(closedLead.is_lead, true);
    assert.equal(closedLead.customer_phone, '0933221100');
    assert.equal(closedLead.customer_name, 'Khách Tiềm Năng');
  });

  test('9. Phân quyền Lễ tân (Receptionist) và Khách hàng (REQ-009, REQ-005)', async () => {
    if (!receptionistToken) {
      assert.fail('receptionistToken chưa được khởi tạo');
    }

    // 9.1. Receptionist có thể xem danh sách lịch hẹn
    const listRes = await apiRequest('/api/appointments', {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.data));

    // 9.2. Receptionist BỊ CHẶN khi cố thay đổi trạng thái lịch hẹn (chỉ Admin mới được đổi)
    const blockRes = await apiRequest(`/api/appointments/${listRes.body.data[0]?.id || uuidv4()}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: { status: 'completed' },
    });
    assert.equal(blockRes.status, 403);
  });
});
