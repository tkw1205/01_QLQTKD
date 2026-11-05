'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

const serviceCodeStatePath = path.join(jsonStore.DATA_DIR, 'service_code_sequence.json');
const serviceCodeLockPath = path.join(jsonStore.DATA_DIR, '.service-code.lock');
const standardSizeDescriptions = {
  S: 'Tóc ngắn (từ cằm trở lên)',
  M: 'Tóc lỡ (từ cằm đến ngang vai)',
  L: 'Tóc dài (từ ngang ngực trở xuống)',
};

function normalizeSizeDescriptions(pricesBySize) {
  if (!pricesBySize || typeof pricesBySize !== 'object') return pricesBySize || null;
  return Object.fromEntries(Object.entries(pricesBySize).map(([size, tier]) => [
    size,
    standardSizeDescriptions[size] && tier && typeof tier === 'object'
      ? { ...tier, description: standardSizeDescriptions[size] }
      : tier,
  ]));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withServiceCodeLock(callback) {
  const startedAt = Date.now();
  const token = `${process.pid}:${uuidv4()}`;
  while (true) {
    try {
      const fd = fs.openSync(serviceCodeLockPath, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, created_at: Date.now() }));
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const lock = JSON.parse(fs.readFileSync(serviceCodeLockPath, 'utf8'));
        let processIsRunning = true;
        try {
          process.kill(lock.pid, 0);
        } catch (processError) {
          processIsRunning = processError.code !== 'ESRCH';
        }
        if (!processIsRunning && Date.now() - lock.created_at > 30000) {
          fs.unlinkSync(serviceCodeLockPath);
          continue;
        }
      } catch (lockError) {
        if (lockError.code === 'ENOENT') continue;
        try {
          if (Date.now() - fs.statSync(serviceCodeLockPath).mtimeMs > 30000) {
            fs.unlinkSync(serviceCodeLockPath);
            continue;
          }
        } catch (statError) {
          if (statError.code === 'ENOENT') continue;
        }
        if (Date.now() - startedAt > 30000) throw lockError;
      }
      if (Date.now() - startedAt > 30000) {
        throw new Error('Timed out waiting for the service-code allocation lock');
      }
      sleepSync(20);
    }
  }

  try {
    return callback();
  } finally {
    try {
      const lock = JSON.parse(fs.readFileSync(serviceCodeLockPath, 'utf8'));
      if (lock.token === token) fs.unlinkSync(serviceCodeLockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Failed to release service-code lock:', error);
    }
  }
}

