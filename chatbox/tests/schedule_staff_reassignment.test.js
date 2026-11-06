'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');
const { apiRequest, stopServer, closeDb } = require('./helpers');
const authService = require('../src/services/authService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const jsonStore = require('../src/config/jsonStore');

describe('Schedule Management & Staff Drag-and-Drop Reassignment Test Suite', () => {
  let adminToken = null;
  let receptionistToken = null;
  let userToken = null;
  let staffList = [];
  let staff1 = null;
  let staff2 = null;
  let testAppt1 = null;
  let testAppt2 = null;

  const testDate = '2027-06-15';

  function getActiveService(slug) {
    const service = jsonStore.getCollection('products').find(product =>
      product.status === 'active' && product.slug === slug
    );
    assert.ok(service, `Active service ${slug} must exist`);
    return service;
  }

  before(async () => {
    // 1. Login Admin
    const adminLogin = await authService.login('admin@example.com', 'Admin@123456');
    adminToken = adminLogin.token;

    // 2. Login Receptionist
    const recLogin = await authService.login('receptionist@example.com', 'Receptionist@123456');
    receptionistToken = recLogin.token;

    // 3. Register & Login Customer (User)
    const userReg = await authService.register({
      name: 'Khách Test RBAC',
      email: `test_user_${Date.now()}@example.com`,
      phone: '0901234567',
      password: 'User@123456',
    });
    userToken = userReg.token;

    // 4. Ensure at least 2 active staff members exist in database
    const users = jsonStore.getCollection('users');
    staff1 = users.find(u => u.role === 'staff' && u.is_active && u.name.includes('Hoàng Nam'));
    if (!staff1) {
      staff1 = {
        id: uuidv4(),
        name: 'Hoàng Nam (Master Stylist)',
        email: 'hoangnam_test@example.com',
        role: 'staff',
        is_active: true,
        created_at: new Date().toISOString()
      };
      users.push(staff1);
    }

    staff2 = users.find(u => u.role === 'staff' && u.is_active && u.name.includes('Thu Hà'));
    if (!staff2) {
      staff2 = {
        id: uuidv4(),
        name: 'Thu Hà (Colorist / Nhuộm)',
        email: 'thuha_test@example.com',
        role: 'staff',
        is_active: true,
        created_at: new Date().toISOString()
      };
      users.push(staff2);
    }
    jsonStore.saveCollection('users', users);

    // 5. Seed test appointments on testDate
    const appointments = jsonStore.getCollection('appointments');
    testAppt1 = {
      id: uuidv4(),
      booking_code: 'BK-TEST-001',
      customer_name: 'Khách Hàng A',
      customer_phone: '0912345678',
      customer_email: 'khachA@example.com',
      product_id: '22222222-2222-2222-2222-222222222001',
      appointment_date: testDate,
      appointment_time: '09:00',
      duration_minutes: 60,
      status: 'confirmed',
      staff_id: staff1.id,
      staff_name: staff1.name,
      notes: 'Cắt tóc layer',
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    testAppt2 = {
      id: uuidv4(),
      booking_code: 'BK-TEST-002',
      customer_name: 'Khách Hàng B',
      customer_phone: '0988776655',
      customer_email: null,
      product_id: '22222222-2222-2222-2222-222222222003',
      appointment_date: testDate,
      appointment_time: '09:30',
      duration_minutes: 60,
      status: 'confirmed',
      staff_id: staff2.id,
      staff_name: staff2.name,
      notes: 'Nhuộm tóc',
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    appointments.push(testAppt1, testAppt2);
    jsonStore.saveCollection('appointments', appointments);
  });

  after(async () => {
    // Cleanup test appointments
    const appointments = jsonStore.getCollection('appointments');
    const filtered = appointments.filter(a => a.appointment_date !== testDate);
    jsonStore.saveCollection('appointments', filtered);

    await stopServer();
    await closeDb();
  });

  test('1. Lấy danh sách nhân viên hoạt động cho màn hình Schedule (Admin & Lễ tân)', async () => {
    // 1.1 Admin gọi API active-staff
    const adminRes = await apiRequest('/api/appointments/active-staff', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.success, true);
    assert.ok(Array.isArray(adminRes.body.data));
    assert.ok(adminRes.body.data.length >= 2, 'Phải có ít nhất 2 nhân viên hoạt động');
    staffList = adminRes.body.data;

    // 1.2 Lễ tân cũng có quyền xem danh sách active-staff
    const recepRes = await apiRequest('/api/appointments/active-staff', {
      headers: { Authorization: `Bearer ${receptionistToken}` }
    });
    assert.equal(recepRes.status, 200);
    assert.equal(recepRes.body.success, true);

    // 1.3 Khách hàng thường (User) bị chặn
    const userRes = await apiRequest('/api/appointments/active-staff', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(userRes.status, 403, 'Khách hàng không được truy cập danh sách nhân viên nội bộ');
  });

  test('2. Thao tác kéo thả: Phân công lịch hẹn cho nhân viên mới thành công và ghi nhận Audit History', async () => {
    const targetStaff = staffList.find(s => s.id !== testAppt1.staff_id && s.id !== testAppt2.staff_id);
    assert.ok(targetStaff, 'Cần có nhân viên trống để phân công');

    // Lễ tân kéo thả lịch hẹn testAppt1 sang targetStaff
    const res = await apiRequest(`/api/appointments/${testAppt1.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: { staffId: targetStaff.id }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.staff_id, targetStaff.id);
    assert.equal(res.body.data.staff_name, targetStaff.name);

    // Kiểm tra thông tin khác của lịch hẹn được bảo toàn nguyên vẹn
    assert.equal(res.body.data.customer_name, testAppt1.customer_name);
    assert.equal(res.body.data.appointment_date, testAppt1.appointment_date);
    assert.equal(res.body.data.appointment_time, testAppt1.appointment_time);
    assert.equal(res.body.data.duration_minutes, testAppt1.duration_minutes);

    // Kiểm tra Audit History ghi nhận đầy đủ người thực hiện và thời gian
    assert.ok(Array.isArray(res.body.data.history));
    const lastAudit = res.body.data.history[res.body.data.history.length - 1];
    assert.equal(lastAudit.action, 'reassign_staff');
    assert.equal(lastAudit.new_staff_id, targetStaff.id);
    assert.ok(lastAudit.changed_by, 'Phải có tên người thực hiện thay đổi');
    assert.ok(lastAudit.changed_at, 'Phải có thời gian thay đổi');
  });

  test('3. Ngăn chặn xung đột lịch hẹn: Không cho phân công nếu nhân viên nhận đã có lịch trùng thời gian', async () => {
    // testAppt1 (09:00 - 10:00) và testAppt2 (09:30 - 10:30) trùng khung giờ 09:30 - 10:00!
    // Thử kéo testAppt1 sang nhân viên của testAppt2 (testAppt2.staff_id)
    const res = await apiRequest(`/api/appointments/${testAppt1.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { staffId: testAppt2.staff_id }
    });

    // Phải trả về 409 Conflict với mã STAFF_TIME_CONFLICT
    assert.equal(res.status, 409, 'Phải từ chối phân công khi bị trùng giờ');
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'STAFF_TIME_CONFLICT');
    assert.match(res.body.error, /đã có lịch hẹn|trùng thời gian/i);

    // Kiểm tra trong DB: lịch hẹn vẫn giữ nguyên nhân viên ban đầu, không bị thay đổi
    const checkAppt = await appointmentRepo.findById(testAppt1.id);
    assert.notEqual(checkAppt.staff_id, testAppt2.staff_id);
  });

  test('4. Từ chối phân công cho nhân viên đã bị vô hiệu hóa (is_active: false)', async () => {
    // Tạo hoặc khóa tạm thời một nhân viên
    const users = jsonStore.getCollection('users');
    const inactiveStaff = {
      id: uuidv4(),
      name: 'Nhân Viên Đã Nghỉ Việc',
      email: 'inactive_staff@example.com',
      role: 'staff',
      is_active: false,
      created_at: new Date().toISOString()
    };
    users.push(inactiveStaff);
    jsonStore.saveCollection('users', users);

    const res = await apiRequest(`/api/appointments/${testAppt1.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { staffId: inactiveStaff.id }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /khóa hoặc ngừng hoạt động/i);
  });

  test('5. Phân quyền: Khách hàng (User) không có quyền phân công nhân viên', async () => {
    const res = await apiRequest(`/api/appointments/${testAppt1.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { staffId: testAppt2.staff_id }
    });

    assert.equal(res.status, 403, 'Khách hàng phải nhận 403 Forbidden');
    assert.equal(res.body.success, false);
  });

  test('6. Kéo thả đổi giờ trong cùng một nhân viên: Cập nhật thời gian mới, giữ nguyên nhân viên, ghi audit reschedule_time', async () => {
    // testAppt2 đang ở 09:30 với staff2, kéo sang 11:30 cùng staff2
    const res = await apiRequest(`/api/appointments/${testAppt2.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        staffId: testAppt2.staff_id,
        appointmentTime: '11:30'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.appointment_time, '11:30');
    assert.equal(res.body.data.staff_id, testAppt2.staff_id);

    // Kiểm tra Audit History
    const lastAudit = res.body.data.history[res.body.data.history.length - 1];
    assert.equal(lastAudit.action, 'reschedule_time');
    assert.equal(lastAudit.old_time, '09:30');
    assert.equal(lastAudit.new_time, '11:30');
    assert.equal(lastAudit.new_staff_id, testAppt2.staff_id);
  });

  test('7. Kéo thả kết hợp: Thay đổi đồng thời cả nhân viên phụ trách VÀ thời gian hẹn (reschedule_and_reassign)', async () => {
    // Kéo testAppt2 (hiện tại 11:30, staff2) sang staffList[0] lúc 14:00
    const targetStaff1 = staffList[0];
    const res = await apiRequest(`/api/appointments/${testAppt2.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        staffId: targetStaff1.id,
        appointmentTime: '14:00'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.appointment_time, '14:00');
    assert.equal(res.body.data.staff_id, targetStaff1.id);

    const lastAudit = res.body.data.history[res.body.data.history.length - 1];
    assert.equal(lastAudit.action, 'reschedule_and_reassign');
    assert.equal(lastAudit.old_time, '11:30');
    assert.equal(lastAudit.new_time, '14:00');
    assert.equal(lastAudit.new_staff_id, targetStaff1.id);
    assert.equal(lastAudit.old_staff_id, staff2.id);
  });

  test('8. Giờ hoạt động của salon: Từ chối lịch bắt đầu trước giờ mở cửa hoặc kết thúc sau giờ đóng cửa', async () => {
    // 8.1 Giờ bắt đầu 08:00 (salon mở cửa lúc 08:30) -> Từ chối 400
    const earlyRes = await apiRequest(`/api/appointments/${testAppt2.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        staffId: testAppt1.staff_id,
        appointmentTime: '08:00'
      }
    });
    assert.equal(earlyRes.status, 400);
    assert.equal(earlyRes.body.success, false);
    assert.match(earlyRes.body.error, /ngoài giờ mở cửa/i);

    // 8.2 Giờ hẹn 20:30 với duration 60p -> Kết thúc 21:30 vượt quá giờ đóng cửa 20:30 -> Từ chối 400
    const lateRes = await apiRequest(`/api/appointments/${testAppt2.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        staffId: testAppt1.staff_id,
        appointmentTime: '20:30'
      }
    });
    assert.equal(lateRes.status, 400);
    assert.equal(lateRes.body.success, false);
    assert.match(lateRes.body.error, /vượt quá giờ đóng cửa/i);
  });

  test('9. Kiểm tra sức chứa slot (Slot Capacity): Từ chối khi khung giờ đã kín chỗ', async () => {
    // Cấu hình slot_capacity tạm thời là 2 cho test
    const businessSettings = jsonStore.getCollection('business_settings');
    let capSetting = businessSettings.find(s => s.key === 'slot_capacity');
    if (!capSetting) {
      capSetting = { key: 'slot_capacity', value: '2', updated_at: new Date().toISOString() };
      businessSettings.push(capSetting);
    } else {
      capSetting.value = '2';
    }
    jsonStore.saveCollection('business_settings', businessSettings);

    // Tạo 2 lịch hẹn khác chiếm trọn slot 15:00 - 16:00 trên testDate
    const appointments = jsonStore.getCollection('appointments');
    const filler1 = {
      id: uuidv4(),
      appointment_date: testDate,
      appointment_time: '15:00',
      duration_minutes: 60,
      status: 'confirmed',
      staff_id: 'some-other-staff-1',
      created_at: new Date().toISOString()
    };
    const filler2 = {
      id: uuidv4(),
      appointment_date: testDate,
      appointment_time: '15:00',
      duration_minutes: 60,
      status: 'confirmed',
      staff_id: 'some-other-staff-2',
      created_at: new Date().toISOString()
    };
    appointments.push(filler1, filler2);
    jsonStore.saveCollection('appointments', appointments);

    // Thử chuyển testAppt2 vào khung giờ 15:00 (vượt quá capacity 2)
    const res = await apiRequest(`/api/appointments/${testAppt2.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        staffId: testAppt2.staff_id,
        appointmentTime: '15:00'
      }
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'SLOT_CAPACITY_EXCEEDED');
    assert.match(res.body.error, /sức chứa tối đa/i);

    // Dọn dẹp cấu hình slot_capacity
    const bsIndex = businessSettings.findIndex(s => s.key === 'slot_capacity');
    if (bsIndex !== -1) businessSettings.splice(bsIndex, 1);
    jsonStore.saveCollection('business_settings', businessSettings);
  });

  test('10. Từ chối thay đổi đối với lịch hẹn đã bị hủy hoặc đã hoàn thành', async () => {
    const appointments = jsonStore.getCollection('appointments');
    const cancelledAppt = {
      id: uuidv4(),
      appointment_date: testDate,
      appointment_time: '16:00',
      duration_minutes: 30,
      status: 'cancelled',
      staff_id: testAppt1.staff_id,
      created_at: new Date().toISOString()
    };
    const completedAppt = {
      id: uuidv4(),
      appointment_date: testDate,
      appointment_time: '16:30',
      duration_minutes: 30,
      status: 'completed',
      staff_id: testAppt1.staff_id,
      created_at: new Date().toISOString()
    };
    appointments.push(cancelledAppt, completedAppt);
    jsonStore.saveCollection('appointments', appointments);

    const cancelRes = await apiRequest(`/api/appointments/${cancelledAppt.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { staffId: testAppt2.staff_id, appointmentTime: '17:00' }
    });
    assert.equal(cancelRes.status, 400);
    assert.match(cancelRes.body.error, /đã bị hủy/i);

    const completeRes = await apiRequest(`/api/appointments/${completedAppt.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { staffId: testAppt2.staff_id, appointmentTime: '17:00' }
    });
    assert.equal(completeRes.status, 400);
    assert.match(completeRes.body.error, /đã hoàn thành/i);
  });

  test('11. Tính toàn vẹn dữ liệu: Khi thay đổi thất bại, không lưu bất kỳ thay đổi nào vào DB', async () => {
    const originalAppt = await appointmentRepo.findById(testAppt1.id);

    // Thử gửi yêu cầu lỗi (trùng giờ)
    await apiRequest(`/api/appointments/${testAppt1.id}/assign`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { staffId: testAppt2.staff_id, appointmentTime: testAppt2.appointment_time }
    });

    const checkAppt = await appointmentRepo.findById(testAppt1.id);
    assert.equal(checkAppt.appointment_time, originalAppt.appointment_time);
    assert.equal(checkAppt.staff_id, originalAppt.staff_id);
    assert.equal(checkAppt.updated_at, originalAppt.updated_at);
  });

  // ─── BỔ SUNG: TẠO LỊCH HẸN TRỰC TIẾP TRÊN SCHEDULE ───
  test('12. Tạo lịch hẹn trực tiếp trên Schedule (Multi-service): Tính tổng thời lượng, tổng giá, lưu thợ & confirmed', async () => {
    const p1 = getActiveService('cat-tao-kieu');
    const p2 = getActiveService('goi-dau');
    const productSizes = { [p1.id]: 'M', [p2.id]: 'M' };

    const res = await apiRequest('/api/appointments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerName: 'Trần Văn Minh',
        customerPhone: '0933112233',
        customerEmail: 'minh.tran@example.com',
        productIds: [p1.id, p2.id],
        productSizes,
        appointmentDate: testDate,
        appointmentTime: '13:00',
        staffId: staff1.id,
        notes: 'Khách VIP đặt tại quầy',
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.customer_name, 'Trần Văn Minh');
    assert.equal(data.customer_phone, '0933112233');
    assert.equal(data.customer_email, 'minh.tran@example.com');
    assert.equal(data.staff_id, staff1.id);
    assert.equal(data.status, 'confirmed');

    const expectedDuration = [p1, p2].reduce((total, service) =>
      total + (Number(service.prices_by_size?.[productSizes[service.id]]?.duration ?? service.duration_minutes ?? service.duration) || 30), 0);
    const expectedPrice = [p1, p2].reduce((total, service) =>
      total + (Number(service.prices_by_size?.[productSizes[service.id]]?.price ?? service.price) || 0), 0);
    assert.equal(data.duration_minutes, expectedDuration);
    assert.equal(data.price, expectedPrice);
    assert.ok(data.product_name.includes(p1.name) && data.product_name.includes(p2.name));

    // Kiểm tra lịch sử khởi tạo
    assert.ok(Array.isArray(data.history) && data.history.length > 0);
    assert.equal(data.history[0].action, 'create');
  });

  test('13. Tạo lịch hẹn từ chối nếu thời gian kết thúc vượt quá giờ đóng cửa salon (20:30)', async () => {
    const p1 = getActiveService('cat-tao-kieu');

    const res = await apiRequest('/api/appointments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${receptionistToken}` },
      body: {
        customerName: 'Lê Văn Trễ',
        customerPhone: '0977889900',
        productIds: [p1.id],
        productSizes: { [p1.id]: 'M' },
        appointmentDate: testDate,
        appointmentTime: '20:15', // Size M cần 45 phút, vượt quá giờ đóng cửa 20:30.
        staffId: staff2.id
      }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /giờ đóng cửa/i);
  });

  test('14. Tạo lịch hẹn từ chối nếu thợ được chọn đã có lịch trùng giờ', async () => {
    const p1 = getActiveService('cat-tao-kieu');

    // staff1 đã có lịch hẹn ở test 12 lúc 13:00 (kéo dài đến 14:00)
    const res = await apiRequest('/api/appointments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerName: 'Khách Trùng Lịch',
        customerPhone: '0911223344',
        productIds: [p1.id],
        productSizes: { [p1.id]: 'M' },
        appointmentDate: testDate,
        appointmentTime: '13:15',
        staffId: staff1.id
      }
    });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'STAFF_TIME_CONFLICT');
    assert.match(res.body.error, /đã có lịch hẹn phục vụ khách/i);
  });

  test('15. Tạo lịch hẹn xuất hiện trên danh sách API quản lý /api/appointments?date=...', async () => {
    const res = await apiRequest(`/api/appointments?date=${testDate}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const createdAppt = res.body.data.find(a => a.customer_phone === '0933112233');
    assert.ok(createdAppt, 'Lịch hẹn vừa tạo phải có mặt trong kết quả API appointments');
    assert.equal(createdAppt.customer_name, 'Trần Văn Minh');
    assert.equal(createdAppt.staff_id, staff1.id);
  });
});
