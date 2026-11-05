'use strict';
const express = require('express');
const router = express.Router();
const {
  authenticate,
  optionalAuthenticate,
  requireStaff,
  requireStaffOrReceptionist,
  forbidReceptionist,
} = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const appointmentService = require('../services/appointmentService');
const appointmentRepo = require('../repositories/appointmentRepository');

// GET /api/appointments/slots?date=YYYY-MM-DD - Public: check available slots
router.get('/slots', asyncHandler(async (req, res) => {
  const { date, duration, productId, productIds, hairSize, hair_size: hairSizeSnake } = req.query;
  if (!date) return res.status(400).json({ success: false, error: 'date parameter is required' });

  const selectedProductIds = Array.isArray(productIds)
    ? productIds
    : typeof productIds === 'string'
      ? productIds.split(',').map(id => id.trim()).filter(Boolean)
      : productId
        ? [String(productId)]
        : [];
  const result = await appointmentService.checkAvailableSlots(
    date,
    duration ? parseInt(duration, 10) : undefined,
    { productIds: selectedProductIds, hairSize: hairSize || hairSizeSnake || null }
  );
  res.json({ success: true, data: result });
}));

// POST /api/appointments/hold - Step 6: Temporary Hold Slot (TTL 5m)
router.post('/hold', optionalAuthenticate, asyncHandler(async (req, res) => {
  const {
    appointmentDate,
    appointmentTime,
    durationMinutes,
    productId,
    productIds,
    productSizes,
    product_sizes: productSizesSnake,
    hairSize,
    hair_size: hairSizeSnake,
    notes,
    conversationId,
  } = req.body;

  try {
    const held = await appointmentService.holdSlot({
      conversationId: conversationId || null,
      guestSessionId: req.guestSessionId,
      userId: (req.user && req.user.role === 'user') ? req.user.id : null,
      appointmentDate,
      appointmentTime,
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
      productId: productId || null,
      productIds: Array.isArray(productIds)
        ? productIds
        : typeof productIds === 'string'
          ? productIds.split(',').map(id => id.trim()).filter(Boolean)
        : productId
          ? [productId]
          : [],
      productSizes: productSizes || productSizesSnake || {},
      hairSize: hairSize || hairSizeSnake || null,
      notes: notes || null,
    });

    res.status(201).json({
      success: true,
      message: 'Khung giờ đã được giữ chỗ tạm thời trong 5 phút.',
      data: held,
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        success: false,
        code: err.code || 'SLOT_CONFLICT',
        error: err.message,
      });
    }
    throw err;
  }
}));

// POST /api/appointments/confirm-hold - Step 9: Re-verify & Commit Booking
router.post('/confirm-hold', optionalAuthenticate, asyncHandler(async (req, res) => {
  const {
    holdingToken,
    customerName,
    customerPhone,
    customerEmail,
    notes,
  } = req.body;

  try {
    const appt = await appointmentService.confirmHoldingSlot({
      holdingToken,
      customerName,
      customerPhone,
      customerEmail: (typeof customerEmail === 'string' && customerEmail.trim()) ? customerEmail.trim() : null,
      notes,
      guestSessionId: req.guestSessionId,
      userId: (req.user && req.user.role === 'user') ? req.user.id : null,
    });

    res.status(200).json({
      success: true,
      message: 'Đặt lịch hẹn thành công!',
      data: appt,
    });
  } catch (err) {
    if (err.status === 409 || err.status === 410) {
      return res.status(err.status).json({
        success: false,
        code: err.code,
        error: err.message,
        preservedData: err.preservedData || {
          customerName,
          customerPhone,
          customerEmail,
        },
      });
    }
    throw err;
  }
}));

// POST /api/appointments/release-hold - Step 8: Release temporary hold
router.post('/release-hold', optionalAuthenticate, asyncHandler(async (req, res) => {
  const { holdingToken } = req.body;
  const result = await appointmentService.releaseHoldSlot({
    holdingToken,
    guestSessionId: req.guestSessionId,
  });

  if (!result) {
    return res.status(404).json({ success: false, error: 'Holding slot not found or already released' });
  }

  res.json({
    success: true,
    message: 'Khung giờ giữ chỗ đã được giải phóng thành công.',
    data: result,
  });
}));

