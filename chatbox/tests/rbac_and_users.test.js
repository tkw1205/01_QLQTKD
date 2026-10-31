'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb, signToken } = require('./helpers');
const authService = require('../src/services/authService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const userRepo = require('../src/repositories/userRepository');
const jsonStore = require('../src/config/jsonStore');

function getNextWeekday(daysAhead = 3) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('RBAC & User Management Test Suite', () => {
  let adminToken = null;
  let receptionistToken = null;
  let userToken = null;
  let userObj = null;
  let createdAppointmentId = null;
  const futureDate = getNextWeekday(4);

  before(async () => {
    // 1. Login Admin
    const adminLogin = await authService.login('admin@example.com', 'Admin@123456');
    adminToken = adminLogin.token;

    // 2. Login Receptionist
    const recLogin = await authService.login('receptionist@example.com', 'Receptionist@123456');
    receptionistToken = recLogin.token;
  });

  after(async () => {
    if (createdAppointmentId) {
      let appointments = appointmentRepo.findAll ? jsonStore.getCollection('appointments') : [];
      appointments = appointments.filter(a => a.id !== createdAppointmentId);
      jsonStore.saveCollection('appointments', appointments);
    }
    if (userObj && userObj.id) {
      let users = jsonStore.getCollection('users').filter(u => u.id !== userObj.id);
      jsonStore.saveCollection('users', users);
    }
    await stopServer();
    await closeDb();
  });

  test('1. Đăng ký tài khoản khách hàng mới (User)', async () => {
    const regEmail = `customer_${Date.now()}@example.com`;
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Trần Văn Khách Hàng',
        email: regEmail,
        phone: '0981112233',
        password: 'Password@123456',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token, 'Should return JWT token for new registered user');
    assert.equal(res.body.data.user.email, regEmail);
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.user.phone, '0981112233');

    userToken = res.body.data.token;
    userObj = res.body.data.user;
  });

  test('2. Khách hàng đã đăng nhập đặt lịch và liên kết tài khoản (user_id)', async () => {
    assert.ok(userToken);
    const res = await apiRequest('/api/appointments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: {
        customerName: userObj.name,
        customerPhone: userObj.phone,
        customerEmail: userObj.email,
        appointmentDate: futureDate,
        appointmentTime: '10:00',
        notes: 'Khách hàng đặt lịch tư vấn trực tiếp từ web',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.user_id, userObj.id, 'Appointment must be linked to logged-in user_id');
    assert.equal(res.body.data.customer_name, userObj.name);

    createdAppointmentId = res.body.data.id;
  });

  test('3. Khách hàng xem lịch sử đặt lịch của chính mình (/my-appointments)', async () => {
    assert.ok(userToken);
    const res = await apiRequest('/api/appointments/my-appointments', {
      headers: { Authorization: `Bearer ${userToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const found = res.body.data.some(a => a.id === createdAppointmentId);
    assert.ok(found, 'Should find the appointment booked by this user');
  });

  test('4. Nhân viên lễ tân (Receptionist) xem danh sách lịch hẹn và tìm kiếm/lọc', async () => {
    assert.ok(receptionistToken);
    const res = await apiRequest(`/api/appointments?date=${futureDate}`, {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });

    assert.equal(res.status, 200, 'Receptionist must be allowed to view appointments');
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  test('5. Nhân viên lễ tân (Receptionist) BỊ CHẶN khi cố sửa trạng thái lịch hoặc đổi lịch', async () => {
    assert.ok(receptionistToken);
    assert.ok(createdAppointmentId);

    // 1. Cố thay đổi trạng thái -> 403 Forbidden
    const resStatus = await apiRequest(`/api/appointments/${createdAppointmentId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: { status: 'confirmed' },
    });
    assert.equal(resStatus.status, 403, 'Receptionist must NOT be allowed to update appointment status');
    assert.equal(resStatus.body.success, false);

    // 2. Cố đổi giờ hẹn -> 403 Forbidden
    const resReschedule = await apiRequest(`/api/appointments/${createdAppointmentId}/reschedule`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        appointmentDate: futureDate,
        appointmentTime: '15:00',
      },
    });
    assert.equal(resReschedule.status, 403, 'Receptionist must NOT be allowed to reschedule appointment');
    assert.equal(resReschedule.body.success, false);
  });

  test('6. Nhân viên lễ tân (Receptionist) BỊ CHẶN khi cố truy cập quản lý nhân sự Admin', async () => {
    assert.ok(receptionistToken);
    const res = await apiRequest('/api/admin/staff', {
      headers: { Authorization: `Bearer ${receptionistToken}` },
    });
    assert.equal(res.status, 403, 'Receptionist must NOT access staff management');
    assert.equal(res.body.success, false);
  });

  test('7. Admin có toàn quyền duyệt trạng thái lịch hẹn', async () => {
    assert.ok(adminToken);
    assert.ok(createdAppointmentId);

    const res = await apiRequest(`/api/appointments/${createdAppointmentId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'confirmed' },
    });

    assert.equal(res.status, 200, 'Admin can confirm appointment');
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'confirmed');
  });
});
