'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const app = require('../src/app');
const { apiRequest, stopServer, closeDb } = require('./helpers');

describe('Task 1: Separation of Customer Website and Admin Portal Auth & RBAC', () => {
  let server;
  let adminToken;
  let userToken;
  let receptionistToken;
  let staffToken;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    process.env.TEST_PORT = port;

    // Login Admin
    const adminRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'Admin@123456' },
    });
    assert.equal(adminRes.status, 200);
    adminToken = adminRes.body.data.token;
    assert.equal(adminRes.body.data.user.role, 'admin');

    // Login Receptionist
    const recepRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'receptionist@example.com', password: 'Receptionist@123456' },
    });
    assert.equal(recepRes.status, 200);
    receptionistToken = recepRes.body.data.token;
    assert.equal(recepRes.body.data.user.role, 'receptionist');

    // Login Staff
    const staffRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'staff@example.com', password: 'Staff@123456' },
    });
    assert.equal(staffRes.status, 200);
    staffToken = staffRes.body.data.token;
    assert.equal(staffRes.body.data.user.role, 'staff');

    // Register & Login Customer (User)
    const uniqueEmail = `test_customer_${Date.now()}@example.com`;
    const userRes = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email: uniqueEmail,
        password: 'Password@123456',
        name: 'Nguyen Van Khach',
        phone: '0987654321',
      },
    });
    assert.equal(userRes.status, 201);
    userToken = userRes.body.data.token;
    assert.equal(userRes.body.data.user.role, 'user');
  });

  after(async () => {
    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await stopServer();
    await closeDb();
  });

  test('1. Role User: GET /api/auth/me trả về user info với role "user"', async () => {
    const res = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.user.name, 'Nguyen Van Khach');
  });

  test('2. Role User cố truy cập tất cả các route quản trị /api/admin/* đều bị trả về 403 Forbidden', async () => {
    const userAuthHeader = { Authorization: `Bearer ${userToken}` };

    // Dashboard
    const dashRes = await apiRequest('/api/admin/dashboard', { headers: userAuthHeader });
    assert.equal(dashRes.status, 403, 'User must be forbidden from /api/admin/dashboard');

    // Staff list
    const staffRes = await apiRequest('/api/admin/staff', { headers: userAuthHeader });
    assert.equal(staffRes.status, 403, 'User must be forbidden from /api/admin/staff');

    // Staff create
    const createStaffRes = await apiRequest('/api/admin/staff', {
      method: 'POST',
      headers: userAuthHeader,
      body: { email: 'hacker@example.com', password: 'password', name: 'Hacker', role: 'admin' },
    });
    assert.equal(createStaffRes.status, 403, 'User must be forbidden from POST /api/admin/staff');

    // Notifications
    const notifRes = await apiRequest('/api/admin/notifications', { headers: userAuthHeader });
    assert.equal(notifRes.status, 403, 'User must be forbidden from /api/admin/notifications');

    const notifUnreadRes = await apiRequest('/api/admin/notifications/unread-count', { headers: userAuthHeader });
    assert.equal(notifUnreadRes.status, 403, 'User must be forbidden from /api/admin/notifications/unread-count');

    // Settings
    const settingsRes = await apiRequest('/api/settings', { headers: userAuthHeader });
    assert.equal(settingsRes.status, 403, 'User must be forbidden from /api/settings');
  });

  test('3. Admin và Staff truy cập hợp lệ /api/admin/dashboard và /api/admin/notifications', async () => {
    // Admin
    const adminDash = await apiRequest('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminDash.status, 200);
    assert.ok(adminDash.body.data.products);
    assert.ok(adminDash.body.data.appointments);

    // Staff
    const staffDash = await apiRequest('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert.equal(staffDash.status, 200);

    // Admin staff management
    const adminStaff = await apiRequest('/api/admin/staff', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminStaff.status, 200);
  });

  test('4. Phân quyền Receptionist: bị chặn tại staff, settings, nhưng được xem notifications và appointments', async () => {
    const recepAuthHeader = { Authorization: `Bearer ${receptionistToken}` };

    // Receptionist cannot access staff
    const staffRes = await apiRequest('/api/admin/staff', { headers: recepAuthHeader });
    assert.equal(staffRes.status, 403);

    // Receptionist cannot access settings
    const settingsRes = await apiRequest('/api/settings', { headers: recepAuthHeader });
    assert.equal(settingsRes.status, 403);

    // Receptionist can access notifications
    const notifRes = await apiRequest('/api/admin/notifications', { headers: recepAuthHeader });
    assert.equal(notifRes.status, 200);

    // Receptionist can view appointments list
    const apptsRes = await apiRequest('/api/appointments', { headers: recepAuthHeader });
    assert.equal(apptsRes.status, 200);
  });

  test('5. Độc lập phiên giữa Khách hàng và Admin: API khách hàng chỉ nhận diện User khi gửi customer_token', async () => {
    // Không gửi Bearer header (mô phỏng khách vãng lai)
    const guestMyRes = await apiRequest('/api/appointments/my');
    assert.equal(guestMyRes.status, 200);
    // Phải là danh sách session của guest, không chứa lịch của admin

    // Gửi customer_token của user
    const userApptsRes = await apiRequest('/api/appointments/my-appointments', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(userApptsRes.status, 200);

    // Nếu gửi token của Admin vào /api/appointments/my-appointments -> bị từ chối 403 vì Admin không phải khách
    const adminAsCustomerRes = await apiRequest('/api/appointments/my-appointments', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminAsCustomerRes.status, 403);
  });
});
