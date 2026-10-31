'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb, query, signToken } = require('./helpers');
const { verifyToken } = require('../src/config/jwt');
const authService = require('../src/services/authService');

describe('Authentication & Authorization Test Suite', () => {
  let deactivatedUserId = null;
  const deactivatedEmail = `deactivated_${Date.now()}@example.com`;
  const deactivatedPassword = 'TestPassword@123';

  before(async () => {
    // Tạo tài khoản bị vô hiệu hóa (is_active = false)
    const user = await authService.createUser({
      email: deactivatedEmail,
      password: deactivatedPassword,
      name: 'Deactivated User',
      role: 'staff',
    });
    deactivatedUserId = user.id;
    await query('UPDATE users SET is_active = false WHERE id = $1', [deactivatedUserId]);
  });

  after(async () => {
    if (deactivatedUserId) {
      await query('DELETE FROM users WHERE id = $1', [deactivatedUserId]).catch(() => {});
    }
    await stopServer();
    await closeDb();
  });

  test('Kiểm thử đăng nhập thất bại khi sai mật khẩu / email không tồn tại', async () => {
    // 1. Email không tồn tại
    const resNoUser = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'nonexistent_user_9999@example.com',
        password: 'RandomPassword123!',
      },
    });
    assert.equal(resNoUser.status, 401);
    assert.equal(resNoUser.body.success, false);
    assert.match(resNoUser.body.error, /invalid credentials/i);

    // 2. Sai mật khẩu
    const resWrongPass = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'staff@example.com',
        password: 'CompletelyWrongPassword!',
      },
    });
    assert.equal(resWrongPass.status, 401);
    assert.equal(resWrongPass.body.success, false);
    assert.match(resWrongPass.body.error, /invalid credentials/i);

    // 3. Thiếu email hoặc mật khẩu
    const resMissing = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: '' },
    });
    assert.equal(resMissing.status, 400);
    assert.equal(resMissing.body.success, false);
  });

  test('Kiểm thử đăng nhập thành công với tài khoản staff/admin', async () => {
    // 1. Đăng nhập Staff
    const resStaff = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'staff@example.com',
        password: 'Staff@123456',
      },
    });

    assert.equal(resStaff.status, 200);
    assert.equal(resStaff.body.success, true);
    assert.ok(resStaff.body.data.token, 'Should return JWT token');
    assert.equal(resStaff.body.data.user.email, 'staff@example.com');
    assert.equal(resStaff.body.data.user.role, 'staff');
    assert.equal(typeof resStaff.body.data.user.password_hash, 'undefined', 'Password hash must be excluded');

    // Kiểm tra HTTP-only cookie
    const setCookie = resStaff.headers['set-cookie'];
    assert.ok(setCookie, 'Should set auth cookie');
    assert.match(setCookie, /token=/i);

    // 2. Đăng nhập Admin
    const resAdmin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@example.com',
        password: 'Admin@123456',
      },
    });

    assert.equal(resAdmin.status, 200);
    assert.equal(resAdmin.body.success, true);
    assert.ok(resAdmin.body.data.token);
    assert.equal(resAdmin.body.data.user.email, 'admin@example.com');
    assert.equal(resAdmin.body.data.user.role, 'admin');
  });

  test('Kiểm thử JWT token verification và kiểm tra tài khoản bị vô hiệu hóa', async () => {
    // 1. Kiểm tra xác thực token hợp lệ
    const dummyPayload = { userId: uuidv4(), role: 'staff' };
    const validToken = signToken(dummyPayload);
    const decoded = verifyToken(validToken);
    assert.equal(decoded.userId, dummyPayload.userId);
    assert.equal(decoded.role, dummyPayload.role);

    // 2. Kiểm tra token giả mạo/không hợp lệ
    assert.throws(
      () => {
        verifyToken('invalid.tampered.token');
      },
      (err) => {
        assert.ok(err);
        return true;
      }
    );

    // 3. Truy cập endpoint yêu cầu auth với token giả mạo -> 401
    const resUnauthorized = await apiRequest('/api/auth/me', {
      headers: { Authorization: 'Bearer fake.invalid.token' },
    });
    assert.equal(resUnauthorized.status, 401);
    assert.equal(resUnauthorized.body.success, false);

    // 4. Kiểm tra tài khoản bị vô hiệu hóa khi đăng nhập -> 403 Forbidden
    const resDeactivatedLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: deactivatedEmail,
        password: deactivatedPassword,
      },
    });
    assert.equal(resDeactivatedLogin.status, 403);
    assert.equal(resDeactivatedLogin.body.success, false);
    assert.match(resDeactivatedLogin.body.error, /deactivated/i);

    // 5. Kiểm tra tài khoản bị vô hiệu hóa khi gửi JWT hợp lệ -> 401 (bị middleware chặn)
    const deactivatedToken = signToken({ userId: deactivatedUserId, role: 'staff' });
    const resDeactivatedAccess = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${deactivatedToken}` },
    });
    assert.equal(resDeactivatedAccess.status, 401);
    assert.equal(resDeactivatedAccess.body.success, false);
    assert.match(resDeactivatedAccess.body.error, /deactivated/i);
  });
});
