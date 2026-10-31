'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

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

async function findAll({ search, categoryId, status, page = 1, limit = 12 } = {}) {
  const products = jsonStore.getCollection('products');
  const categories = jsonStore.getCollection('categories');
  const catMap = new Map(categories.map(c => [c.id, c.name]));

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

  if (status && status !== 'all') {
    filtered = filtered.filter(p => p.status === status);
  } else if (!status) {
    filtered = filtered.filter(p => p.status === 'active');
  }

  // Order by created_at DESC
  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const rows = filtered.slice(offset, offset + limit).map(p => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price !== null && p.price !== undefined ? parseFloat(p.price) : null,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    image_url: p.image_url,
    status: p.status,
    created_at: p.created_at,
    updated_at: p.updated_at,
    category_id: p.category_id,
    category_name: catMap.get(p.category_id) || null,
  }));

  return { rows, total };
}

async function findById(id) {
  if (!id) return null;
  const products = jsonStore.getCollection('products');
  const p = products.find(x => x.id === id);
  if (!p) return null;

  const categories = jsonStore.getCollection('categories');
  const cat = categories.find(c => c.id === p.category_id);

  return {
    ...p,
    price: p.price !== null && p.price !== undefined ? parseFloat(p.price) : null,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    category_id: p.category_id,
    category_name: cat ? cat.name : null,
  };
}

async function findBySlug(slug) {
  if (!slug) return null;
  const products = jsonStore.getCollection('products');
  const p = products.find(x => x.slug === slug);
  if (!p) return null;

  const categories = jsonStore.getCollection('categories');
  const cat = categories.find(c => c.id === p.category_id);

  return {
    ...p,
    price: p.price !== null && p.price !== undefined ? parseFloat(p.price) : null,
    duration: p.duration !== null && p.duration !== undefined ? parseInt(p.duration, 10) : 45,
    category_name: cat ? cat.name : null,
  };
}

async function create({ name, description, price, duration, imageUrl, categoryId, status = 'active' }) {
  const products = jsonStore.getCollection('products');
  const now = new Date().toISOString();
  const slug = slugify(name);

  const newProduct = {
    id: uuidv4(),
    category_id: categoryId || null,
    name,
    slug,
    description: description || null,
    price: price !== null && price !== undefined ? parseFloat(price) : null,
    duration: duration !== null && duration !== undefined ? parseInt(duration, 10) : 45,
    image_url: imageUrl || null,
    status,
    created_at: now,
    updated_at: now,
  };

  products.push(newProduct);
  jsonStore.saveCollection('products', products);
  return newProduct;
}

async function update(id, fields) {
  const products = jsonStore.getCollection('products');
  const p = products.find(x => x.id === id);
  if (!p) return null;

  const allowed = ['name', 'description', 'price', 'duration', 'image_url', 'category_id', 'status'];
  let hasUpdate = false;

  for (const [k, v] of Object.entries(fields)) {
    const col = k === 'imageUrl' ? 'image_url' : k === 'categoryId' ? 'category_id' : k;
    if (allowed.includes(col)) {
      if (col === 'price') {
        p[col] = v !== null && v !== undefined ? parseFloat(v) : v;
      } else if (col === 'duration') {
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

  const products = jsonStore.getCollection('products');
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const deleted = products.splice(idx, 1)[0];
  jsonStore.saveCollection('products', products);
  return deleted;
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
  createCategory,
  deleteCategory,
  countByStatus,
  slugify,
};
