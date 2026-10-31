'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin, requireStaff } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const authService = require('../services/authService');
const userRepo = require('../repositories/userRepository');
const productRepo = require('../repositories/productRepository');
const conversationRepo = require('../repositories/conversationRepository');
const appointmentRepo = require('../repositories/appointmentRepository');

// Notifications router
router.use('/notifications', require('./notifications'));

// GET /api/admin/dashboard
router.get('/dashboard', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const [productCounts, apptCounts, convCounts, upcomingAppts] = await Promise.all([
    productRepo.countByStatus(),
    appointmentRepo.getCounts(),
    conversationRepo.getCounts(),
    appointmentRepo.getUpcoming(3),
  ]);
  res.json({
    success: true,
    data: { products: productCounts, appointments: apptCounts, conversations: convCounts, upcomingAppointments: upcomingAppts },
  });
}));

// ─── Staff management ──────────────────────────────────────────────────────────

// GET /api/admin/staff
router.get('/staff', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { rows, total } = await userRepo.findAll();
  // Remove password_hash from output
  const users = rows.map(({ password_hash, ...u }) => u);
  res.json({ success: true, data: users, meta: { total } });
}));

// POST /api/admin/staff - Create new staff/receptionist account
router.post('/staff', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { email, password, name, role = 'staff', phone, isAvailable = true } = req.body;
  if (!['admin', 'staff', 'receptionist'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role. Must be admin, staff, or receptionist' });
  }
  const user = await authService.createUser({
    email,
    password,
    name,
    role,
    phone,
    isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true
  });
  res.status(201).json({ success: true, data: user });
}));

// PUT /api/admin/staff/:id - Update staff/receptionist
router.put('/staff/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { name, role, isActive, isAvailable, phone } = req.body;

  // Prevent self-demotion
  if (req.params.id === req.user.id && isActive === false) {
    return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
  }

  const fields = {};
  if (name) fields.name = name;
  if (phone !== undefined) fields.phone = phone;
  if (role && ['admin', 'staff', 'receptionist'].includes(role)) fields.role = role;
  if (typeof isActive === 'boolean') fields.is_active = isActive;
  if (typeof isAvailable === 'boolean') fields.is_available = isAvailable;

  if (req.body.password) {
    if (req.body.password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }
    fields.password_hash = await authService.hashPassword(req.body.password);
  }

  const user = await userRepo.update(req.params.id, fields);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, data: user });
}));

module.exports = router;
