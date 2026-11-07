'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test, after } = require('node:test');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appointment-service-sync-'));
process.env.JSON_STORE_DATA_DIR = testDataDir;

const categories = [{
  id: 'category-hair',
  name: 'Chăm sóc tóc',
  is_active: true,
}];
const products = Array.from({ length: 51 }, (_, index) => ({
  id: `service-${index + 1}`,
  service_code: `DV${String(index + 1).padStart(3, '0')}`,
  category_id: categories[0].id,
  name: `Dịch vụ ${index + 1}`,
  slug: `dich-vu-${index + 1}`,
  status: 'active',
  duration: 30,
  staff_count: 1,
  prices_by_size: {
    S: { price: 100000, duration: 30 },
    M: { price: 120000, duration: 40 },
    L: { price: 140000, duration: 50 },
  },
}));
const workingHours = Object.fromEntries(
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .map(day => [day, { open: '08:00', close: '21:00', enabled: true }])
);

for (const [collection, data] of Object.entries({
  products,
  categories,
  appointments: [],
  users: [{ id: 'staff-1', role: 'staff', is_active: true, is_available: true }],
  business_settings: [
    { key: 'working_hours', value: workingHours },
    { key: 'slot_capacity', value: 5 },
  ],
  system_settings: [{ key: 'appointment_duration', value: 30 }],
})) {
  fs.writeFileSync(path.join(testDataDir, `${collection}.json`), JSON.stringify(data), 'utf8');
}

const jsonStore = require('../src/config/jsonStore');
const productRepository = require('../src/repositories/productRepository');
const appointmentRepository = require('../src/repositories/appointmentRepository');
const AppointmentServices = require('../public/admin/appointment-services');
const staffPage = fs.readFileSync(
  path.join(__dirname, '../public/admin/staff.html'),
  'utf8'
);

async function getCatalogFromRepository(url) {
  const parsedUrl = new URL(url, 'http://localhost');
  const { rows, total } = await productRepository.findAll({
    status: parsedUrl.searchParams.get('status') || undefined,
    page: Number(parsedUrl.searchParams.get('page')),
    limit: Number(parsedUrl.searchParams.get('limit')),
  });
  return { success: true, data: rows, meta: { total } };
}

async function reloadCatalog() {
  return AppointmentServices.loadCatalog(getCatalogFromRepository);
}

function futureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 45);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function createAppointment(productId, size = 'S') {
  return appointmentRepository.create({
    guestSessionId: 'sync-test-session',
    customerName: 'Khách kiểm thử',
    customerPhone: '0901234567',
    productId,
    productIds: [productId],
    productSizes: { [productId]: size },
    appointmentDate: futureDate(),
    appointmentTime: '12:00',
    durationMinutes: 1,
    status: 'confirmed',
  });
}

after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

