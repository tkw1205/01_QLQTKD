'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb, query } = require('./helpers');
const authService = require('../src/services/authService');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');

describe('Conversation & Staff Handoff Test Suite', () => {
  let staffToken1 = null;
  let staffToken2 = null;
  let staffUser1 = null;
  let staffUser2 = null;
  let createdConversationId = null;
  let guestSessionCookie = null;
  let guestSessionId = null;

  before(async () => {
    // 1. Staff 1 login
    const login1 = await authService.login('staff@example.com', 'Staff@123456');
    staffToken1 = login1.token;
    staffUser1 = login1.user;

    // 2. Staff 2 (admin account used as second agent) login
    const login2 = await authService.login('admin@example.com', 'Admin@123456');
    staffToken2 = login2.token;
    staffUser2 = login2.user;
  });

  after(async () => {
    if (createdConversationId) {
      await query('DELETE FROM messages WHERE conversation_id = $1', [createdConversationId]).catch(() => {});
      await query('DELETE FROM conversations WHERE id = $1', [createdConversationId]).catch(() => {});
    }
    await stopServer();
    await closeDb();
  });

  test('Tạo phiên chat khách vãng lai (guestSession)', async () => {
    // Gọi GET /api/conversations/current không truyền cookie
    const res = await apiRequest('/api/conversations/current');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.conversation, 'Should return conversation object');
    assert.equal(res.body.data.conversation.mode, 'ai', 'Initial mode should be ai');
    assert.ok(Array.isArray(res.body.data.messages), 'Messages should be an array');

    // Kiểm tra cookie guest_session được sinh tự động
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie, 'Response should set-cookie for guest session');
    assert.match(setCookie, /guest_session=[0-9a-f-]{36}/i);

    // Lưu lại session cookie cho các bài test tiếp theo
    const match = setCookie.match(/guest_session=([0-9a-f-]{36})/i);
    guestSessionId = match[1];
    guestSessionCookie = `guest_session=${guestSessionId}`;
    createdConversationId = res.body.data.conversation.id;
  });

  test('Gửi tin nhắn trong chế độ AI', async () => {
    assert.ok(createdConversationId);
    assert.ok(guestSessionCookie);

    const userMsg = 'Xin chào, tôi cần tư vấn máy chấm công';
    const res = await apiRequest(`/api/conversations/${createdConversationId}/chat`, {
      method: 'POST',
      cookie: guestSessionCookie,
      body: { message: userMsg },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.message, 'Should return assistant message');
    assert.equal(res.body.data.message.sender_type, 'assistant');
    assert.ok(res.body.data.message.content.length > 0);

    // Kiểm tra tin nhắn của người dùng và phản hồi của trợ lý đều được lưu trong DB
    const messages = await messageRepo.findByConversation(createdConversationId);
    const hasUserMsg = messages.some(m => m.sender_type === 'user' && m.content === userMsg);
    const hasAssistantMsg = messages.some(m => m.sender_type === 'assistant');

    assert.ok(hasUserMsg, 'User message should be saved in DB');
    assert.ok(hasAssistantMsg, 'Assistant message should be saved in DB');
  });

  test('Chuyển đổi trạng thái từ AI sang hàng đợi nhân viên (waiting_for_agent)', async () => {
    assert.ok(createdConversationId);
    assert.ok(guestSessionCookie);

    const res = await apiRequest(`/api/conversations/${createdConversationId}/switch-to-agent`, {
      method: 'POST',
      cookie: guestSessionCookie,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'waiting');
    assert.equal(res.body.data.conversation.mode, 'waiting_for_agent');

    // Kiểm tra trong DB trạng thái đã đổi thành waiting_for_agent
    const conv = await conversationRepo.findById(createdConversationId);
    assert.equal(conv.mode, 'waiting_for_agent');

    // Kiểm tra hệ thống tự động ghi nhận tin nhắn thông báo chuyển tiếp
    const messages = await messageRepo.findByConversation(createdConversationId);
    const hasSystemHandoff = messages.some(
      m => m.sender_type === 'system' && m.content.includes('yêu cầu kết nối với nhân viên')
    );
    assert.ok(hasSystemHandoff, 'Should insert system message indicating handoff request');
  });

  test('Nhân viên tiếp nhận (claim) và ngăn 2 nhân viên tiếp nhận cùng lúc', async () => {
    assert.ok(createdConversationId);
    assert.ok(staffToken1);
    assert.ok(staffToken2);

    // 1. Nhân viên 1 tiếp nhận hội thoại thành công
    const resClaim1 = await apiRequest(`/api/conversations/agent/${createdConversationId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken1}` },
    });

    assert.equal(resClaim1.status, 200);
    assert.equal(resClaim1.body.success, true);
    assert.equal(resClaim1.body.data.mode, 'human');
    assert.equal(resClaim1.body.data.assigned_to, staffUser1.id);

    // 2. Nhân viên 2 cố gắng tiếp nhận cùng một cuộc hội thoại -> Bị từ chối (409 Conflict)
    const resClaim2 = await apiRequest(`/api/conversations/agent/${createdConversationId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken2}` },
    });

    assert.equal(resClaim2.status, 409, 'Second agent claim must be rejected with 409 Conflict');
    assert.equal(resClaim2.body.success, false);
    assert.match(resClaim2.body.error, /not waiting|already claimed/i);
  });

  test('Bảo toàn lịch sử hội thoại khi chuyển kênh', async () => {
    assert.ok(createdConversationId);
    assert.ok(staffToken1);
    assert.ok(guestSessionCookie);

    // Nhân viên 1 gửi tin nhắn phản hồi tới khách hàng
    const agentMsgContent = 'Chào bạn! Mình là nhân viên hỗ trợ, mình có thể giúp gì cho bạn?';
    const resAgentMsg = await apiRequest(`/api/conversations/agent/${createdConversationId}/message`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken1}` },
      body: { message: agentMsgContent },
    });
    assert.equal(resAgentMsg.status, 200);

    // Khách hàng tải lại toàn bộ tin nhắn qua endpoint /messages
    const resMessages = await apiRequest(`/api/conversations/${createdConversationId}/messages`, {
      cookie: guestSessionCookie,
    });

    assert.equal(resMessages.status, 200);
    assert.equal(resMessages.body.success, true);

    const msgs = resMessages.body.data.messages;
    assert.ok(Array.isArray(msgs));
    assert.ok(msgs.length >= 4, 'Should contain user, assistant, system handoff, and agent messages');

    // Kiểm tra từng loại tin nhắn đều có mặt đầy đủ
    const types = msgs.map(m => m.sender_type);
    assert.ok(types.includes('user'), 'Must contain user messages');
    assert.ok(types.includes('assistant'), 'Must contain AI assistant messages');
    assert.ok(types.includes('system'), 'Must contain system transition messages');
    assert.ok(types.includes('agent'), 'Must contain staff agent messages');

    // Kiểm tra tin nhắn của agent xuất hiện chính xác
    const agentMsg = msgs.find(m => m.sender_type === 'agent');
    assert.equal(agentMsg.content, agentMsgContent);
  });
});
