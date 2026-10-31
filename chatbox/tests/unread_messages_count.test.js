'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('Unread Message Count & Status Lifecycle Test Suite', () => {
  let app;
  let server;
  let adminToken;
  let baseUrl;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const appModule = require('../src/app');
    app = appModule.app;
    server = appModule.server;

    await new Promise(resolve => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    const users = jsonStore.getCollection('users');
    const adminUser = users.find(u => u.role === 'admin');
    adminToken = signToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name,
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('Kiểm tra vòng đời đếm số tin nhắn chưa đọc cho Admin', async () => {
    const guestSession = 'guest-unread-' + Date.now();

    // 1. Tạo cuộc hội thoại mới
    const currentRes = await fetch(`${baseUrl}/api/conversations/current`, {
      headers: { 'x-guest-session': guestSession },
    });
    const currentJson = await currentRes.json();
    assert.equal(currentRes.status, 200);
    const conversationId = currentJson.data.conversation.id;
    assert.ok(conversationId);

    // Initial unread count = 0
    const initialConv = await conversationRepo.findById(conversationId);
    assert.equal(initialConv.unread_count, 0, 'Cuộc hội thoại ban đầu phải có unread_count = 0');

    // 2. Chuyển sang waiting và khách gửi 2 tin nhắn
    await conversationRepo.updateMode(conversationId, 'waiting_for_agent');
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Chào salon, mình cần tư vấn cắt tóc',
    });
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Mình có thể đặt lịch chiều nay được không?',
    });

    // unread_count phải là 2
    const convWith2 = await conversationRepo.findById(conversationId);
    assert.equal(convWith2.unread_count, 2, 'Sau khi khách gửi 2 tin nhắn, unread_count phải là 2');

    // 3. Admin tải danh sách chờ (GET /api/conversations/agent/waiting)
    const waitingRes = await fetch(`${baseUrl}/api/conversations/agent/waiting`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const waitingJson = await waitingRes.json();
    assert.equal(waitingRes.status, 200);
    const inList = waitingJson.data.find(c => c.id === conversationId);
    assert.ok(inList, 'Hội thoại phải xuất hiện trong danh sách chờ');
    assert.equal(inList.unread_count, 2, 'API danh sách phải trả về unread_count = 2');

    // 4. Admin mở cuộc hội thoại (GET /api/conversations/agent/:id) -> unread_count reset về 0
    const viewRes = await fetch(`${baseUrl}/api/conversations/agent/${conversationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const viewJson = await viewRes.json();
    assert.equal(viewRes.status, 200);
    assert.equal(viewJson.data.conversation.unread_count, 0, 'Sau khi Admin mở xem, unread_count phải là 0');

    // Kiểm tra trực tiếp database
    const convAfterView = await conversationRepo.findById(conversationId);
    assert.equal(convAfterView.unread_count, 0, 'Dữ liệu lưu trữ phải có unread_count = 0');

    // 5. Admin gửi tin nhắn trả lời (POST /api/conversations/agent/:id/message)
    const replyRes = await fetch(`${baseUrl}/api/conversations/agent/${conversationId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ message: 'Chào bạn, salon còn slot lúc 15h bạn nhé!' }),
    });
    const replyJson = await replyRes.json();
    assert.equal(replyRes.status, 200);
    assert.equal(replyJson.success, true);

    // Tin nhắn do Admin gửi KHÔNG làm tăng số tin chưa đọc
    const convAfterReply = await conversationRepo.findById(conversationId);
    assert.equal(convAfterReply.unread_count, 0, 'Tin nhắn do Admin gửi không được tính vào unread_count');

    // 6. Khách gửi thêm 1 tin nhắn mới
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Vâng, đặt cho mình lúc 15h nhé',
    });

    const convNewMsg = await conversationRepo.findById(conversationId);
    assert.equal(convNewMsg.unread_count, 1, 'Khách gửi tin nhắn mới thì unread_count tăng lên 1');

    // 7. Gọi endpoint đánh dấu đã đọc (POST /api/conversations/agent/:id/read)
    const markReadRes = await fetch(`${baseUrl}/api/conversations/agent/${conversationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const markReadJson = await markReadRes.json();
    assert.equal(markReadRes.status, 200);
    assert.equal(markReadJson.data.unreadCount, 0);

    const convFinal = await conversationRepo.findById(conversationId);
    assert.equal(convFinal.unread_count, 0, 'unread_count phải là 0 sau khi gọi endpoint read');
  });

  test('Kiểm tra đếm tin chưa đọc khi chuyển đổi giữa AI và Nhân viên & tải lại danh sách', async () => {
    const guestSession = 'guest-mode-switch-' + Date.now();

    // 1. Tạo cuộc hội thoại ở chế độ AI
    const currentRes = await fetch(`${baseUrl}/api/conversations/current`, {
      headers: { 'x-guest-session': guestSession },
    });
    const currentJson = await currentRes.json();
    const conversationId = currentJson.data.conversation.id;

    // Khách nhắn tin trong chế độ AI
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Cho mình xin giá uốn tóc',
    });
    // AI tự động trả lời
    await messageRepo.create({
      conversationId,
      senderType: 'assistant',
      content: 'Giá uốn tóc từ 400.000đ đến 800.000đ tùy độ dài tóc bạn nhé.',
    });

    // Admin kiểm tra danh sách AI (/api/conversations/agent/ai)
    const aiListRes = await fetch(`${baseUrl}/api/conversations/agent/ai`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const aiListJson = await aiListRes.json();
    const inAiList = aiListJson.data.find(c => c.id === conversationId);
    assert.ok(inAiList, 'Hội thoại phải có trong danh sách AI');
    assert.equal(inAiList.unread_count, 1, 'Chỉ tin nhắn từ khách (user) được tính là chưa đọc (1 tin), không tính tin của AI');

    // 2. Khách chuyển sang yêu cầu nhân viên hỗ trợ
    await conversationRepo.updateMode(conversationId, 'waiting_for_agent');
    await messageRepo.create({
      conversationId,
      senderType: 'system',
      content: 'Khách hàng đã yêu cầu kết nối với nhân viên tư vấn.',
    });
    await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: 'Mình cần nhân viên tư vấn thêm',
    });

    // unread_count lúc này là 2 (2 tin nhắn từ khách, không tính tin của AI hay tin của system)
    const activeListRes = await fetch(`${baseUrl}/api/conversations/agent/active`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const activeListJson = await activeListRes.json();
    const convInActive = await conversationRepo.findById(conversationId);
    assert.equal(convInActive.unread_count, 2, 'Tổng số tin nhắn chưa đọc từ khách phải là 2');

    // 3. Khách quay lại chat AI
    await conversationRepo.updateMode(conversationId, 'ai');
    await messageRepo.create({
      conversationId,
      senderType: 'system',
      content: 'Khách hàng đã quay lại chat với AI.',
    });

    const convAfterReturnAi = await conversationRepo.findById(conversationId);
    assert.equal(convAfterReturnAi.unread_count, 2, 'Số tin chưa đọc vẫn được bảo toàn chính xác sau khi chuyển đổi qua lại giữa AI và Nhân viên');

    // 4. Admin mở đọc
    const openRes = await fetch(`${baseUrl}/api/conversations/agent/${conversationId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(openRes.status, 200);

    const convCleared = await conversationRepo.findById(conversationId);
    assert.equal(convCleared.unread_count, 0, 'unread_count được xóa về 0 sau khi Admin xem');
  });
});
