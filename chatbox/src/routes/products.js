'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, optionalAuthenticate, requireAdmin, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const productRepo = require('../repositories/productRepository');

function validateProductFields(fields, { requireComplete = false } = {}) {
  const name = fields.name;
  const categoryId = fields.category_id ?? fields.categoryId;
  const duration = fields.duration;
  const staffCount = fields.staff_count ?? fields.staffCount;
  const pricesBySize = fields.prices_by_size ?? fields.pricesBySize;
  if (Object.prototype.hasOwnProperty.call(fields, 'price')) {
    return { field: 'price', message: 'Giá dịch vụ chỉ được cấu hình theo size.' };
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'pricing_type') ||
      Object.prototype.hasOwnProperty.call(fields, 'pricingType')) {
    return { field: 'pricing_type', message: 'Dịch vụ chỉ hỗ trợ giá theo size.' };
  }

  if (requireComplete || name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return { field: 'name', message: 'Vui lòng nhập tên dịch vụ.' };
  }
  if (requireComplete || categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !categoryId.trim()) {
      return { field: 'category_id', message: 'Vui lòng chọn nhóm dịch vụ.' };
    }
    const category = productRepo.getCategoryById(categoryId);
    if (!category || !category.is_active) {
      return { field: 'category_id', message: 'Nhóm dịch vụ không tồn tại hoặc đã ngừng hoạt động.' };
    }
  }
  if (requireComplete || duration !== undefined) {
    if (duration === '' || duration === null || duration === undefined ||
        !Number.isInteger(Number(duration)) || Number(duration) < 1) {
      return { field: 'duration', message: 'Thời gian thực hiện phải là số nguyên dương.' };
    }
  }
  if (requireComplete || staffCount !== undefined) {
    if (staffCount === '' || staffCount === null || staffCount === undefined ||
        !Number.isInteger(Number(staffCount)) || Number(staffCount) < 1) {
      return { field: 'staff_count', message: 'Số nhân viên cần phải là số nguyên dương.' };
    }
  }

  if (requireComplete || pricesBySize !== undefined) {
    if (!pricesBySize || typeof pricesBySize !== 'object' || Array.isArray(pricesBySize) ||
        Object.keys(pricesBySize).length === 0) {
      return { field: 'prices_by_size', message: 'Vui lòng chọn ít nhất một size và nhập giá.' };
    }
    for (const [size, tier] of Object.entries(pricesBySize)) {
      if (!['S', 'M', 'L'].includes(size)) {
        return { field: 'prices_by_size', message: `Size "${size}" không hợp lệ. Chỉ hỗ trợ S, M và L.` };
      }
      if (!tier || typeof tier !== 'object' ||
          tier.price === undefined || tier.price === null || tier.price === '' ||
          !Number.isFinite(Number(tier.price)) || Number(tier.price) <= 0) {
        return { field: 'prices_by_size', message: `Giá size ${size} phải là số lớn hơn 0.` };
      }
      if (tier.duration !== undefined && tier.duration !== null &&
          (tier.duration === '' || !Number.isInteger(Number(tier.duration)) || Number(tier.duration) < 1)) {
        return { field: 'prices_by_size', message: `Thời lượng size ${size} phải là số nguyên dương.` };
      }
      if (tier.staff_count !== undefined && tier.staff_count !== null &&
          (tier.staff_count === '' || !Number.isInteger(Number(tier.staff_count)) || Number(tier.staff_count) < 1)) {
        return { field: 'prices_by_size', message: `Số nhân viên size ${size} phải là số nguyên dương.` };
      }
    }
  }

  return null;
}

// GET /api/products - Public
router.get('/', optionalAuthenticate, asyncHandler(async (req, res) => {
  const { search, category, status, sortBy, page = 1, limit = 12 } = req.query;
  const canManageProducts = req.user && ['admin', 'staff'].includes(req.user.role);
  res.set('Cache-Control', 'no-store');
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const { rows, total } = await productRepo.findAll({
    search,
    categoryId: category,
    status: canManageProducts ? status || undefined : 'active',
    page: pageNumber,
    limit: pageLimit,
    sortBy: canManageProducts && sortBy === 'service_code' ? sortBy : undefined,
    requireSizePrices: !canManageProducts,
  });
  res.json({
    success: true,
    data: rows,
    meta: { total, page: pageNumber, limit: pageLimit },
  });
}));

// GET /api/products/categories - Public
router.get('/categories', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const categories = await productRepo.findAllCategories();
  res.json({ success: true, data: categories });
}));

// GET /api/products/:id - Public
router.get('/:id', optionalAuthenticate, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const product = await productRepo.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  const canManageProducts = req.user && ['admin', 'staff'].includes(req.user.role);
  if ((product.status !== 'active' || !productRepo.hasConfiguredSizePrices(product)) && !canManageProducts) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }
  res.json({ success: true, data: product });
}));

// Admin and staff can manage products; receptionists and customers are read-only.
router.post('/', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const {
    name, description, duration, imageUrl, image_url, categoryId, category_id, status,
    pricesBySize, prices_by_size, priceUnit, price_unit, staffCount, staff_count, aliases,
  } = req.body;
  const validationError = validateProductFields(req.body, { requireComplete: true });
  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError.message,
      field: validationError.field,
    });
  }
  if (status && !['active', 'inactive', 'discontinued'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid product status' });
  }

  const product = await productRepo.create({
    name: name.trim(),
    description,
    duration,
    imageUrl: imageUrl ?? image_url,
    categoryId: categoryId ?? category_id,
    status,
    pricesBySize: pricesBySize ?? prices_by_size,
    priceUnit: priceUnit ?? price_unit,
    staffCount: staffCount ?? staff_count,
    aliases,
  });
  res.status(201).json({ success: true, data: product });
}));

router.put('/:id', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const currentProduct = await productRepo.findById(req.params.id);
  if (!currentProduct) return res.status(404).json({ success: false, error: 'Product not found' });
  const updatesServiceFields = Object.keys(req.body).some(field => field !== 'status');
  if (updatesServiceFields || req.body.status === 'active') {
    const requestedPricesBySize = Object.prototype.hasOwnProperty.call(req.body, 'prices_by_size')
      ? req.body.prices_by_size
      : Object.prototype.hasOwnProperty.call(req.body, 'pricesBySize')
        ? req.body.pricesBySize
        : currentProduct.prices_by_size;
    const mergedFields = {
      ...currentProduct,
      ...req.body,
      category_id: req.body.category_id ?? req.body.categoryId ?? currentProduct.category_id,
      staff_count: req.body.staff_count ?? req.body.staffCount ?? currentProduct.staff_count,
      prices_by_size: requestedPricesBySize,
    };
    const validationError = validateProductFields(mergedFields, { requireComplete: true });
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError.message,
        field: validationError.field,
      });
    }
    req.body.prices_by_size = mergedFields.prices_by_size;
  }
  if (req.body.status && !['active', 'inactive', 'discontinued'].includes(req.body.status)) {
    return res.status(400).json({ success: false, error: 'Invalid product status' });
  }
  const updatedProduct = await productRepo.update(req.params.id, req.body);
  if (!updatedProduct) return res.status(404).json({ success: false, error: 'Product not found' });
  const product = await productRepo.findById(req.params.id);
  res.json({ success: true, data: product });
}));

router.delete('/:id', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const deleted = await productRepo.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Product not found' });
  const deletedService = { ...deleted };
  delete deletedService.price;
  delete deletedService.pricing_type;
  res.json({ success: true, message: 'Đã xóa dịch vụ thành công', data: deletedService });
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