function readServiceCodeState() {
  try {
    const state = JSON.parse(fs.readFileSync(serviceCodeStatePath, 'utf8'));
    if (!Number.isSafeInteger(state.last_code) || state.last_code < 0) {
      throw new Error('Invalid service-code sequence state');
    }
    if (state.pending && (
      typeof state.pending.code !== 'string' ||
      !Number.isSafeInteger(state.pending.code_number) ||
      !Number.isSafeInteger(state.pending.previous_last_code)
    )) {
      throw new Error('Invalid pending service-code reservation');
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { last_code: 0, pending: null };
    throw error;
  }
}

function writeServiceCodeState(state) {
  const tempPath = `${serviceCodeStatePath}.pending-${process.pid}-${uuidv4()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tempPath, serviceCodeStatePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      console.error('Failed to clean up temporary service-code state:', cleanupError);
    }
    throw error;
  }
}

function getServiceCodeNumber(code) {
  const match = /^DV(\d+)$/i.exec(code || '');
  const number = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(number)) throw new Error(`Service code is outside the supported numeric range: ${code}`);
  return number;
}

function assertUniqueServiceCodes(products) {
  const seen = new Set();
  for (const product of products) {
    if (product.service_code === undefined || product.service_code === null || product.service_code === '') continue;
    if (typeof product.service_code !== 'string' || !/^DV\d{3,}$/i.test(product.service_code)) {
      throw new Error(`Invalid service code on service "${product.name || product.id}"`);
    }
    const code = product.service_code.toUpperCase();
    if (seen.has(code)) throw new Error(`Duplicate service code found: ${code}`);
    seen.add(code);
  }
}

function recoverPendingServiceCode(products, state) {
  if (!state.pending) return state;
  const exists = products.some(product =>
    String(product.service_code || '').toUpperCase() === String(state.pending.code).toUpperCase()
  );
  const recovered = exists
    ? { last_code: Math.max(state.last_code, state.pending.code_number), pending: null }
    : { last_code: state.pending.previous_last_code, pending: null };
  writeServiceCodeState(recovered);
  return recovered;
}

function persistProductsAndSequence(products, state, lastCode) {
  const pendingState = {
    last_code: state.last_code,
    pending: {
      code: `DV${String(lastCode).padStart(3, '0')}`,
      code_number: lastCode,
      previous_last_code: state.last_code,
    },
  };
  writeServiceCodeState(pendingState);
  try {
    jsonStore.saveCollection('products', products);
  } catch (error) {
    try {
      writeServiceCodeState(state);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Service-code reservation could not be rolled back');
    }
    throw error;
  }
  writeServiceCodeState({ last_code: lastCode, pending: null });
}

function loadProductsWithServiceCodes() {
  const products = jsonStore.loadCollection('products');
  let state = recoverPendingServiceCode(products, readServiceCodeState());
  assertUniqueServiceCodes(products);
  const highestExistingCode = products.reduce(
    (highest, product) => Math.max(highest, getServiceCodeNumber(product.service_code)),
    0,
  );
  const lastCode = Math.max(state.last_code, highestExistingCode);
  let nextCode = lastCode + 1;
  let changed = false;

  for (const product of products) {
    if (product.service_code) continue;
    product.service_code = `DV${String(nextCode).padStart(3, '0')}`;
    nextCode++;
    changed = true;
  }

  const finalCode = nextCode - 1;
  if (changed) {
    persistProductsAndSequence(products, state, finalCode);
    state = { last_code: finalCode, pending: null };
  } else if (state.last_code !== lastCode) {
    writeServiceCodeState({ last_code: lastCode, pending: null });
    state = { last_code: lastCode, pending: null };
  }
  return { products, state };
}

function ensureServiceCodes() {
  return withServiceCodeLock(() => loadProductsWithServiceCodes().products);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');
}

function hasConfiguredSizePrices(product) {
  const tiers = Object.entries(product.prices_by_size || {});
  return tiers.length > 0 && tiers.every(([size, tier]) =>
    ['S', 'M', 'L'].includes(size) &&
    tier &&
    Number.isFinite(Number(tier.price)) &&
    Number(tier.price) > 0
  );
}

async function findAll({
  search, categoryId, status, page = 1, limit = 12, sortBy = 'created_at',
  requireSizePrices = false,
} = {}) {
  const products = ensureServiceCodes();
  const categories = jsonStore.getCollection('categories');
  const catMap = new Map(categories.map(category => [category.id, category]));

  let filtered = [...products];

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(p =>
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.description && p.description.toLowerCase().includes(s))
    );
  }

  if (categoryId) {
    filtered = filtered.filter(p => p.category_id === categoryId);
  }

  if (requireSizePrices) {
    filtered = filtered.filter(hasConfiguredSizePrices);
  }

  if (status && status !== 'all') {
    filtered = filtered.filter(p => p.status === status);
  } else if (!status) {
    filtered = filtered.filter(p => p.status === 'active');
  }

  if (sortBy === 'service_code') {
    filtered.sort((a, b) => getServiceCodeNumber(a.service_code) - getServiceCodeNumber(b.service_code));
  } else {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const rows = filtered.slice(offset, offset + limit).map(p => ({
    id: p.id,
    service_code: p.service_code,
    name: p.name,
    slug: p.slug,
    description: p.description,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    image_url: p.image_url,
    status: p.status,
    created_at: p.created_at,
    updated_at: p.updated_at,
    category_id: p.category_id,
    category_name: catMap.get(p.category_id)?.name || null,
    category_description: catMap.get(p.category_id)?.description || null,
    prices_by_size: normalizeSizeDescriptions(p.prices_by_size),
    price_unit: p.price_unit || null,
    staff_count: p.staff_count ?? null,
    aliases: p.aliases || [],
  }));

  return { rows, total };
}

async function findById(id) {
  if (!id) return null;
  const products = ensureServiceCodes();
  const p = products.find(x => x.id === id);
  if (!p) return null;

  const categories = jsonStore.getCollection('categories');
  const cat = categories.find(c => c.id === p.category_id);
  const productData = { ...p };
  delete productData.price;
  delete productData.pricing_type;

  return {
    ...productData,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    category_id: p.category_id,
    category_name: cat ? cat.name : null,
    category_description: cat ? cat.description : null,
    prices_by_size: normalizeSizeDescriptions(p.prices_by_size),
    price_unit: p.price_unit || null,
    staff_count: p.staff_count ?? null,
    aliases: p.aliases || [],
  };
}

async function findBySlug(slug) {
  if (!slug) return null;
  const products = ensureServiceCodes();
  const p = products.find(x => x.slug === slug);
  if (!p) return null;

  const categories = jsonStore.getCollection('categories');
  const cat = categories.find(c => c.id === p.category_id);
  const productData = { ...p };
  delete productData.price;
  delete productData.pricing_type;

  return {
    ...productData,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    category_name: cat ? cat.name : null,
    category_description: cat ? cat.description : null,
    prices_by_size: normalizeSizeDescriptions(p.prices_by_size),
    price_unit: p.price_unit || null,
    staff_count: p.staff_count ?? null,
    aliases: p.aliases || [],
  };
}

async function create({
  name, description, duration, imageUrl, categoryId, status = 'active',
  pricesBySize, priceUnit, staffCount, aliases,
}) {
  return withServiceCodeLock(() => {
    const { products, state } = loadProductsWithServiceCodes();
    const highestProductCode = products.reduce(
      (highest, product) => Math.max(highest, getServiceCodeNumber(product.service_code)),
      0,
    );
    const nextCode = Math.max(state.last_code, highestProductCode) + 1;
    const now = new Date().toISOString();

    const newProduct = {
      id: uuidv4(),
      service_code: `DV${String(nextCode).padStart(3, '0')}`,
      category_id: categoryId || null,
      name,
      slug: slugify(name),
      description: description || null,
      prices_by_size: pricesBySize || null,
      price_unit: priceUnit || null,
      duration: duration !== null && duration !== undefined ? parseInt(duration, 10) : 45,
      staff_count: staffCount !== null && staffCount !== undefined ? parseInt(staffCount, 10) : null,
      aliases: Array.isArray(aliases) ? aliases : [],
      image_url: imageUrl || null,
      status,
      created_at: now,
      updated_at: now,
    };

    products.push(newProduct);
    assertUniqueServiceCodes(products);
    persistProductsAndSequence(products, state, nextCode);
    return newProduct;
  });
}

async function update(id, fields) {
  return withServiceCodeLock(() => {
    const { products } = loadProductsWithServiceCodes();
    const p = products.find(x => x.id === id);
    if (!p) return null;

    const allowed = [
      'name', 'description', 'duration', 'image_url', 'category_id', 'status',
      'prices_by_size', 'price_unit', 'staff_count', 'aliases',
    ];
    const aliases = {
      imageUrl: 'image_url',
      categoryId: 'category_id',
      pricesBySize: 'prices_by_size',
      priceUnit: 'price_unit',
      staffCount: 'staff_count',
    };
    let hasUpdate = false;

    for (const [k, v] of Object.entries(fields)) {
      const col = aliases[k] || k;
      if (allowed.includes(col)) {
        if (col === 'duration') {
          p[col] = v !== null && v !== undefined ? parseInt(v, 10) : v;
        } else if (col === 'staff_count') {
          p[col] = v !== null && v !== undefined ? parseInt(v, 10) : v;
        } else {
          p[col] = v;
        }
        hasUpdate = true;
      }
    }

    if (fields.name) {
      p.slug = slugify(fields.name);
      hasUpdate = true;
    }

    if (!hasUpdate) throw new Error('No valid fields to update');
    p.updated_at = new Date().toISOString();

    jsonStore.saveCollection('products', products);
    return p;
  });
}

async function findAllCategories() {
  const categories = jsonStore.getCollection('categories');
  const products = jsonStore.getCollection('products');

  const activeCategories = categories.filter(c => c.is_active);
  activeCategories.sort((a, b) => a.name.localeCompare(b.name));

  return activeCategories.map(c => {
    const productCount = products.filter(p => p.category_id === c.id && p.status === 'active').length;
    return {
      ...c,
      product_count: productCount,
    };
  });
}

function getCategoryById(id) {
  return jsonStore.getCollection('categories').find(category => category.id === id) || null;
}

async function createCategory({ name, description }) {
  const categories = jsonStore.getCollection('categories');
  const now = new Date().toISOString();
  const slug = slugify(name);

  const newCat = {
    id: uuidv4(),
    name,
    slug,
    description: description || null,
    is_active: true,
    created_at: now,
  };

  categories.push(newCat);
  jsonStore.saveCollection('categories', categories);
  return newCat;
}

async function countByStatus() {
  const products = jsonStore.getCollection('products');
  const result = { active: 0, inactive: 0, discontinued: 0, total: 0 };
  for (const p of products) {
    if (result[p.status] !== undefined) {
      result[p.status]++;
    }
    result.total++;
  }
  return result;
}

async function deleteProduct(id) {
  const appointments = jsonStore.getCollection('appointments') || [];
  const hasAppt = appointments.some(a =>
    a.product_id === id ||
    (Array.isArray(a.services) && a.services.some(s => s.id === id || s.service_id === id))
  );
  if (hasAppt) {
    throw Object.assign(
      new Error('Không thể xóa dịch vụ vì đã có lịch hẹn liên quan. Vui lòng chuyển trạng thái sang ngừng hoạt động thay vì xóa để bảo toàn lịch sử.'),
      { status: 400, code: 'SERVICE_HAS_APPOINTMENTS' }
    );
  }

  return withServiceCodeLock(() => {
    const products = jsonStore.loadCollection('products');
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const deleted = products.splice(idx, 1)[0];
    jsonStore.saveCollection('products', products);
    return deleted;
  });
}

async function deleteCategory(id) {
  const products = jsonStore.getCollection('products');
  const prodsInCat = products.filter(p => p.category_id === id);
  const appointments = jsonStore.getCollection('appointments') || [];

  for (const prod of prodsInCat) {
    const hasAppt = appointments.some(a =>
      a.product_id === prod.id ||
      (Array.isArray(a.services) && a.services.some(s => s.id === prod.id || s.service_id === prod.id))
    );
    if (hasAppt) {
      throw Object.assign(
        new Error('Không thể xóa danh mục này vì các dịch vụ bên trong đã có lịch hẹn liên quan. Vui lòng xử lý dữ liệu liên quan trước khi xóa.'),
        { status: 400, code: 'CATEGORY_HAS_APPOINTMENTS' }
      );
    }
  }

  const categories = jsonStore.getCollection('categories');
  const idx = categories.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const deleted = categories.splice(idx, 1)[0];
  jsonStore.saveCollection('categories', categories);
  return deleted;
}

module.exports = {
  findAll,
  findById,
  findBySlug,
  create,
  update,
  deleteProduct,
  findAllCategories,
  getCategoryById,
  createCategory,
  deleteCategory,
  countByStatus,
  slugify,
  hasConfiguredSizePrices,
};
