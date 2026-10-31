'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb, signToken } = require('./helpers');
const authService = require('../src/services/authService');
const jsonStore = require('../src/config/jsonStore');

describe('Task 3: Auth Session Persistence & Rate Limiter Test Suite', () => {
  let adminToken = null;
  let adminUser = null;
  let receptionistToken = null;
  let receptionistUser = null;
  let customerToken = null;
  let customerUser = null;
  let customerCookie = null;
  let customerEmail = null;
  const customerPassword = 'CustomerPassword@123';

  before(async () => {
    // 1. Admin login
    const adminLogin = await authService.login('admin@example.com', 'Admin@123456');
    adminToken = adminLogin.token;
    adminUser = adminLogin.user;

    // 2. Receptionist login
    const recLogin = await authService.login('receptionist@example.com', 'Receptionist@123456');
    receptionistToken = recLogin.token;
    receptionistUser = recLogin.user;

    // 3. Register a test customer user
    customerEmail = `persistence_user_${Date.now()}@example.com`;
    const regRes = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Nguyễn Văn Kiên Định',
        email: customerEmail,
        password: customerPassword,
        phone: '0912345678',
      },
    });

    assert.equal(regRes.status, 201);
    customerToken = regRes.body.data.token;
    customerUser = regRes.body.data.user;

    // Extract cookie from registration
    const rawCookie = regRes.headers['set-cookie'];
    if (rawCookie) {
      customerCookie = rawCookie.split(';')[0];
    } else {
      customerCookie = `token=${customerToken}`;
    }
  });

  after(async () => {
    // Clean up created test customer
    if (customerUser && customerUser.id) {
      const users = jsonStore.getCollection('users').filter(u => u.id !== customerUser.id);
      jsonStore.saveCollection('users', users);
    }
    await stopServer();
    await closeDb();
  });

  test('1. Gọi /api/auth/me liên tục hơn 20 lần KHÔNG bị lỗi 429 và KHÔNG bị đăng xuất', async () => {
    const NUM_REQUESTS = 25;

    // 1a. Test với Admin qua Authorization Header
    for (let i = 1; i <= NUM_REQUESTS; i++) {
      const res = await apiRequest('/api/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(
        res.status,
        200,
        `Admin request #${i} failed with status ${res.status}: ${JSON.stringify(res.body)}`
      );
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.email, 'admin@example.com');
      assert.equal(res.body.data.user.role, 'admin');
    }

    // 1b. Test với Customer qua Cookie (mô phỏng người dùng F5 / reload trang 25 lần)
    for (let i = 1; i <= NUM_REQUESTS; i++) {
      const res = await apiRequest('/api/auth/me', {
        cookie: customerCookie,
      });

      assert.equal(
        res.status,
        200,
        `Customer cookie request #${i} failed with status ${res.status}: ${JSON.stringify(res.body)}`
      );
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.id, customerUser.id);
    }
  });

  test('2. Duy trì session và chuyển trang thông suốt cho Admin, Receptionist và User', async () => {
    // 2a. Admin Session qua các trang quản trị
    // - Dashboard check: /api/auth/me
    const adminMe = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminMe.status, 200);
    assert.equal(adminMe.body.data.user.role, 'admin');

    // - Profile page: /api/auth/profile
    const adminProfile = await apiRequest('/api/auth/profile', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminProfile.status, 200);

    // - Staff management page: /api/admin/staff
    const adminStaff = await apiRequest('/api/admin/staff', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminStaff.status, 200);
    assert.equal(adminStaff.body.success, true);

    // - Admin dashboard page: /api/admin/dashboard
    const adminDashboard = await apiRequest('/api/admin/dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminDashboard.status, 200);
    assert.equal(adminDashboard.body.success, true);

    // 2b. Receptionist Session qua trang Lịch hẹn
    // - Auth check: /api/auth/me
    const recMe = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(recMe.status, 200);
    assert.equal(recMe.body.data.user.role, 'receptionist');

    // - Appointments list page: /api/appointments
    const recAppts = await apiRequest('/api/appointments', {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(recAppts.status, 200);
    assert.equal(recAppts.body.success, true);

    // 2c. User Session: Chuyển trang & cập nhật hồ sơ
    // - Xem trang sản phẩm (public nhưng có gửi cookie)
    const userProducts = await apiRequest('/api/products', {
      cookie: customerCookie,
    });
    assert.equal(userProducts.status, 200);

    // - Xem lịch hẹn cá nhân
    const userAppts = await apiRequest('/api/appointments/my-appointments', {
      cookie: customerCookie,
    });
    assert.equal(userAppts.status, 200);
    assert.equal(userAppts.body.success, true);

    // - Cập nhật thông tin profile
    const updateRes = await apiRequest('/api/auth/profile', {
      method: 'PUT',
      cookie: customerCookie,
      body: { name: 'Nguyễn Văn Kiên Định (Đã Sửa)', phone: '0988776655' },
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.user.name, 'Nguyễn Văn Kiên Định (Đã Sửa)');

    // - Tải lại trang (F5): /api/auth/me phản ánh thông tin mới và phiên không bị mất
    const refreshedMe = await apiRequest('/api/auth/me', {
      cookie: customerCookie,
    });
    assert.equal(refreshedMe.status, 200);
    assert.equal(refreshedMe.body.data.user.name, 'Nguyễn Văn Kiên Định (Đã Sửa)');
  });

  test('3. Đồng bộ token giữa Cookie và Authorization Header, và xử lý Bearer null an toàn', async () => {
    // 3a. Chỉ dùng Authorization Header -> API tự đồng bộ cấp Set-Cookie
    const headerOnlyRes = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(headerOnlyRes.status, 200);
    assert.ok(headerOnlyRes.headers['set-cookie'], 'Nên set-cookie khi gọi me bằng Bearer header');

    // 3b. Trường hợp lỗi frontend truyền "Bearer null" nhưng có Cookie hợp lệ -> vẫn nhận diện được người dùng
    const fallbackRes = await apiRequest('/api/auth/me', {
      headers: { Authorization: 'Bearer null' },
      cookie: customerCookie,
    });
    assert.equal(fallbackRes.status, 200);
    assert.equal(fallbackRes.body.data.user.id, customerUser.id);

    // 3c. Đăng xuất: POST /api/auth/logout xóa sạch cookie
    const logoutRes = await apiRequest('/api/auth/logout', {
      method: 'POST',
      cookie: customerCookie,
    });
    assert.equal(logoutRes.status, 200);
    assert.ok(logoutRes.headers['set-cookie'], 'Logout phải xóa cookie');
    assert.match(logoutRes.headers['set-cookie'], /token=;/i);
  });

  test('Đăng nhập khách hàng đã đăng ký trả về token và đúng vai trò user', async () => {
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: customerEmail,
        password: customerPassword,
      },
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.ok(loginRes.body.data.token);
    assert.equal(loginRes.body.data.user.id, customerUser.id);
    assert.equal(loginRes.body.data.user.role, 'user');
    assert.ok(loginRes.headers['set-cookie']);
  });

  test('4. Không giới hạn request rate limit trên local: gửi nhiều lần đăng nhập sai liên tiếp KHÔNG bị chặn 429', async () => {
    const wrongEmail = `brute_victim_${Date.now()}@example.com`;

    // Gửi liên tiếp 25 lần đăng nhập sai -> tất cả đều trả về 401 Unauthorized, KHÔNG có phản hồi 429
    for (let i = 1; i <= 25; i++) {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: wrongEmail,
          password: 'WrongPassword@999',
        },
      });

      assert.equal(
        res.status,
        401,
        `Attempt #${i} should return 401 without rate limiting, got ${res.status}`
      );
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /invalid credentials/i);
    }

    // Xác nhận phiên làm việc của Admin (/api/auth/me) vẫn hoạt động bình thường (200)
    const adminCheck = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(
      adminCheck.status,
      200,
      'Endpoint /api/auth/me vẫn hoạt động bình thường'
    );
    assert.equal(adminCheck.body.success, true);
    assert.equal(adminCheck.body.data.user.role, 'admin');
  });
});
