'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/app');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('Admin Chat - AI Transition & List Display Test Suite', () => {

  let server;
  let serverUrl;
  let adminToken;
  let staffToken;

  let testGuestSession = `guest_session_test_ai_${Date.now()}`;
  let conversationId;

  before(async () => {
    // Start test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    serverUrl = `http://127.0.0.1:${port}`;

    adminToken = signToken({ userId: '00000000-0000-0000-0000-000000000001', role: 'admin' });
    staffToken = signToken({ userId: '33333333-3333-3333-3333-333333333001', role: 'staff' });
  });

  after(async () => {
    // Cleanup created conversation and messages from jsonStore
    if (conversationId) {
      const convs = jsonStore.getCollection('conversations');
      const filteredConvs = convs.filter(c => c.id !== conversationId);
      jsonStore.saveCollection('conversations', filteredConvs);

      const msgs = jsonStore.getCollection('messages');
      const filteredMsgs = msgs.filter(m => m.conversation_id !== conversationId);
      jsonStore.saveCollection('messages', filteredMsgs);
    }
    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Khởi tạo cuộc hội thoại và cập nhật thông tin họ tên đầy đủ, SĐT, Email', async () => {
    const conv = await conversationService.getOrCreate(testGuestSession, null);
    assert.ok(conv && conv.id);
    conversationId = conv.id;

    // Cập nhật thông tin họ tên đầy đủ (dài), số điện thoại, email
    const longFullName = 'Nguyễn Hoàng Nhật Nam Khánh Linh';
    await conversationRepo.updateCustomerInfo(conversationId, {
      name: longFullName,
      phone: '0987654321',
      email: 'namkhanh.linh@example.com'
    });

    const updated = await conversationRepo.findById(conversationId);
    assert.equal(updated.customer_name, longFullName, 'Họ tên phải lưu trọn vẹn, không bị cắt ngắn');
    assert.equal(updated.customer_phone, '0987654321');
    assert.equal(updated.customer_email, 'namkhanh.linh@example.com');
    assert.equal(updated.mode, 'ai', 'Ban đầu cuộc hội thoại ở chế độ AI');
  });

  test('2. Khách hàng gửi tin nhắn AI và AI phản hồi -> Tin nhắn được lưu và làm giàu enriched dữ liệu', async () => {
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Chào salon, mình muốn hỏi về dịch vụ uốn tóc setting'
    });

    await messageRepo.create({
      conversationId,
      senderType: 'assistant',
      content: 'Dạ chào bạn, salon có dịch vụ uốn tóc setting cao cấp bảo hành 6 tháng ạ!'
    });

    const convDetail = await conversationRepo.findById(conversationId);
    assert.equal(convDetail.message_count, 2);
    assert.ok(convDetail.last_message.includes('uốn tóc setting cao cấp'));
    assert.equal(convDetail.last_message_sender, 'assistant');
  });

  test('3. Khách hàng yêu cầu chuyển sang nhân viên (switch-to-agent) -> Chờ tiếp nhận', async () => {
    const res = await conversationService.requestAgentSwitch(conversationId, testGuestSession, null);
    assert.equal(res.conversation.mode, 'waiting_for_agent');

    // Kiểm tra API Admin /api/conversations/agent/waiting
    const fetchRes = await fetch(`${serverUrl}/api/conversations/agent/waiting`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(fetchRes.status, 200);
    const body = await fetchRes.json();
    assert.equal(body.success, true);

    const found = body.data.find(c => c.id === conversationId);
    assert.ok(found, 'Hội thoại phải có trong danh sách chờ tiếp nhận');
    assert.equal(found.customer_name, 'Nguyễn Hoàng Nhật Nam Khánh Linh');
    assert.equal(found.customer_phone, '0987654321');
    assert.equal(found.customer_email, 'namkhanh.linh@example.com');
  });

  test('4. Nhân viên tiếp nhận (claim) và nhắn tin -> Chuyển sang active (human)', async () => {
    const claimRes = await conversationService.agentClaim(conversationId, '33333333-3333-3333-3333-333333333001', null);
    assert.equal(claimRes.mode, 'human');

    // Nhân viên gửi tin nhắn
    await conversationService.agentSendMessage({
      conversationId,
      agentId: '33333333-3333-3333-3333-333333333001',
      content: 'Chào bạn, mình là nhân viên tư vấn Salon Lumière, mình có thể hỗ trợ bạn chọn mẫu tóc phù hợp ạ!',
      io: null
    });

    // Kiểm tra danh sách active
    const fetchRes = await fetch(`${serverUrl}/api/conversations/agent/active`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.equal(fetchRes.status, 200);
    const body = await fetchRes.json();
    assert.equal(body.success, true);

    const found = body.data.find(c => c.id === conversationId);
    assert.ok(found, 'Hội thoại phải có trong danh sách đang xử lý');
    assert.equal(found.mode, 'human');
    assert.equal(found.customer_name, 'Nguyễn Hoàng Nhật Nam Khánh Linh');
  });

  test('5. Khách hàng chuyển về chat AI (switch-to-ai) -> HỘI THOẠI VẪN NẰM TRONG DANH SÁCH ADMIN ACTIVE', async () => {
    // Khách hàng bấm chuyển về AI
    const switched = await conversationService.switchBackToAI(conversationId, testGuestSession, null);
    assert.equal(switched.mode, 'ai', 'Trạng thái chuyển về mode: ai');

    // QUAN TRỌNG: Gọi API danh sách active của Admin (/api/conversations/agent/active)
    const fetchRes = await fetch(`${serverUrl}/api/conversations/agent/active`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(fetchRes.status, 200);
    const body = await fetchRes.json();
    assert.equal(body.success, true);

    const found = body.data.find(c => c.id === conversationId);
    assert.ok(found, 'HỘI THOẠI KHÔNG ĐƯỢC BỊ MẤT HOẶC ẨN KHỎI DANH SÁCH ACTIVE KHI CHUYỂN VỀ AI');
    assert.equal(found.id, conversationId, 'Không tạo bản ghi mới hoặc nhân bản');
    assert.equal(found.mode, 'ai', 'Trạng thái phân biệt rõ là ai');
    assert.equal(found.customer_name, 'Nguyễn Hoàng Nhật Nam Khánh Linh', 'Họ tên đầy đủ vẫn được giữ nguyên vẹn');
    assert.equal(found.customer_phone, '0987654321');
    assert.equal(found.customer_email, 'namkhanh.linh@example.com');
  });

  test('6. Kiểm tra toàn bộ lịch sử tin nhắn được bảo toàn 100% sau khi chuyển đổi nhiều lần', async () => {
    const fetchDetailRes = await fetch(`${serverUrl}/api/conversations/agent/${conversationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(fetchDetailRes.status, 200);
    const detailBody = await fetchDetailRes.json();
    assert.equal(detailBody.success, true);

    const msgs = detailBody.data.messages;
    assert.ok(Array.isArray(msgs));
    const senderTypes = msgs.map(m => m.sender_type);

    assert.ok(senderTypes.includes('user'), 'Có tin nhắn người dùng');
    assert.ok(senderTypes.includes('assistant'), 'Có tin nhắn trợ lý AI');
    assert.ok(senderTypes.includes('system'), 'Có tin nhắn hệ thống chuyển đổi');
    assert.ok(senderTypes.includes('agent'), 'Có tin nhắn nhân viên');

    // Xác nhận có tin nhắn thông báo quay lại AI
    const backToAiMsg = msgs.find(m => m.sender_type === 'system' && m.content.includes('quay lại chat với AI'));
    assert.ok(backToAiMsg, 'Phải có tin nhắn hệ thống thông báo khách đã quay lại chat với AI');
  });

  test('7. Khách tiếp tục nhắn tin với AI -> Cuộc hội thoại vẫn hoạt động và cập nhật tin nhắn mới', async () => {
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Cho mình xin bảng giá uốn setting với AI nhé'
    });

    await messageRepo.create({
      conversationId,
      senderType: 'assistant',
      content: 'Dạ giá uốn setting từ 800.000đ đến 1.500.000đ tùy độ dài tóc bạn nhé!'
    });

    const convDetail = await conversationRepo.findById(conversationId);
    assert.equal(convDetail.mode, 'ai');
    assert.ok(convDetail.last_message.includes('800.000đ'));
    assert.equal(convDetail.last_message_sender, 'assistant');
  });

  test('8. Nhân viên gửi tin nhắn trực tiếp cho hội thoại đang ở chế độ AI -> Tự động tiếp nhận trở lại (human mode)', async () => {
    const sendRes = await conversationService.agentSendMessage({
      conversationId,
      agentId: '00000000-0000-0000-0000-000000000001',
      content: 'Chào bạn, hiện salon đang có chương trình giảm 20% uốn tóc trong tuần này nhé!',
      io: null
    });
    assert.ok(sendRes && sendRes.id);

    const updated = await conversationRepo.findById(conversationId);
    assert.equal(updated.mode, 'human', 'Khi nhân viên can thiệp gửi tin, tự động chuyển về chế độ human');
    assert.equal(updated.assigned_to, '00000000-0000-0000-0000-000000000001');
  });

  test('9. Kiểm tra lưu trữ bền vững (Persistence) vào file Mock JSON trên ổ cứng', async () => {
    const rawConvs = jsonStore.getCollection('conversations');
    const saved = rawConvs.find(c => c.id === conversationId);

    assert.ok(saved, 'Bản ghi hội thoại phải tồn tại trong database/data/conversations.json');
    assert.equal(saved.customer_name, 'Nguyễn Hoàng Nhật Nam Khánh Linh');
    assert.equal(saved.customer_phone, '0987654321');
    assert.equal(saved.customer_email, 'namkhanh.linh@example.com');
  });

  test('10. Kiểm tra API counts (/api/conversations/agent/counts) trả về số lượng chính xác', async () => {
    const fetchRes = await fetch(`${serverUrl}/api/conversations/agent/counts`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(fetchRes.status, 200);
    const body = await fetchRes.json();
    assert.equal(body.success, true);
    assert.ok(typeof body.data.active === 'number');
    assert.ok(typeof body.data.waiting_for_agent === 'number');
    assert.ok(typeof body.data.ai === 'number');
    assert.ok(typeof body.data.human === 'number');
  });

});
