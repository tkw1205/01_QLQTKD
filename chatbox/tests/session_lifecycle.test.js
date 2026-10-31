'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const http = require('http');

const { app } = require('../src/app');
const { apiRequest, stopServer, closeDb } = require('./helpers');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const conversationService = require('../src/services/conversationService');
const sessionTimeoutService = require('../src/services/sessionTimeoutService');
const jsonStore = require('../src/config/jsonStore');

describe('Session Lifecycle & Inactivity Timeout Suite (CR-04, CR-05, CR-06)', () => {
  before(async () => {
    // Ensure timeout service scanner is stopped during manual discrete timing tests
    sessionTimeoutService.stop();
  });

  after(async () => {
    // Clean up any test appointments created during this suite
    const appts = jsonStore.getCollection('appointments');
    const filtered = appts.filter(a => a.appointment_date !== '2028-11-15');
    jsonStore.saveCollection('appointments', filtered);

    await stopServer();
    await closeDb();
  });

  test('1. CR-04 Giai đoạn 1: Sau 5 phút im lặng trong AI mode -> Gửi tin nhắn cảnh báo 5 phút & warning_sent = true', async () => {
    const guestSessionId = uuidv4();
    const conv = await conversationRepo.create({ guestSessionId });
    const startTime = Date.now();

    // 1.1 Khách gửi tin nhắn đầu tiên
    await messageRepo.create({
      conversationId: conv.id,
      senderType: 'user',
      content: 'Chào salon, tôi muốn tìm hiểu dịch vụ uốn tóc',
    });

    // 1.2 Kiểm tra sau 3 phút im lặng (chưa tới 5 phút) -> Chưa gửi cảnh báo
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 3 * 60 * 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    const convAfter3m = await conversationRepo.findById(conv.id);
    assert.equal(Boolean(convAfter3m.warning_sent), false, 'Chưa gửi cảnh báo khi dưới 5 phút');
    assert.equal(convAfter3m.mode, 'ai');

    // 1.3 Kiểm tra sau 5 phút im lặng (đủ 5m) -> Kích hoạt cảnh báo Giai đoạn 1
    const check5mResult = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });

    assert.ok(check5mResult.warningsSent.includes(conv.id), 'Phải có id hội thoại trong danh sách warningsSent');

    const convAfter5m = await conversationRepo.findById(conv.id);
    assert.equal(convAfter5m.warning_sent, true, 'Trường warning_sent phải chuyển thành true');
    assert.ok(convAfter5m.warning_sent_at, 'Phải ghi nhận thời điểm warning_sent_at');
    assert.equal(convAfter5m.mode, 'ai', 'Phiên vẫn ở chế độ AI để khách có thể tiếp tục tương tác');

    // Kiểm tra tin nhắn cảnh báo đã được ghi vào messages
    const msgs = await messageRepo.findByConversation(conv.id);
    const lastMsg = msgs[msgs.length - 1];
    assert.equal(lastMsg.sender_type, 'assistant');
    assert.match(lastMsg.content, /5 phút/i, 'Nội dung tin nhắn cảnh báo phải nhắc nhở kết thúc sau 5 phút');
    assert.match(lastMsg.content, /bận|tương tác|hỗ trợ/i);
  });

  test('2. CR-04 Tương tác người dùng: Khách nhắn tin sau khi nhận cảnh báo -> Tự động reset cảnh báo (warning_sent = false)', async () => {
    const guestSessionId = uuidv4();
    const conv = await conversationRepo.create({ guestSessionId });
    const startTime = Date.now();

    // Giả lập đã gửi cảnh báo sau 5 phút
    await messageRepo.create({
      conversationId: conv.id,
      senderType: 'user',
      content: 'Alo',
    });
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    const convWarned = await conversationRepo.findById(conv.id);
    assert.equal(convWarned.warning_sent, true);

    // Khách nhắn tin phản hồi
    sessionTimeoutService.resetInactivityWarning(conv.id);

    const convReset = await conversationRepo.findById(conv.id);
    assert.equal(convReset.warning_sent, false, 'Cảnh báo phải được reset về false');
    assert.equal(convReset.stage1_warning_sent, false);
  });

  test('3. CR-04 Giai đoạn 2: Tiếp tục im lặng thêm 5 phút (tổng 10 phút) -> Đóng phiên (mode: "closed", is_lead: true, giải phóng holding slot)', async () => {
    const guestSessionId = uuidv4();
    const conv = await conversationRepo.create({ guestSessionId });
    const startTime = Date.now();

    // Tạo một holding slot gắn với conversation này
    const targetDate = '2028-11-15';
    const heldAppt = await appointmentRepo.createHoldingSlot({
      conversationId: conv.id,
      guestSessionId,
      appointmentDate: targetDate,
      appointmentTime: '14:30',
      durationMinutes: 30,
      notes: 'Giữ chỗ test timeout',
    });
    assert.equal(heldAppt.status, 'holding');

    // 3.1 Kích hoạt Giai đoạn 1 (5 phút)
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });

    // 3.2 Khách tiếp tục im lặng thêm 5 phút nữa (tổng 10 phút) -> Kích hoạt Giai đoạn 2
    const check10mResult = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 10 * 60 * 1000 + 2000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });

    assert.ok(check10mResult.closedAI.includes(conv.id), 'Phải có id hội thoại trong danh sách closedAI');

    const closedConv = await conversationRepo.findById(conv.id);
    assert.equal(closedConv.mode, 'closed', 'Trạng thái phiên phải chuyển sang closed');
    assert.equal(closedConv.is_lead, true, 'Phiên đóng phải được đánh dấu là lead tiềm năng');
    assert.ok(closedConv.closed_at, 'Phải có thời điểm closed_at');

    // Kiểm tra tin nhắn đóng phiên của hệ thống
    const msgs = await messageRepo.findByConversation(conv.id);
    const closeMsg = msgs.find(m => m.sender_type === 'system' && m.content.includes('tạm đóng'));
    assert.ok(closeMsg, 'Phải có tin nhắn hệ thống thông báo đóng phiên');

    // Kiểm tra holding slot gắn với phiên đã tự động bị hủy/giải phóng
    const appts = jsonStore.getCollection('appointments');
    const checkedHold = appts.find(a => a.id === heldAppt.id);
    assert.equal(checkedHold.status, 'cancelled', 'Holding slot phải tự động chuyển thành cancelled để nhả slot');
  });

  test('4. CR-05 Khách nhắn lại vào phiên đã CLOSED: Phiên cũ chuyển read-only, tự động mở phiên mới và bot gửi lời chào Salon Lumière', async () => {
    const guestSessionId = uuidv4();
    // 4.1 Tạo một conversation và chuyển sang CLOSED
    const oldConv = await conversationRepo.create({ guestSessionId });
    await conversationRepo.updateCustomerInfo(oldConv.id, {
      customerName: 'Hoàng Yến',
      customerPhone: '0912999888',
      customerEmail: null,
    });
    await conversationRepo.updateMode(oldConv.id, 'closed', null);
    const oldConvClosed = await conversationRepo.findById(oldConv.id);
    assert.equal(oldConvClosed.mode, 'closed');

    // Lưu một tin nhắn cũ vào phiên cũ
    await messageRepo.create({
      conversationId: oldConv.id,
      senderType: 'user',
      content: 'Tin nhắn từ phiên trước',
    });

    // 4.2 Khách gửi tin nhắn vào phiên cũ thông qua conversationService.sendMessage
    const result = await conversationService.sendMessage(oldConv.id, {
      guestSessionId,
      message: 'Tôi muốn tư vấn nhuộm tóc màu khói',
    });

    assert.equal(result.isNewSession, true, 'Phải báo hiệu là session mới');
    assert.ok(result.newConversationId, 'Phải có newConversationId');
    assert.notEqual(result.newConversationId, oldConv.id, 'ID phiên mới phải khác ID phiên cũ');

    // 4.3 Kiểm tra phiên cũ vẫn giữ nguyên trạng thái CLOSED và giữ nguyên lịch sử (read-only)
    const oldConvVerify = await conversationRepo.findById(oldConv.id);
    assert.equal(oldConvVerify.mode, 'closed', 'Phiên cũ vẫn giữ nguyên mode closed');
    const oldMsgs = await messageRepo.findByConversation(oldConv.id);
    assert.ok(oldMsgs.some(m => m.content === 'Tin nhắn từ phiên trước'), 'Lịch sử phiên cũ được bảo toàn');

    // 4.4 Kiểm tra phiên mới có mode 'ai', bảo lưu thông tin khách hàng, và chứa lời chào Salon Lumière
    const newConv = await conversationRepo.findById(result.newConversationId);
    assert.equal(newConv.mode, 'ai');
    assert.equal(newConv.customer_name, 'Hoàng Yến');
    assert.equal(newConv.customer_phone, '0912999888');

    const newMsgs = await messageRepo.findByConversation(result.newConversationId);
    const greetingMsg = newMsgs.find(m => m.sender_type === 'assistant' && m.content.includes('Salon Lumière'));
    assert.ok(greetingMsg, 'Phiên mới phải có lời chào mừng trở lại từ Salon Lumière');
    assert.match(greetingMsg.content, /Salon Lumière/i);

    // Tin nhắn của khách cũng được lưu vào phiên mới
    const userMsgInNew = newMsgs.find(m => m.sender_type === 'user' && m.content.includes('nhuộm tóc'));
    assert.ok(userMsgInNew, 'Tin nhắn của khách phải được lưu vào phiên mới');
  });

  test('5. CR-05 Gọi REST API POST /api/conversations/:id/chat vào phiên CLOSED -> Tự động trả về session mới và lời chào', async () => {
    // 5.1 Tạo một guest session và lấy conversation hiện tại
    const initRes = await apiRequest('/api/conversations/current');
    assert.equal(initRes.status, 200);
    const cookie = initRes.headers['set-cookie'];
    const convId = initRes.body.data.conversation.id;

    // Đóng conversation này lại
    await conversationRepo.updateMode(convId, 'closed', null);

    // 5.2 Khách gửi tin nhắn qua REST API POST /api/conversations/:id/chat vào phiên đã đóng
    const chatRes = await apiRequest(`/api/conversations/${convId}/chat`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { message: 'Chào salon, mình quay lại đặt lịch đây' },
    });

    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.body.success, true);
    assert.equal(chatRes.body.data.isNewSession, true, 'API phải phản hồi isNewSession: true');
    assert.ok(chatRes.body.data.newConversationId, 'API phải trả về newConversationId');
    assert.notEqual(chatRes.body.data.newConversationId, convId, 'Phiên mới phải có ID mới');
    assert.ok(chatRes.body.data.greeting, 'API phải đính kèm greeting');
    assert.match(chatRes.body.data.greeting.content, /Salon Lumière/i);
  });

  test('6. CR-06 Chuyển giao tiếp nhân viên thật (Human Handover): Timeout kéo dài lên 60 phút, không đóng ở mốc 5m hay 10m', async () => {
    const guestSessionId = uuidv4();
    const conv = await conversationRepo.create({ guestSessionId });
    // Chuyển sang chế độ human với nhân viên
    await conversationRepo.updateMode(conv.id, 'human', '00000000-0000-0000-0000-000000000002');
    const startTime = Date.now();

    await messageRepo.create({
      conversationId: conv.id,
      senderType: 'user',
      content: 'Em muốn hỏi kỹ thuật tẩy tóc của salon',
    });

    // 6.1 Kiểm tra tại mốc 5 phút -> KHÔNG được gửi cảnh báo và KHÔNG đóng
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    const convAt5m = await conversationRepo.findById(conv.id);
    assert.equal(convAt5m.mode, 'human', 'Phiên human không bị đổi mode tại mốc 5 phút');
    assert.equal(Boolean(convAt5m.warning_sent), false, 'Không gửi cảnh báo AI cho phiên human');

    // 6.2 Kiểm tra tại mốc 10 phút -> Vẫn KHÔNG đóng
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 10 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    const convAt10m = await conversationRepo.findById(conv.id);
    assert.equal(convAt10m.mode, 'human', 'Phiên human vẫn hoạt động bình thường tại mốc 10 phút');

    // 6.3 Kiểm tra tại mốc 59 phút -> Vẫn đang mở
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 59 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    const convAt59m = await conversationRepo.findById(conv.id);
    assert.equal(convAt59m.mode, 'human');

    // 6.4 Kiểm tra tại mốc 60 phút không tương tác -> Đóng phiên thành closed lead
    const check60mResult = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 60 * 60 * 1000 + 1000,
      humanCloseMs: 60 * 60 * 1000,
    });

    assert.ok(check60mResult.closedHuman.includes(conv.id), 'Phải ghi nhận đóng phiên human sau 60 phút');
    const convAt60m = await conversationRepo.findById(conv.id);
    assert.equal(convAt60m.mode, 'closed', 'Phiên chuyển sang closed sau 60 phút');
    assert.equal(convAt60m.is_lead, true);
    assert.ok(convAt60m.closed_at);

    // Có tin nhắn hệ thống đóng phiên sau 60 phút
    const msgs = await messageRepo.findByConversation(conv.id);
    const closeMsg = msgs.find(m => m.sender_type === 'system' && m.content.includes('60 phút'));
    assert.ok(closeMsg, 'Phải có tin nhắn hệ thống ghi nhận đóng do 60 phút không tương tác');
  });
});
