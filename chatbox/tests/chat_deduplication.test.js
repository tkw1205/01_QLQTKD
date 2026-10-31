'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');
const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../src/config/jsonStore');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const conversationService = require('../src/services/conversationService');
const { apiRequest, signToken } = require('./helpers');

describe('Chat Message Deduplication & Concurrency Prevention Test Suite', () => {
  let server;
  let serverUrl;
  let guestSessionId = uuidv4();
  let conversationId;
  let staffToken;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    serverUrl = `http://127.0.0.1:${port}`;
    process.env.TEST_PORT = port;

    staffToken = signToken({ userId: '33333333-3333-3333-3333-333333333001', role: 'staff' });

    // Khởi tạo cuộc hội thoại
    const conv = await conversationService.getOrCreate(guestSessionId, null);
    conversationId = conv.id;
  });

  after(async () => {
    // Dọn dẹp test data
    if (conversationId) {
      const convs = jsonStore.getCollection('conversations').filter(c => c.id !== conversationId);
      jsonStore.saveCollection('conversations', convs);

      const msgs = jsonStore.getCollection('messages').filter(m => m.conversation_id !== conversationId);
      jsonStore.saveCollection('messages', msgs);
    }
    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Gửi tin nhắn một lần (đơn lẻ) -> Lưu chính xác 1 tin nhắn người dùng', async () => {
    const clientMsgId = `cmsg_${Date.now()}_1`;
    const res = await apiRequest(`/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      body: {
        message: 'Xin chào shop tư vấn giúp tôi',
        clientMessageId: clientMsgId,
      },
      cookie: `guest_session=${guestSessionId}`,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const msgs = await messageRepo.findByConversation(conversationId);
    const userMsgs = msgs.filter(m => m.sender_type === 'user' && m.content === 'Xin chào shop tư vấn giúp tôi');
    assert.equal(userMsgs.length, 1, 'Chỉ được phép có đúng 1 tin nhắn người dùng trong DB');
    assert.equal(userMsgs[0].metadata.clientMessageId, clientMsgId);
  });

  test('2. Ngăn trùng lặp khi người dùng click liên tục hoặc Enter nhanh (Duplicate Concurrency)', async () => {
    const clientMsgId = `cmsg_${Date.now()}_rapid`;
    const content = 'Tôi cần tư vấn bảng giá uốn tóc';

    // Mô phỏng 3 request gửi đồng thời với cùng clientMessageId hoặc nội dung trong tích tắc
    const [res1, res2, res3] = await Promise.all([
      apiRequest(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        body: { message: content, clientMessageId: clientMsgId },
        cookie: `guest_session=${guestSessionId}`,
      }),
      apiRequest(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        body: { message: content, clientMessageId: clientMsgId },
        cookie: `guest_session=${guestSessionId}`,
      }),
      apiRequest(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        body: { message: content, clientMessageId: clientMsgId },
        cookie: `guest_session=${guestSessionId}`,
      }),
    ]);

    // Tất cả đều trả về 200 không lỗi
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    assert.equal(res3.status, 200);

    // Ít nhất các request sau phát hiện trùng (duplicate = true)
    const duplicates = [res1.body.data?.duplicate, res2.body.data?.duplicate, res3.body.data?.duplicate].filter(Boolean);
    assert.ok(duplicates.length >= 2, 'Các request gửi trùng phải được phát hiện là duplicate');

    // Kiểm tra số lượng tin nhắn trong cơ sở dữ liệu
    const msgs = await messageRepo.findByConversation(conversationId);
    const userMsgs = msgs.filter(m => m.sender_type === 'user' && m.content === content);
    assert.equal(userMsgs.length, 1, 'Cơ sở dữ liệu chỉ được lưu duy nhất 1 tin nhắn, không nhân đôi');
  });

  test('3. Tin nhắn nhiều dòng (có newline \\n) không bị lỗi so sánh chuỗi như trong ảnh chụp thực tế', async () => {
    const multilineMsg = `Tôi muốn đặt lịch ngày mai\nvào lúc 10h30\ntên Nguyễn Văn An\nsdt: 123123\nemail :\nnguyenvanan@example.com`;
    const clientMsgId = `cmsg_${Date.now()}_multiline`;

    const [res1, res2] = await Promise.all([
      apiRequest(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        body: { message: multilineMsg, clientMessageId: clientMsgId },
        cookie: `guest_session=${guestSessionId}`,
      }),
      apiRequest(`/api/conversations/${conversationId}/chat`, {
        method: 'POST',
        body: { message: multilineMsg, clientMessageId: clientMsgId },
        cookie: `guest_session=${guestSessionId}`,
      }),
    ]);
    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    const hasDuplicate = res1.body.data?.duplicate || res2.body.data?.duplicate;
    assert.ok(hasDuplicate, 'Backend phải bắt được trùng lặp cho tin nhắn nhiều dòng');

    const msgs = await messageRepo.findByConversation(conversationId);
    const userMsgs = msgs.filter(m => m.sender_type === 'user' && m.content === multilineMsg);
    assert.equal(userMsgs.length, 1, 'Tin nhắn nhiều dòng chỉ được lưu đúng 1 lần');
  });

  test('4. Gửi nhiều tin nhắn liên tiếp với nội dung khác nhau -> Không bị gộp nhầm, lưu đủ 100%', async () => {
    const msgA = 'Câu hỏi thứ nhất của tôi';
    const msgB = 'Câu hỏi thứ hai của tôi';

    const resA = await apiRequest(`/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      body: { message: msgA, clientMessageId: `cmsg_${Date.now()}_a` },
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(resA.status, 200);
    assert.notEqual(resA.body.data?.duplicate, true);

    const resB = await apiRequest(`/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      body: { message: msgB, clientMessageId: `cmsg_${Date.now()}_b` },
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(resB.status, 200);
    assert.notEqual(resB.body.data?.duplicate, true);

    const msgs = await messageRepo.findByConversation(conversationId);
    const foundA = msgs.filter(m => m.sender_type === 'user' && m.content === msgA);
    const foundB = msgs.filter(m => m.sender_type === 'user' && m.content === msgB);
    assert.equal(foundA.length, 1);
    assert.equal(foundB.length, 1);
  });

  test('5. Tải lại lịch sử hội thoại (GET /messages) -> Bảo toàn lịch sử, không có tin nhắn trùng', async () => {
    const res = await apiRequest(`/api/conversations/${conversationId}/messages`, {
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const messages = res.body.data.messages;
    assert.ok(messages.length >= 4);

    // Kiểm tra không có 2 message user nào giống hệt nhau về ID
    const ids = messages.map(m => m.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'Không có bản ghi nào bị trùng lặp ID');
  });

  test('6. Chuyển đổi giữa Chat AI và Nhân viên không làm sinh tin nhắn trùng lặp', async () => {
    // Chuyển sang nhân viên
    const switchAgentRes = await apiRequest(`/api/conversations/${conversationId}/switch-to-agent`, {
      method: 'POST',
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(switchAgentRes.status, 200);
    assert.equal(switchAgentRes.body.data.conversation?.mode || switchAgentRes.body.data.mode, 'waiting_for_agent');

    // Chuyển lại về AI
    const switchAiRes = await apiRequest(`/api/conversations/${conversationId}/switch-to-ai`, {
      method: 'POST',
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(switchAiRes.status, 200);
    assert.equal(switchAiRes.body.data.mode, 'ai');

    // Khách tiếp tục gửi tin nhắn sau khi quay về AI
    const afterSwitchContent = 'Tôi quay lại hỏi AI câu này';
    const res = await apiRequest(`/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      body: { message: afterSwitchContent, clientMessageId: `cmsg_${Date.now()}_after` },
      cookie: `guest_session=${guestSessionId}`,
    });
    assert.equal(res.status, 200);

    const msgs = await messageRepo.findByConversation(conversationId);
    const found = msgs.filter(m => m.sender_type === 'user' && m.content === afterSwitchContent);
    assert.equal(found.length, 1, 'Tin nhắn gửi sau khi chuyển đổi chỉ xuất hiện 1 lần duy nhất');
  });
});
