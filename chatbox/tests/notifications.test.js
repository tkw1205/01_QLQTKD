'use strict';

const { test, describe, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const notificationRepo = require('../src/repositories/notificationRepository');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('Task 2: Admin Notification System Test Suite', () => {
  let app;
  let server;
  let adminToken;
  let staffToken;
  let baseUrl;

  before(async () => {
    process.env.NODE_ENV = 'test';
    const appModule = require('../src/app');
    app = appModule.app;
    server = appModule.server;

    // Listen on random port
    await new Promise(resolve => {
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    const users = jsonStore.getCollection('users');
    const adminUser = users.find(u => u.role === 'admin');
    const staffUser = users.find(u => u.role === 'staff');

    adminToken = signToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      name: adminUser.name,
    });

    staffToken = signToken({
      userId: staffUser.id,
      email: staffUser.email,
      role: staffUser.role,
      name: staffUser.name,
    });
  });

  beforeEach(() => {
    // Reset notifications collection
    jsonStore.saveCollection('notifications', []);
  });

  test('1. Repository: create, deduplication, unread count, getAll, markAsRead, markAllAsRead', async () => {
    // Create first notification
    const n1 = await notificationRepo.create({
      conversationId: 'conv-test-1',
      customerName: 'Khách A',
      lastMessage: 'Xin chào shop',
    });

    assert.ok(n1.id, 'id should exist');
    assert.equal(n1.conversation_id, 'conv-test-1');
    assert.equal(n1.customer_name, 'Khách A');
    assert.equal(n1.last_message, 'Xin chào shop');
    assert.equal(n1.is_read, false);
    assert.ok(n1.created_at);

    // Unread count should be 1
    assert.equal(await notificationRepo.getUnreadCount(), 1);

    // Deduplication test: Send another message in the same conversation while unread
    const n1Updated = await notificationRepo.create({
      conversationId: 'conv-test-1',
      customerName: 'Khách A',
      lastMessage: 'Shop có còn iPhone 15 không?',
    });

    // Should update existing notification instead of creating a second unread one
    assert.equal(n1Updated.id, n1.id);
    assert.equal(n1Updated.last_message, 'Shop có còn iPhone 15 không?');
    assert.equal(await notificationRepo.getUnreadCount(), 1);

    // Create notification for conversation 2
    const n2 = await notificationRepo.create({
      conversationId: 'conv-test-2',
      customerName: 'Khách B',
      lastMessage: 'Tư vấn giúp em với',
    });

    assert.notEqual(n2.id, n1.id);
    assert.equal(await notificationRepo.getUnreadCount(), 2);

    // getAll({ limit: 1 })
    const limited = await notificationRepo.getAll({ limit: 1 });
    assert.equal(limited.length, 1);

    // Mark n1 as read
    const readN1 = await notificationRepo.markAsRead(n1.id);
    assert.equal(readN1.is_read, true);
    assert.equal(await notificationRepo.getUnreadCount(), 1);

    // After n1 is read, if customer A sends a message again, a new notification is created
    const n3 = await notificationRepo.create({
      conversationId: 'conv-test-1',
      customerName: 'Khách A',
      lastMessage: 'Em đợi phản hồi ạ',
    });
    assert.notEqual(n3.id, n1.id);
    assert.equal(await notificationRepo.getUnreadCount(), 2);

    // markAllAsRead
    const markAllRes = await notificationRepo.markAllAsRead();
    assert.equal(markAllRes.updatedCount, 2);
    assert.equal(await notificationRepo.getUnreadCount(), 0);

    const allRead = await notificationRepo.getAll({ isRead: true });
    assert.equal(allRead.length, 3);
  });

  test('2. API routes: GET /unread-count, GET /, PUT /:id/read, PUT /read-all', async () => {
    // Populate test notifications
    const n1 = await notificationRepo.create({
      conversationId: 'conv-api-1',
      customerName: 'Khách API 1',
      lastMessage: 'Alo alo',
    });
    const n2 = await notificationRepo.create({
      conversationId: 'conv-api-2',
      customerName: 'Khách API 2',
      lastMessage: 'Báo giá',
    });

    // GET /api/admin/notifications/unread-count
    const countRes = await fetch(`${baseUrl}/api/admin/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const countData = await countRes.json();
    assert.equal(countRes.status, 200);
    assert.equal(countData.success, true);
    assert.equal(countData.data.count, 2);

    // GET /api/admin/notifications
    const listRes = await fetch(`${baseUrl}/api/admin/notifications?limit=10`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const listData = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(listData.success, true);
    assert.equal(listData.data.length, 2);

    // PUT /api/admin/notifications/:id/read
    const markOneRes = await fetch(`${baseUrl}/api/admin/notifications/${n1.id}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const markOneData = await markOneRes.json();
    assert.equal(markOneRes.status, 200);
    assert.equal(markOneData.success, true);
    assert.equal(markOneData.data.is_read, true);

    // Check count is now 1
    const countRes2 = await fetch(`${baseUrl}/api/admin/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const countData2 = await countRes2.json();
    assert.equal(countData2.data.count, 1);

    // PUT /api/admin/notifications/read-all
    const markAllRes = await fetch(`${baseUrl}/api/admin/notifications/read-all`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const markAllData = await markAllRes.json();
    assert.equal(markAllRes.status, 200);
    assert.equal(markAllData.success, true);

    // Check count is now 0
    const countRes3 = await fetch(`${baseUrl}/api/admin/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const countData3 = await countRes3.json();
    assert.equal(countData3.data.count, 0);
  });

  test('3. Unauthorized access is blocked without staff/admin token', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/admin/notifications`);
    assert.equal(unauthRes.status, 401);
  });

  test('4. Socket: guest_message and request_agent trigger notificationRepository and emit new_notification to agents room', async () => {
    const { io: ClientIO } = require('socket.io-client');
    const conversationRepo = require('../src/repositories/conversationRepository');

    // 1. Create a guest conversation in waiting_for_agent mode
    const guestSession = 'guest-session-notif-test-123';
    const conv = await conversationRepo.create({ guestSessionId: guestSession });
    await conversationRepo.updateCustomerInfo(conv.id, { customerName: 'Anh Minh Test' });
    await conversationRepo.updateMode(conv.id, 'waiting_for_agent');

    // 2. Connect agent socket
    const agentSocket = ClientIO(baseUrl, {
      auth: { token: staffToken },
      transports: ['websocket'],
    });

    // 3. Connect guest socket
    const guestSocket = ClientIO(baseUrl, {
      auth: { guestSession },
      transports: ['websocket'],
    });

    await new Promise((resolve) => {
      let count = 0;
      const done = () => { if (++count === 2) resolve(); };
      agentSocket.on('connect', done);
      guestSocket.on('connect', done);
    });

    // Join conversation on guest
    guestSocket.emit('join_conversation', { conversationId: conv.id });

    // Wait for agent to receive 'new_notification'
    const notificationPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for new_notification')), 4000);
      agentSocket.on('new_notification', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    // Guest sends message in waiting_for_agent mode
    guestSocket.emit('guest_message', {
      conversationId: conv.id,
      content: 'Chào admin, em muốn đặt mua điện thoại',
    });

    const receivedNotif = await notificationPromise;
    assert.ok(receivedNotif, 'Should receive notification data');
    assert.equal(receivedNotif.notification.customer_name, 'Anh Minh Test');
    assert.equal(receivedNotif.notification.last_message, 'Chào admin, em muốn đặt mua điện thoại');
    assert.equal(receivedNotif.notification.conversation_id, conv.id);
    assert.ok(receivedNotif.unreadCount >= 1);

    // Clean up sockets
    agentSocket.disconnect();
    guestSocket.disconnect();
  });

  after(async () => {
    if (server && server.listening) {
      await new Promise(r => server.close(r));
    }
  });
});