// POST /api/appointments - Public / Authenticated / Receptionist: book appointment directly (Legacy & Direct Quầy)
router.post('/', optionalAuthenticate, asyncHandler(async (req, res) => {
  const {
    customerName, customerPhone, customerEmail,
    productId, productIds, appointmentDate, appointmentTime,
    productSizes, product_sizes: productSizesSnake,
    durationMinutes, hairSize, hair_size: hairSizeSnake,
    notes, conversationId, staffId,
  } = req.body;

  const isAdminOrStaff = req.user && ['admin', 'receptionist', 'staff'].includes(req.user.role);
  const confirmedBySystem = isAdminOrStaff || req.body.confirmedBySystem === true;
  const status = isAdminOrStaff ? 'confirmed' : 'pending';
  const createdBy = req.user ? req.user.name : (customerName || 'Khách hàng');

  const appt = await appointmentService.createAppointment({
    conversationId: conversationId || null,
    guestSessionId: req.guestSessionId,
    userId: (req.user && req.user.role === 'user') ? req.user.id : null,
    confirmedBySystem,
    customerName,
    customerPhone,
    customerEmail: (typeof customerEmail === 'string' && customerEmail.trim()) ? customerEmail.trim() : null,
    productId: productId || null,
    productIds: Array.isArray(productIds)
      ? productIds
      : typeof productIds === 'string'
        ? productIds.split(',').map(id => id.trim()).filter(Boolean)
        : (productId ? [productId] : []),
    productSizes: productSizes || productSizesSnake || {},
    hairSize: hairSize || hairSizeSnake || null,
    appointmentDate,
    appointmentTime,
    durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
    notes: notes || null,
    staffId: staffId || null,
    status,
    createdBy,
  });

  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('appointment_created', {
      appointmentId: appt.id,
      appointment: appt,
      createdBy,
    });
  }

  res.status(201).json({ success: true, data: appt });
}));

// GET /api/appointments/my-appointments - Authenticated user: view all appointments linked to account
router.get('/my-appointments', authenticate, asyncHandler(async (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ success: false, error: 'Chỉ tài khoản khách hàng mới có lịch hẹn cá nhân' });
  }
  const { page = 1, limit = 20 } = req.query;
  const appointments = await appointmentService.getUserAppointments(req.user.id, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });
  res.json({ success: true, data: appointments });
}));

// GET /api/appointments/my - Guest/User: view own appointments in session/account
router.get('/my', optionalAuthenticate, asyncHandler(async (req, res) => {
  if (req.user && req.user.role === 'user') {
    const userAppointments = await appointmentRepo.findByUserId(req.user.id);
    if (userAppointments.length > 0) {
      return res.json({ success: true, data: userAppointments });
    }
  }
  const appointments = await appointmentRepo.findBySession(req.guestSessionId);
  res.json({ success: true, data: appointments });
}));

// GET /api/appointments/lookup?phone=...&bookingCode=... - Look up appointment by Phone and Booking Code (Public, no guest_session_id required)
router.get('/lookup', optionalAuthenticate, asyncHandler(async (req, res) => {
  const phone = req.query.phone || req.query.customerPhone || req.query.customer_phone;
  const bookingCode = req.query.bookingCode || req.query.booking_code;

  if (!phone || !bookingCode) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp số điện thoại (phone) và mã đặt lịch (bookingCode hoặc booking_code)',
    });
  }

  try {
    const appt = await appointmentService.lookupAppointmentByPhoneAndBookingCode(phone, bookingCode);
    return res.status(200).json({ success: true, data: appt });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, error: err.message || 'Không tìm thấy lịch hẹn' });
    }
    if (err.status === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    throw err;
  }
}));

