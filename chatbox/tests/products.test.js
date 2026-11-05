'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { apiRequest, stopServer, closeDb, signToken } = require('./helpers');
const productRepo = require('../src/repositories/productRepository');
const jsonStore = require('../src/config/jsonStore');
const standardSizeDescriptions = {
  S: 'Tóc ngắn (từ cằm trở lên)',
  M: 'Tóc lỡ (từ cằm đến ngang vai)',
  L: 'Tóc dài (từ ngang ngực trở xuống)',
};

function getFutureOpenSlot() {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const setting = jsonStore.getCollection('business_settings').find(item => item.key === 'working_hours');
  const workingHours = setting && typeof setting.value === 'string'
    ? JSON.parse(setting.value)
    : setting?.value || {};
  const date = new Date();
  date.setDate(date.getDate() + 30);

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const config = workingHours[dayNames[date.getDay()]];
    if (!config || config.enabled !== false) {
      return { appointmentDate: dateString, appointmentTime: config?.open || '08:30' };
    }
    date.setDate(date.getDate() + 1);
  }
  throw new Error('No open day found for service booking test');
}

describe('Product API Test Suite', () => {
  let sampleProduct = null;
  let sampleCategory = null;
  let savedServiceCodeSequence = null;

  before(async () => {
    // Ensure categories and products exist
    const categories = await productRepo.findAllCategories();
    if (categories.length > 0) {
      sampleCategory = categories[0];
    }
    const { rows } = await productRepo.findAll({ limit: 1000 });
    const codes = rows.map(product => product.service_code);
    assert.ok(codes.every(code => /^DV\d{3,}$/u.test(code)), 'Existing services should have persisted DV codes');
    assert.equal(new Set(codes.map(code => code.toUpperCase())).size, codes.length, 'Existing service codes should be unique');
    savedServiceCodeSequence = fs.readFileSync(
      path.join(jsonStore.DATA_DIR, 'service_code_sequence.json'),
      'utf8',
    );
    sampleProduct = rows.find(product => productRepo.hasConfiguredSizePrices(product)) || null;
  });

  test('Ảnh local được tham chiếu bởi dữ liệu dịch vụ đều tồn tại', async () => {
    const localImageProducts = jsonStore.getCollection('products').filter(product =>
      typeof product.image_url === 'string' && product.image_url.startsWith('/images/')
    );
    assert.ok(localImageProducts.length > 0);
    for (const product of localImageProducts) {
      const filePath = path.join(__dirname, '..', 'public', product.image_url.replace(/^\//u, ''));
      assert.equal(fs.existsSync(filePath), true, `${product.image_url} must exist`);
    }
  });

  test('Admin form and Customer catalog no longer expose flat service prices', async () => {
    const adminForm = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin', 'products.html'), 'utf8');
    const customerApi = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf8');
    const customerCatalog = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'product-catalog.js'), 'utf8');
    const customerPage = fs.readFileSync(path.join(__dirname, '..', 'public', 'products.html'), 'utf8');
    assert.doesNotMatch(adminForm, /prod-pricing-type|id="prod-price"|Giá trọn gói/u);
    assert.match(adminForm, /<meta charset="UTF-8">/iu);
    assert.match(customerPage, /<meta charset="UTF-8">/iu);
    assert.match(adminForm, /renderStandardSizeRow\('S'/u);
    assert.match(adminForm, /renderStandardSizeRow\('M'/u);
    assert.match(adminForm, /renderStandardSizeRow\('L'/u);
    assert.doesNotMatch(customerApi, /product\?\.price(?![A-Za-z0-9_])|pricing_type/u);
    assert.doesNotMatch(customerCatalog, /product\.price\b|pricing_type/u);
    assert.match(adminForm, /function suggestSizePrice\(size\)/u);
    assert.match(adminForm, /event\.target\.checked && !priceInput\.value\.trim\(\)/u);
  });

  test('Customer service cards stay compact and details use the existing API', () => {
    const catalog = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'product-catalog.js'), 'utf8');
    const cardRenderer = catalog.slice(catalog.indexOf('renderCards('), catalog.indexOf('bindDetailsModal('));
    assert.doesNotMatch(cardRenderer, /renderSizePrices|formatProductPrice|product\.duration/u);
    assert.match(cardRenderer, /data-product-detail-id/u);
    assert.match(catalog, /API\.get\(`\/api\/products\/\$\{encodeURIComponent\(productId\)\}`\)/u);
    assert.match(catalog, /this\.renderSizePrices\(product\)/u);
    assert.match(catalog, /product-price-unavailable/u);
  });

  test('Tất cả dịch vụ có giá S/M/L; giá cũ hợp lệ được giữ nguyên', () => {
    const allProducts = jsonStore.getCollection('products');
    assert.ok(allProducts.length > 0, 'Service data should be available');
    for (const product of allProducts) {
      for (const size of ['S', 'M', 'L']) {
        assert.ok(
          Number.isFinite(Number(product.prices_by_size?.[size]?.price))
            && Number(product.prices_by_size[size].price) > 0,
          `${product.service_code} should have a positive ${size} price`,
        );
        assert.equal(
          product.prices_by_size[size].description,
          standardSizeDescriptions[size],
          `${product.service_code} ${size} should store the exact UTF-8 description`,
        );
      }
    }

    const productByCode = new Map(allProducts.map(product => [product.service_code, product]));
    assert.deepEqual(
      ['S', 'M', 'L'].map(size => productByCode.get('DV001').prices_by_size[size].price),
      [30000, 30000, 35000],
    );
    assert.deepEqual(
      ['S', 'M', 'L'].map(size => productByCode.get('DV002').prices_by_size[size].price),
      [150000, 170000, 180000],
    );
    assert.equal(productByCode.get('DV003').prices_by_size.S.price, 180000);
    assert.deepEqual(
      ['S', 'M'].map(size => productByCode.get('DV026').prices_by_size[size].price),
      [229000, 249000],
    );

    const newlyPricedProducts = allProducts.filter(product =>
      /^DV00[4-9]$|^DV01[0-5]$|^DV042$/u.test(product.service_code)
    );
    const priceSchedules = new Set(newlyPricedProducts.map(product =>
      ['S', 'M', 'L'].map(size => product.prices_by_size[size].price).join(':')
    ));
    assert.ok(priceSchedules.size > 1, 'Generated demo rates should vary by service');
    for (const product of newlyPricedProducts) {
      assert.ok(product.prices_by_size.S.price < product.prices_by_size.M.price);
      assert.ok(product.prices_by_size.M.price < product.prices_by_size.L.price);
      for (const size of ['S', 'M', 'L']) {
        assert.equal(typeof product.prices_by_size[size].description, 'string');
        assert.ok(product.prices_by_size[size].description.trim());
      }
    }
    assert.ok(productByCode.get('DV003').prices_by_size.S.price < productByCode.get('DV003').prices_by_size.M.price);
    assert.ok(productByCode.get('DV003').prices_by_size.M.price < productByCode.get('DV003').prices_by_size.L.price);
    assert.ok(productByCode.get('DV026').prices_by_size.M.price < productByCode.get('DV026').prices_by_size.L.price);
  });

  after(async () => {
    await stopServer();
    await closeDb();
  });

  test('GET /api/products - Kiểm thử lấy danh sách sản phẩm công khai', async () => {
    const res = await apiRequest('/api/products');
    assert.equal(res.status, 200, 'Status code should be 200');
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data), 'Data should be an array');
    assert.ok(res.body.meta, 'Meta should be provided');
    assert.ok(res.body.meta.total >= 0, 'Total should be >= 0');
    assert.match(res.headers['cache-control'] || '', /no-store/i);
    assert.match(res.headers['content-type'] || '', /application\/json;\s*charset=utf-8/iu);
    assert.match(res.headers['content-security-policy'] || '', /img-src[^;]*https:/i);
    assert.ok(res.body.data.every(product => product.status === 'active'));
    for (const product of res.body.data) {
      for (const field of [
        'service_code', 'category_id', 'category_name', 'name', 'description',
        'image_url', 'duration', 'staff_count', 'status', 'prices_by_size', 'price_unit',
      ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(product, field), `Customer API must include ${field}`);
      }
      assert.equal(Object.prototype.hasOwnProperty.call(product, 'price'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(product, 'pricing_type'), false);
      for (const [size, tier] of Object.entries(product.prices_by_size || {})) {
        assert.equal(
          tier.description,
          standardSizeDescriptions[size],
          `${product.service_code} ${size} API description should be canonical UTF-8`,
        );
      }
    }

    const allStatusRequest = await apiRequest('/api/products?status=all&limit=50');
    assert.equal(allStatusRequest.status, 200);
    assert.ok(allStatusRequest.body.data.every(product => product.status === 'active'));
    assert.ok(
      allStatusRequest.body.data.length >= res.body.data.length,
      'Customer can page through every active service from the shared API',
    );
    const sizePricedProduct = allStatusRequest.body.data.find(product =>
      Object.keys(product.prices_by_size || {}).length > 0
    );
    assert.ok(sizePricedProduct, 'Customer API should include size-priced services');
    for (const tier of Object.values(sizePricedProduct.prices_by_size)) {
      assert.equal(typeof tier.description, 'string');
      assert.ok(tier.description.trim().length > 0);
    }

    const activeUnconfigured = jsonStore.getCollection('products').find(product =>
      product.status === 'active' && !productRepo.hasConfiguredSizePrices(product)
    );
    if (activeUnconfigured) {
      const hiddenFromList = await apiRequest(
        `/api/products?search=${encodeURIComponent(activeUnconfigured.name)}&limit=50`,
      );
      assert.equal(hiddenFromList.status, 200);
      assert.ok(hiddenFromList.body.data.every(product => product.id !== activeUnconfigured.id));
      const hiddenDetail = await apiRequest(`/api/products/${activeUnconfigured.id}`);
      assert.equal(hiddenDetail.status, 404);
    }
  });

  test('Danh sách quản lý sắp xếp theo mã dịch vụ tăng dần', async () => {
    const { rows } = await productRepo.findAll({
      status: 'all',
      page: 1,
      limit: 1000,
      sortBy: 'service_code',
    });
    const codes = rows.map(product => product.service_code);
    const sortedCodes = [...codes].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    assert.deepEqual(codes, sortedCodes);
    assert.equal(codes[0], 'DV001');
  });

  test('GET /api/products?search=... - Kiểm thử tìm kiếm sản phẩm theo từ khóa', async () => {
    assert.ok(sampleProduct, 'Should have a sample product for testing search');
    const keyword = sampleProduct.name.split(' ')[0];
    const res = await apiRequest(`/api/products?search=${encodeURIComponent(keyword)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const found = res.body.data.some(p =>
      p.name.toLowerCase().includes(keyword.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(keyword.toLowerCase()))
    );
    assert.ok(found, `At least one product should match search keyword "${keyword}"`);
  });

  test('GET /api/products?category=... - Kiểm thử lọc sản phẩm theo danh mục', async () => {
    if (!sampleCategory) return;
    const res = await apiRequest(`/api/products?category=${sampleCategory.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    for (const p of res.body.data) {
      assert.equal(p.category_id, sampleCategory.id, 'Product category_id must match requested category');
    }
  });

  test('GET /api/products/:id - Kiểm thử lấy chi tiết sản phẩm hợp lệ', async () => {
    assert.ok(sampleProduct, 'Sample product needed');
    const res = await apiRequest(`/api/products/${sampleProduct.id}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, sampleProduct.id);
    assert.equal(res.body.data.name, sampleProduct.name);
    assert.deepEqual(res.body.data.prices_by_size, sampleProduct.prices_by_size);
  });

  test('GET /api/products/:id - Kiểm thử lấy chi tiết sản phẩm không tồn tại (404)', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const res = await apiRequest(`/api/products/${nonExistentId}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /product not found/i);
  });

  test('POST /api/products - Kiểm thử phân quyền: người chưa đăng nhập không được thêm sản phẩm (401)', async () => {
    const res = await apiRequest('/api/products', {
      method: 'POST',
      body: {
        name: 'Unauthorized Product',
        price: 99000,
      },
    });

    assert.equal(res.status, 401, 'Should reject unauthenticated POST request with 401');
    assert.equal(res.body.success, false);
  });

  test('PUT /api/products/:id - Kiểm thử phân quyền: người chưa đăng nhập không được sửa sản phẩm (401)', async () => {
    const targetId = sampleProduct ? sampleProduct.id : '00000000-0000-0000-0000-000000000000';
    const res = await apiRequest(`/api/products/${targetId}`, {
      method: 'PUT',
      body: {
        name: 'Unauthorized Edit',
      },
    });

    assert.equal(res.status, 401, 'Should reject unauthenticated PUT request with 401');
    assert.equal(res.body.success, false);
  });

  test('Staff quản lý dịch vụ; khách chỉ xem dịch vụ hoạt động và không thể thay đổi dữ liệu', async () => {
    const staffHeaders = {
      Authorization: `Bearer ${signToken({ userId: '33333333-3333-3333-3333-333333333001', role: 'staff' })}`,
    };
    const customerHeaders = {
      Authorization: `Bearer ${signToken({ userId: '55555555-5555-5555-5555-555555555001', role: 'user' })}`,
    };
    const testName = `Dịch vụ đồng bộ ${Date.now()}`;
    let createdProductId;
    let createdAppointmentId;
    const extraProductIds = [];

    try {
      const { rows: existingProducts } = await productRepo.findAll({ status: 'all', limit: 1000 });
      const sequenceState = JSON.parse(fs.readFileSync(
        path.join(jsonStore.DATA_DIR, 'service_code_sequence.json'),
        'utf8',
      ));
      const previousMaximumCode = Math.max(
        sequenceState.last_code,
        ...existingProducts.map(product => Number(product.service_code.slice(2))),
      );
      const createRes = await apiRequest('/api/products', {
        method: 'POST',
        headers: staffHeaders,
        body: {
          name: testName,
          categoryId: sampleCategory?.id,
          duration: 30,
          staffCount: 2,
          service_code: 'DV999',
          imageUrl: '/images/test-service.jpg',
          prices_by_size: { S: { price: 100000, duration: 30 } },
          price_unit: 'tép',
        },
      });
      assert.equal(createRes.status, 201);
      createdProductId = createRes.body.data.id;
      assert.equal(createRes.body.data.service_code, `DV${String(previousMaximumCode + 1).padStart(3, '0')}`);
      assert.equal(createRes.body.data.duration, 30);
      assert.equal(createRes.body.data.staff_count, 2);
      assert.equal(createRes.body.data.image_url, '/images/test-service.jpg');
      assert.equal(createRes.body.data.prices_by_size.S.price, 100000);
      assert.equal(Object.prototype.hasOwnProperty.call(createRes.body.data, 'price'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(createRes.body.data, 'pricing_type'), false);

      const concurrentCreates = await Promise.all([1, 2].map(index =>
        apiRequest('/api/products', {
          method: 'POST',
          headers: staffHeaders,
          body: {
            name: `${testName} đồng thời ${index}`,
            categoryId: sampleCategory?.id,
            duration: 30,
            staffCount: 1,
            prices_by_size: { M: { price: 50000 } },
          },
        })
      ));
      for (const response of concurrentCreates) {
        assert.equal(response.status, 201);
        extraProductIds.push(response.body.data.id);
      }
      const concurrentCodes = concurrentCreates.map(response => response.body.data.service_code);
      assert.equal(new Set(concurrentCodes).size, 2, 'Concurrent service creation must not duplicate codes');
      assert.deepEqual(concurrentCodes, [
        `DV${String(previousMaximumCode + 2).padStart(3, '0')}`,
        `DV${String(previousMaximumCode + 3).padStart(3, '0')}`,
      ]);

      const deletedCode = concurrentCodes[0];
      const deleteRes = await apiRequest(`/api/products/${extraProductIds[0]}`, {
        method: 'DELETE',
        headers: staffHeaders,
      });
      assert.equal(deleteRes.status, 200);
      extraProductIds.shift();
      const deletedCustomerList = await apiRequest(
        `/api/products?search=${encodeURIComponent(`${testName} đồng thời 1`)}&status=all`,
      );
      assert.equal(deletedCustomerList.status, 200);
      assert.equal(deletedCustomerList.body.data.length, 0);
      const afterDeleteRes = await apiRequest('/api/products', {
        method: 'POST',
        headers: staffHeaders,
        body: {
          name: `${testName} sau khi xóa`,
          categoryId: sampleCategory?.id,
          duration: 30,
          staffCount: 1,
          prices_by_size: { M: { price: 50000 } },
        },
      });
      assert.equal(afterDeleteRes.status, 201);
      extraProductIds.push(afterDeleteRes.body.data.id);
      assert.equal(afterDeleteRes.body.data.service_code, `DV${String(previousMaximumCode + 4).padStart(3, '0')}`);
      assert.notEqual(afterDeleteRes.body.data.service_code, deletedCode);

      const updatedRes = await apiRequest(`/api/products/${createdProductId}`, {
        method: 'PUT',
        headers: staffHeaders,
        body: {
          name: `${testName} mới`,
          duration: 40,
          staff_count: 3,
          service_code: 'DV999',
          image_url: '/images/test-service-updated.jpg',
          prices_by_size: {
            S: { price: 110000, duration: 40 },
            L: { price: 180000, duration: 50 },
          },
        },
      });
      assert.equal(updatedRes.status, 200);
      assert.equal(updatedRes.body.data.service_code, createRes.body.data.service_code);

      const publicRes = await apiRequest(
        `/api/products?search=${encodeURIComponent(testName)}&status=all`,
        { headers: customerHeaders },
      );
      assert.equal(publicRes.status, 200);
      const publicProduct = publicRes.body.data.find(product => product.id === createdProductId);
      assert.ok(publicProduct, 'Customer should receive the changed service from the shared API');
      assert.equal(publicProduct.name, `${testName} mới`);
      assert.equal(publicProduct.service_code, createRes.body.data.service_code);
      assert.equal(publicProduct.duration, 40);
      assert.equal(publicProduct.staff_count, 3);
      assert.equal(publicProduct.image_url, '/images/test-service-updated.jpg');
      assert.equal(publicProduct.prices_by_size.L.price, 180000);
      assert.equal(Object.prototype.hasOwnProperty.call(publicProduct, 'price'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(publicProduct, 'pricing_type'), false);
      assert.equal(publicProduct.status, 'active');
      assert.equal(publicProduct.category_name, sampleCategory?.name);

      const { appointmentDate, appointmentTime } = getFutureOpenSlot();
      const missingSizeRes = await apiRequest('/api/appointments/hold', {
        method: 'POST',
        body: {
          appointmentDate,
          appointmentTime,
          productId: createdProductId,
          productSizes: {},
        },
      });
      assert.equal(missingSizeRes.status, 400);
      assert.equal(missingSizeRes.body.code, 'INVALID_SERVICE_SIZE');

      const unsupportedSizeRes = await apiRequest('/api/appointments/hold', {
        method: 'POST',
        body: {
          appointmentDate,
          appointmentTime,
          productId: createdProductId,
          productSizes: { [createdProductId]: 'XL' },
        },
      });
      assert.equal(unsupportedSizeRes.status, 400);
      assert.equal(unsupportedSizeRes.body.code, 'INVALID_SERVICE_SIZE');

      const bookingRes = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: 'Khách kiểm tra',
          customerPhone: '0901234567',
          productId: createdProductId,
          productIds: [createdProductId],
          productSizes: { [createdProductId]: 'L' },
          appointmentDate,
          appointmentTime,
          durationMinutes: 1,
          price: 1,
        },
      });
      assert.equal(bookingRes.status, 201);
      createdAppointmentId = bookingRes.body.data.id;
      assert.equal(bookingRes.body.data.price, 180000);
      assert.equal(bookingRes.body.data.duration_minutes, 50);
      assert.equal(bookingRes.body.data.product_sizes[createdProductId], 'L');

      const customerCreate = await apiRequest('/api/products', {
        method: 'POST',
        headers: customerHeaders,
        body: { name: 'Customer service' },
      });
      const customerUpdate = await apiRequest(`/api/products/${createdProductId}`, {
        method: 'PUT',
        headers: customerHeaders,
        body: { price: 1 },
      });
      const customerDelete = await apiRequest(`/api/products/${createdProductId}`, {
        method: 'DELETE',
        headers: customerHeaders,
      });
      assert.equal(customerCreate.status, 403);
      assert.equal(customerUpdate.status, 403);
      assert.equal(customerDelete.status, 403);

      const deactivateRes = await apiRequest(`/api/products/${createdProductId}`, {
        method: 'PUT',
        headers: staffHeaders,
        body: { status: 'inactive' },
      });
      assert.equal(deactivateRes.status, 200);

      const hiddenList = await apiRequest(
        `/api/products?search=${encodeURIComponent(testName)}&status=all`,
        { headers: customerHeaders },
      );
      assert.equal(hiddenList.status, 200);
      assert.equal(hiddenList.body.data.some(product => product.id === createdProductId), false);

      const hiddenDetail = await apiRequest(`/api/products/${createdProductId}`, {
        headers: customerHeaders,
      });
      assert.equal(hiddenDetail.status, 404);

      const staffHiddenDetail = await apiRequest(`/api/products/${createdProductId}`, {
        headers: staffHeaders,
      });
      assert.equal(staffHiddenDetail.status, 200);
      assert.equal(staffHiddenDetail.body.data.status, 'inactive');

      const rejectedBooking = await apiRequest('/api/appointments', {
        method: 'POST',
        body: {
          customerName: 'Khách kiểm tra',
          customerPhone: '0901234567',
          productId: createdProductId,
          appointmentDate: '2099-01-01',
          appointmentTime: '10:00',
        },
      });
      assert.equal(rejectedBooking.status, 400);
      assert.equal(rejectedBooking.body.code, 'INVALID_SERVICES');
    } finally {
      if (createdAppointmentId) {
        const appointments = jsonStore.getCollection('appointments');
        jsonStore.saveCollection('appointments', appointments.filter(appointment => appointment.id !== createdAppointmentId));
      }
      for (const productId of extraProductIds) await productRepo.deleteProduct(productId);
      if (createdProductId) await productRepo.deleteProduct(createdProductId);
      if (savedServiceCodeSequence !== null) {
        fs.writeFileSync(
          path.join(jsonStore.DATA_DIR, 'service_code_sequence.json'),
          savedServiceCodeSequence,
          'utf8',
        );
      }
    }
  });

  test('POST /api/products - Chỉ chấp nhận giá hợp lệ theo size S/M/L', async () => {
    const staffHeaders = {
      Authorization: `****** userId: '33333333-3333-3333-3333-333333333001', role: 'staff' })}`,
    };
    staffHeaders.Authorization = 'Bearer ' + signToken({ userId: '33333333-3333-3333-3333-333333333001', role: 'staff' });
    const basePayload = {
      name: `Dịch vụ validation ${Date.now()}`,
      categoryId: sampleCategory?.id,
      duration: 35,
      staffCount: 1,
    };
    const createdIds = [];
    const sequencePath = path.join(jsonStore.DATA_DIR, 'service_code_sequence.json');
    const originalSequence = fs.readFileSync(sequencePath, 'utf8');
    const tryCreate = async payload => apiRequest('/api/products', {
      method: 'POST',
      headers: staffHeaders,
      body: payload,
    });

    try {
      const singleSize = await tryCreate({
        ...basePayload,
        name: `${basePayload.name} size S`,
        prices_by_size: { S: { price: 95000 } },
      });
      assert.equal(singleSize.status, 201, JSON.stringify(singleSize.body));
      createdIds.push(singleSize.body.data.id);
      assert.deepEqual(Object.keys(singleSize.body.data.prices_by_size), ['S']);
      assert.equal(Object.prototype.hasOwnProperty.call(singleSize.body.data, 'price'), false);
      assert.equal(Object.prototype.hasOwnProperty.call(singleSize.body.data, 'pricing_type'), false);
      assert.equal(singleSize.body.data.description, null);
      assert.equal(singleSize.body.data.image_url, null);

      const multipleSizes = await tryCreate({
        ...basePayload,
        name: `${basePayload.name} size S và L`,
        prices_by_size: {
          S: { price: 95000 },
          L: { price: 125000 },
        },
      });
      assert.equal(multipleSizes.status, 201);
      createdIds.push(multipleSizes.body.data.id);
      assert.deepEqual(Object.keys(multipleSizes.body.data.prices_by_size), ['S', 'L']);

      const invalidCases = [
        [{ ...basePayload, name: '   ', prices_by_size: { S: { price: 95000 } } }, 'name'],
        [{ ...basePayload, categoryId: '', prices_by_size: { S: { price: 95000 } } }, 'category_id'],
        [{ ...basePayload, duration: 0, prices_by_size: { S: { price: 95000 } } }, 'duration'],
        [{ ...basePayload, staffCount: 1.5, prices_by_size: { S: { price: 95000 } } }, 'staff_count'],
        [{ ...basePayload, prices_by_size: {} }, 'prices_by_size'],
        [{ ...basePayload, prices_by_size: null }, 'prices_by_size'],
        [{ ...basePayload, prices_by_size: { S: { price: '' } } }, 'prices_by_size'],
        [{ ...basePayload, prices_by_size: { S: { price: -1 } } }, 'prices_by_size'],
        [{ ...basePayload, prices_by_size: { S: { price: 95000 }, M: { price: '' } } }, 'prices_by_size'],
        [{ ...basePayload, prices_by_size: { XS: { price: 95000 } } }, 'prices_by_size'],
        [{ ...basePayload, price: 125000, prices_by_size: { S: { price: 95000 } } }, 'price'],
        [{ ...basePayload, pricing_type: 'flat', prices_by_size: { S: { price: 95000 } } }, 'pricing_type'],
      ];
      for (const [payload, field] of invalidCases) {
        const response = await tryCreate(payload);
        assert.equal(response.status, 400, `Expected ${field} to be rejected`);
        assert.equal(response.body.field, field);
      }

      const changed = await apiRequest(`/api/products/${singleSize.body.data.id}`, {
        method: 'PUT',
        headers: staffHeaders,
        body: {
          name: singleSize.body.data.name,
          categoryId: sampleCategory.id,
          duration: 35,
          staffCount: 1,
          prices_by_size: {
            M: { price: 160000 },
            L: { price: 180000 },
          },
        },
      });
      assert.equal(changed.status, 200);
      assert.deepEqual(Object.keys(changed.body.data.prices_by_size), ['M', 'L']);

      const forbiddenFlatUpdate = await apiRequest(`/api/products/${singleSize.body.data.id}`, {
        method: 'PUT',
        headers: staffHeaders,
        body: {
          price: 155000,
        },
      });
      assert.equal(forbiddenFlatUpdate.status, 400);
      assert.equal(forbiddenFlatUpdate.body.field, 'price');

      const legacyProduct = jsonStore.getCollection('products')
        .find(product => product.service_code === 'DV002');
      assert.equal(legacyProduct.price, 180000, 'Migration preserves the old stored price');
      assert.deepEqual(Object.keys(legacyProduct.prices_by_size), ['S', 'M', 'L']);
      const legacyApiResponse = await apiRequest(`/api/products/${legacyProduct.id}`);
      assert.equal(legacyApiResponse.status, 200);
      assert.equal(Object.prototype.hasOwnProperty.call(legacyApiResponse.body.data, 'price'), false);

      assert.ok(
        jsonStore.getCollection('products').every(product => productRepo.hasConfiguredSizePrices(product)),
        'Every existing service should now be ready for the size-only catalog',
      );
    } finally {
      for (const id of createdIds) await productRepo.deleteProduct(id);
      fs.writeFileSync(sequencePath, originalSequence, 'utf8');
    }
  });
});