describe('Đồng bộ dịch vụ với form thêm lịch hẹn', () => {
  test('TC01: Mở form lấy toàn bộ dịch vụ hoạt động từ API quản lý dịch vụ', async () => {
    const catalog = await reloadCatalog();
    assert.equal(catalog.length, 51);
    assert.ok(catalog.some(service => service.id === 'service-51'));
    assert.match(staffPage, /AppointmentServices\.loadCatalog\(url => Admin\.api\(url\)\)/);
    assert.match(staffPage, /await loadAvailableServices\(\)/);
  });

  test('TC02: Dịch vụ mới xuất hiện sau khi được thêm trong quản lý dịch vụ', async () => {
    const added = await productRepository.create({
      name: 'Dịch vụ mới',
      categoryId: categories[0].id,
      duration: 35,
      staffCount: 1,
      pricesBySize: { S: { price: 160000, duration: 35 } },
    });
    const catalog = await reloadCatalog();
    assert.ok(catalog.some(service => service.id === added.id));
  });

  test('TC03: Tên và nhóm dịch vụ mới nhất được tải lại khi mở form', async () => {
    await productRepository.update('service-2', { name: 'Tên dịch vụ vừa sửa' });
    jsonStore.saveCollection('categories', [{
      ...categories[0],
      name: 'Nhóm vừa cập nhật',
    }]);
    const service = (await reloadCatalog()).find(item => item.id === 'service-2');
    assert.equal(service.name, 'Tên dịch vụ vừa sửa');
    assert.equal(service.category_name, 'Nhóm vừa cập nhật');
  });

  test('TC04: Giá mới từ quản lý dịch vụ được dùng để tính tạm tính', async () => {
    await productRepository.update('service-2', {
      pricesBySize: {
        S: { price: 230000, duration: 30 },
        M: { price: 250000, duration: 40 },
      },
    });
    const catalog = await reloadCatalog();
    const totals = AppointmentServices.calculateTotals(catalog, ['service-2'], { 'service-2': 'S' });
    assert.equal(totals.price, 230000);
  });

  test('TC05: Thời lượng mới được tính lại theo dịch vụ và size', async () => {
    await productRepository.update('service-2', {
      pricesBySize: { S: { price: 230000, duration: 65 } },
    });
    const catalog = await reloadCatalog();
    const totals = AppointmentServices.calculateTotals(catalog, ['service-2'], { 'service-2': 'S' });
    assert.equal(totals.duration, 65);
  });

  test('TC06: Chọn nhiều dịch vụ cộng đúng giá, thời lượng và ID', async () => {
    const catalog = await reloadCatalog();
    const totals = AppointmentServices.calculateTotals(
      catalog,
      ['service-1', 'service-2'],
      { 'service-1': 'S', 'service-2': 'S' }
    );
    assert.deepEqual(totals.productSizes, { 'service-1': 'S', 'service-2': 'S' });
    assert.equal(totals.price, 330000);
    assert.equal(totals.duration, 95);
  });

  test('TC07: Bỏ chọn dịch vụ loại dịch vụ đó khỏi tổng tiền và thời lượng', async () => {
    const catalog = await reloadCatalog();
    const totals = AppointmentServices.calculateTotals(
      catalog,
      ['service-1'],
      { 'service-1': 'S', 'service-2': 'S' }
    );
    assert.equal(totals.price, 100000);
    assert.equal(totals.duration, 30);
  });

  test('TC08: Đổi size S sang M cập nhật đúng giá và thời lượng', async () => {
    const catalog = await reloadCatalog();
    const sizeS = AppointmentServices.calculateTotals(catalog, ['service-1'], { 'service-1': 'S' });
    const sizeM = AppointmentServices.calculateTotals(catalog, ['service-1'], { 'service-1': 'M' });
    assert.equal(sizeS.price, 100000);
    assert.equal(sizeM.price, 120000);
    assert.equal(sizeM.duration, 40);
  });

  test('TC09: Size không được dịch vụ hỗ trợ bị từ chối', async () => {
    const catalog = await reloadCatalog();
    assert.throws(
      () => AppointmentServices.calculateTotals(catalog, ['service-1'], { 'service-1': 'XL' }),
      /size hợp lệ/
    );
    await assert.rejects(
      () => createAppointment('service-1', 'XL'),
      error => error.code === 'SERVICE_SIZE_UNAVAILABLE'
    );

    jsonStore.saveCollection('products', [
      ...jsonStore.getCollection('products'),
      {
        id: 'service-without-size-tiers',
        name: 'Dịch vụ không có size',
        status: 'active',
        duration: 30,
        staff_count: 1,
        price: 50000,
        prices_by_size: null,
      },
    ]);
    await assert.rejects(
      () => createAppointment('service-without-size-tiers', 'S'),
      error => error.code === 'SERVICE_SIZE_UNAVAILABLE'
    );
  });

  test('TC10: Dịch vụ ngừng hoạt động không thể đặt lịch', async () => {
    await productRepository.update('service-3', { status: 'inactive' });
    assert.ok(!(await reloadCatalog()).some(service => service.id === 'service-3'));
    await assert.rejects(
      () => createAppointment('service-3'),
      error => error.code === 'INVALID_SERVICES'
    );
  });

  test('TC11: Dịch vụ không tồn tại không thể đặt lịch', async () => {
    await assert.rejects(
      () => createAppointment('service-missing'),
      error => error.code === 'INVALID_SERVICES'
    );
  });

  test('TC12: Lịch mới lưu ID và snapshot tên, nhóm, size, giá, thời lượng', async () => {
    const appointment = await createAppointment('service-1', 'M');
    assert.equal(appointment.product_id, 'service-1');
    assert.deepEqual(appointment.product_ids, ['service-1']);
    assert.equal(appointment.price, 120000);
    assert.equal(appointment.duration_minutes, 40);
    assert.deepEqual(appointment.service_snapshots, [{
      product_id: 'service-1',
      name: 'Dịch vụ 1',
      category_id: 'category-hair',
      category_name: 'Nhóm vừa cập nhật',
      size: 'M',
      price: 120000,
      duration_minutes: 40,
    }]);
  });

  test('TC13: Sửa dịch vụ không làm thay đổi snapshot của lịch cũ', async () => {
    const appointment = jsonStore.getCollection('appointments')[0];
    await productRepository.update('service-1', {
      name: 'Dịch vụ đổi tên sau này',
      pricesBySize: { M: { price: 390000, duration: 90 } },
      duration: 90,
    });
    const savedAppointment = await appointmentRepository.findById(appointment.id);
    assert.equal(savedAppointment.product_name, 'Dịch vụ 1');
    assert.equal(savedAppointment.price, 120000);
    assert.equal(savedAppointment.duration_minutes, 40);
    assert.equal(savedAppointment.service_snapshots[0].name, 'Dịch vụ 1');
    assert.equal(savedAppointment.service_snapshots[0].price, 120000);
    assert.equal(savedAppointment.service_snapshots[0].duration_minutes, 40);
  });

  test('TC14: Không có dịch vụ đủ điều kiện thì hiện thông báo phù hợp', async () => {
    const savedProducts = jsonStore.getCollection('products');
    jsonStore.saveCollection('products', []);
    try {
      const catalog = await reloadCatalog();
      assert.deepEqual(catalog, []);
      assert.equal(
        AppointmentServices.emptyMessage(catalog),
        'Không có dịch vụ nào đang hoạt động và đủ điều kiện đặt lịch.'
      );
      assert.match(staffPage, /AppointmentServices\.emptyMessage\(availableServices\)/);
    } finally {
      jsonStore.saveCollection('products', savedProducts);
    }
  });
});