// GET /api/appointments/lookup/:token - Look up appointment by confirmation token or holding token
router.get('/lookup/:token', optionalAuthenticate, asyncHandler(async (req, res) => {
  const appt = await appointmentService.getAppointmentByToken(
    req.params.token, req.guestSessionId, req.user || null
  );
  res.json({ success: true, data: appt });
}));

// POST /api/appointments/cancel/:id - Cancel appointment (Guest or Owner)
router.post('/cancel/:id', optionalAuthenticate, asyncHandler(async (req, res) => {
  const result = await appointmentService.cancelAppointment(
    req.params.id, req.guestSessionId, req.user || null
  );
  if (!result) return res.status(404).json({ success: false, error: 'Appointment not found' });
  res.json({ success: true, data: result });
}));

// ─── Staff & Receptionist routes ──────────────────────────────────────────────

// GET /api/appointments/active-staff - Active staff members for scheduling & assignment (Staff & Receptionist)
router.get('/active-staff', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const staff = await appointmentService.getActiveStaff();
  res.json({ success: true, data: staff });
}));

// PUT /api/appointments/:id/assign - Reassign staff and/or reschedule time via Drag & Drop (Admin & Receptionist)
router.put('/:id/assign', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const { staffId, appointmentTime, appointmentDate } = req.body;
  if (!staffId && !appointmentTime && !appointmentDate) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp nhân viên mới (staffId) hoặc thời gian hẹn mới (appointmentTime)',
    });
  }

  try {
    const result = await appointmentService.reassignStaff(req.params.id, {
      newStaffId: staffId,
      appointmentTime,
      appointmentDate,
      changedBy: req.user.name,
      changedById: req.user.id,
    });

    const io = req.app.get('io');
    if (io) {
      io.to('agents').emit('appointment_reassigned', {
        appointmentId: result.id,
        appointment: result,
        changedBy: req.user.name,
      });
    }

    res.json({
      success: true,
      message: `Đã cập nhật lịch hẹn thành công: ${result.appointment_time} – Thợ: ${result.staff_name || 'Chưa phân công'}.`,
      data: result,
    });
  } catch (err) {
    if (err.status === 409 || err.status === 404 || err.status === 400) {
      return res.status(err.status).json({
        success: false,
        code: err.code || 'ASSIGNMENT_ERROR',
        error: err.message,
      });
    }
    throw err;
  }
}));

// GET /api/appointments - List all appointments (Staff & Receptionist can search/filter by date, status)
router.get('/', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const { status, date, page = 1, limit = 20 } = req.query;
  const { rows, total } = await appointmentRepo.findAll({
    status, date, page: parseInt(page, 10), limit: parseInt(limit, 10),
  });
  res.json({ success: true, data: rows, meta: { total } });
}));

// GET /api/appointments/:id - View appointment details (Staff & Receptionist)
router.get('/:id', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const appt = await appointmentRepo.findById(req.params.id);
  if (!appt) return res.status(404).json({ success: false, error: 'Appointment not found' });
  res.json({ success: true, data: appt });
}));

// PUT /api/appointments/:id/status - Staff/Admin only: update status (FORBIDDEN for Receptionist)
router.put('/:id/status', authenticate, requireStaff, forbidReceptionist, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'holding', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  const result = await appointmentRepo.updateStatus(req.params.id, status);
  if (!result) return res.status(404).json({ success: false, error: 'Appointment not found' });
  res.json({ success: true, data: result });
}));

// PUT /api/appointments/:id/reschedule - Staff/Admin only: reschedule (FORBIDDEN for Receptionist)
router.put('/:id/reschedule', authenticate, requireStaff, forbidReceptionist, asyncHandler(async (req, res) => {
  const { appointmentDate, appointmentTime } = req.body;
  if (!appointmentDate || !appointmentTime) {
    return res.status(400).json({ success: false, error: 'appointmentDate and appointmentTime required' });
  }
  const result = await appointmentRepo.reschedule(req.params.id, { appointmentDate, appointmentTime });
  if (!result) return res.status(404).json({ success: false, error: 'Appointment not found' });
  res.json({ success: true, data: result });
}));

module.exports = router;
