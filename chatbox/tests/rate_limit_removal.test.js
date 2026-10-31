'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, apiRequest, stopServer, closeDb } = require('./helpers');

describe('Task 2: Rate Limit Removal Verification Test Suite', () => {
  before(async () => {
    await startServer();
  });
  after(async () => {
    await stopServer();
    await closeDb();
  });

  test('Gửi 100 request liên tục đến /health: 100% trả về 200, không có 429', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(apiRequest('/health'));
    }
    const results = await Promise.all(promises);
    assert.equal(results.length, 100);
    const statuses = results.map(r => r.status);
    const has429 = statuses.some(s => s === 429);
    assert.equal(has429, false, 'Không được có request nào trả về mã 429');
    assert.ok(statuses.every(s => s === 200), 'Tất cả 100 requests phải trả về 200 OK');
  });

  test('Gửi 100 request liên tục đến /api/products: 100% trả về 200, không có 429', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(apiRequest('/api/products'));
    }
    const results = await Promise.all(promises);
    assert.equal(results.length, 100);
    const statuses = results.map(r => r.status);
    const has429 = statuses.some(s => s === 429);
    assert.equal(has429, false, 'Không được có request nào trả về mã 429');
    assert.ok(statuses.every(s => s === 200), 'Tất cả 100 requests phải trả về 200 OK');
  });

  test('Gửi 60 request liên tiếp đến /api/auth/login: không bị 429, trả về 401 và sau đó đăng nhập thành công 200', async () => {
    for (let i = 1; i <= 60; i++) {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: 'wrong_user@example.com',
          password: 'WrongPassword@123',
        },
      });
      assert.notEqual(res.status, 429, `Request #${i} không được bị chặn 429 Too Many Requests`);
      assert.equal(res.status, 401, `Request #${i} phải trả về 401 do sai mật khẩu`);
    }

    // Đăng nhập thành công ngay sau 60 lần thất bại mà không bị khóa IP
    const validLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@example.com',
        password: 'Admin@123456',
      },
    });

    assert.equal(validLoginRes.status, 200, 'Đăng nhập với mật khẩu đúng phải thành công 200');
    assert.equal(validLoginRes.body.success, true);
    assert.ok(validLoginRes.body.data.token);
  });
});
