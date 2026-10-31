'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, requireStaff, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const productRepo = require('../repositories/productRepository');

// GET /api/products - Public
router.get('/', asyncHandler(async (req, res) => {
  const { search, category, status, page = 1, limit = 12 } = req.query;
  const { rows, total } = await productRepo.findAll({
    search,
    categoryId: category,
    status: status || undefined,
    page: parseInt(page),
    limit: Math.min(parseInt(limit), 50),
  });
  res.json({
    success: true,
    data: rows,
    meta: { total, page: parseInt(page), limit: parseInt(limit) },
  });
}));

// GET /api/products/categories - Public
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await productRepo.findAllCategories();
  res.json({ success: true, data: categories });
}));

// GET /api/products/:id - Public
router.get('/:id', asyncHandler(async (req, res) => {
  const product = await productRepo.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  if (product.status !== 'active') {
    // Non-admin users can't see inactive products
    if (!req.headers.authorization) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
  }
  res.json({ success: true, data: product });
}));

// POST /api/products - Admin only (Spec 2.2: Receptionist cannot change prices or services)
router.post('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { name, description, price, duration, imageUrl, categoryId, status } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  const product = await productRepo.create({ name, description, price, duration, imageUrl, categoryId, status });
  res.status(201).json({ success: true, data: product });
}));

// PUT /api/products/:id - Admin only
router.put('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const product = await productRepo.update(req.params.id, req.body);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json({ success: true, data: product });
}));

// DELETE /api/products/:id - Admin only (Spec 3.2: cannot delete if linked to appointments)
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const deleted = await productRepo.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json({ success: true, message: 'Đã xóa dịch vụ thành công', data: deleted });
}));

// POST /api/products/categories - Admin only
router.post('/categories', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  const category = await productRepo.createCategory({ name, description });
  res.status(201).json({ success: true, data: category });
}));

// DELETE /api/products/categories/:id - Admin only (Spec 3.2: cannot delete if linked to appointments)
router.delete('/categories/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const deleted = await productRepo.deleteCategory(req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Category not found' });
  res.json({ success: true, message: 'Đã xóa danh mục thành công', data: deleted });
}));

module.exports = router;
