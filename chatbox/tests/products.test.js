'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { apiRequest, stopServer, closeDb, signToken } = require('./helpers');
const productRepo = require('../src/repositories/productRepository');

describe('Product API Test Suite', () => {
  let seededProducts = [];
  let sampleProduct = null;
  let sampleCategory = null;

  before(async () => {
    // Ensure categories and products exist
    const categories = await productRepo.findAllCategories();
    if (categories.length > 0) {
      sampleCategory = categories[0];
    }
    const { rows } = await productRepo.findAll({ limit: 10 });
    seededProducts = rows;
    if (seededProducts.length > 0) {
      sampleProduct = seededProducts[0];
    }
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
});
