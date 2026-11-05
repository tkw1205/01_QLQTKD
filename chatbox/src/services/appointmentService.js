'use strict';
const appointmentRepo = require('../repositories/appointmentRepository');
const productRepo = require('../repositories/productRepository');
const settingsRepo = require('../repositories/settingsRepository');

const PHONE_REGEX = /^0[35789][0-9]{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let p = phone.trim().replace(/[\s().-]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length === 11) p = '0' + p.slice(2);
  return p;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

async function getBusinessHours() {
  const wh = await settingsRepo.getBusinessSetting('working_hours');
  const duration = parseInt(await settingsRepo.get('appointment_duration'), 10);
  return { workingHours: wh, appointmentDuration: duration };
}

async function checkAvailableSlots(date, requestedDuration, {
  productIds = [],
  hairSize = null,
  productSizes = {},
} = {}) {
  let duration = Number(requestedDuration);
  let requiredStaff = 1;
  if (productIds.length) {
    const products = await Promise.all(productIds.map(id => productRepo.findById(id)));
    if (products.some(product => !product || product.status !== 'active')) {
      throw Object.assign(new Error('Một hoặc nhiều dịch vụ đã chọn không còn khả dụng.'), {
        status: 400,
        code: 'INVALID_SERVICES',
      });
    }
    if (!productSizes || typeof productSizes !== 'object' || Array.isArray(productSizes)) {
      throw Object.assign(new Error('Invalid service size selection.'), {
        status: 400,
        code: 'INVALID_SERVICE_SIZE',
      });
    }
    const requirements = products.map(product =>
      appointmentRepo.getServiceRequirements(
        product,
        productSizes[product.id] || hairSize
      )
    );
    duration = requirements.reduce((total, item) => total + item.durationMinutes, 0);
    requiredStaff = Math.max(...requirements.map(item => item.staffCount));
  } else if (!Number.isFinite(duration) || duration <= 0) {
    duration = Number.parseInt(await settingsRepo.get('appointment_duration'), 10);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Appointment duration is not configured'), {
      status: 503,
      code: 'APPOINTMENT_DURATION_UNAVAILABLE',
    });
  }

  // Validate date
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw Object.assign(new Error('Invalid date'), { status: 400 });
  }

  // Don't allow past dates (using Asia/Ho_Chi_Minh timezone)
  const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const todayStr = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;
  if (date < todayStr) {
    throw Object.assign(new Error('Cannot book appointments in the past'), { status: 400 });
  }

  const slots = await appointmentRepo.findAvailableSlots(date, duration, { requiredStaff });
  return { date, slots, duration };
}

async function holdSlot({
  conversationId, guestSessionId, appointmentDate, appointmentTime,
  durationMinutes, productId, productIds, productSizes = {}, hairSize = null,
  userId = null, notes = null,
}) {
  if (!appointmentDate || !appointmentTime) {
    throw Object.assign(new Error('Missing required date or time for holding slot'), { status: 400 });
  }

  const d = new Date(appointmentDate);
  if (isNaN(d.getTime())) {
    throw Object.assign(new Error('Invalid appointment date'), { status: 400 });
  }

  const nowVN = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const todayStr = `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;
  if (appointmentDate < todayStr) {
    throw Object.assign(new Error('Cannot book appointments in the past'), {
      status: 400,
      code: 'APPOINTMENT_IN_PAST',
    });
  }

  const duration = durationMinutes === undefined || durationMinutes === null
    ? Number.parseInt(await settingsRepo.get('appointment_duration'), 10)
    : Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Appointment duration is not configured'), {
      status: 503,
      code: 'APPOINTMENT_DURATION_UNAVAILABLE',
    });
  }

  return appointmentRepo.hold({
    conversationId,
    guestSessionId,
    appointmentDate,
    appointmentTime,
    durationMinutes: duration,
    productId,
    productIds,
    productSizes,
    hairSize,
    userId,
    notes,
  });
}

async function releaseHoldSlot({ holdingToken, guestSessionId = null }) {
  if (!holdingToken) {
    throw Object.assign(new Error('holdingToken is required'), { status: 400 });
  }
  return appointmentRepo.releaseHold(holdingToken, guestSessionId);
}

async function confirmHoldingSlot({
  holdingToken, customerName, customerPhone, customerEmail, notes,
  guestSessionId = null, userId = null,
}) {
  if (!holdingToken) {
    throw Object.assign(new Error('holdingToken is required to confirm holding slot'), { status: 400 });
  }

  if (!customerName || !customerName.trim()) {
    throw Object.assign(new Error('Customer name is required'), { status: 400 });
  }

  if (!customerPhone || !customerPhone.trim()) {
    throw Object.assign(new Error('Customer phone is required'), { status: 400 });
  }

  const cleanPhone = cleanPhoneNumber(customerPhone);
  if (!PHONE_REGEX.test(cleanPhone)) {
    throw Object.assign(
      new Error('Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 số tại Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).'),
      { status: 400 }
    );
  }

  const trimmedEmail = (customerEmail && typeof customerEmail === 'string' && customerEmail.trim()) ? customerEmail.trim() : null;
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    throw Object.assign(
      new Error('Email không hợp lệ. Vui lòng nhập địa chỉ email chính xác (ví dụ: email@example.com).'),
      { status: 400 }
    );
  }

  return appointmentRepo.confirmHold({
    holdingToken,
    customerName: customerName.trim(),
    customerPhone: cleanPhone,
    customerEmail: trimmedEmail,
    notes: notes ? notes.trim() : null,
    guestSessionId,
    userId,
  });
}

async function createAppointment({
  conversationId, guestSessionId, confirmedBySystem,
  customerName, customerPhone, customerEmail,
  productId, productIds, appointmentDate, appointmentTime,
  productSizes = {}, durationMinutes, hairSize = null, notes, userId = null,
  staffId = null, status = 'pending', createdBy = null,
}) {
  // Server-side confirmation check: confirmedBySystem must be explicitly set
  if (!confirmedBySystem) {
    throw Object.assign(
      new Error('Appointment must be confirmed before creation'),
      { status: 400 }
    );
  }

  // Validate required fields
  if (!customerName || !customerPhone || !appointmentDate || !appointmentTime) {
    throw Object.assign(new Error('Missing required appointment fields'), { status: 400 });
  }

  const cleanPhone = cleanPhoneNumber(customerPhone);
  if (!PHONE_REGEX.test(cleanPhone)) {
    throw Object.assign(
      new Error('Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 số tại Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).'),
      { status: 400 }
    );
  }

  const trimmedEmail = (customerEmail && typeof customerEmail === 'string' && customerEmail.trim()) ? customerEmail.trim() : null;
  if (trimmedEmail && !isValidEmail(trimmedEmail)) {
    throw Object.assign(
      new Error('Email không hợp lệ. Vui lòng nhập địa chỉ email chính xác (ví dụ: email@example.com).'),
      { status: 400 }
    );
  }

  const duration = durationMinutes || Number.parseInt(await settingsRepo.get('appointment_duration'), 10);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Appointment duration is not configured'), {
      status: 503,
      code: 'APPOINTMENT_DURATION_UNAVAILABLE',
    });
  }

  const appointment = await appointmentRepo.create({
    conversationId,
    guestSessionId,
    customerName: customerName.trim(),
    customerPhone: cleanPhone,
    customerEmail: trimmedEmail,
    productId,
    productIds,
    productSizes,
    hairSize,
    appointmentDate,
    appointmentTime,
    durationMinutes: duration,
    notes: notes ? notes.trim() : null,
    userId,
    staffId,
    status,
    createdBy,
  });

  return appointment;
}

async function getAppointmentByToken(confirmationToken, guestSessionId, currentUser = null) {
  let appt = await appointmentRepo.findByToken(confirmationToken);
  if (!appt) {
    appt = await appointmentRepo.findByHoldingToken(confirmationToken);
  }
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });

  // Verify ownership:
  // 1. Matches guest_session_id
  // 2. OR user is logged in and owns the appointment (appt.user_id === currentUser.id)
  // 3. OR user is admin/staff/receptionist
  const isGuestOwner = appt.guest_session_id === guestSessionId;
  const isUserOwner = currentUser && appt.user_id && appt.user_id === currentUser.id;
  const isStaff = currentUser && ['admin', 'staff', 'receptionist'].includes(currentUser.role);

  if (!isGuestOwner && !isUserOwner && !isStaff) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  return appt;
}

async function getUserAppointments(userId, { page = 1, limit = 20 } = {}) {
  if (!userId) return [];
  return appointmentRepo.findByUserId(userId, { page, limit });
}

async function cancelAppointment(id, guestSessionId, currentUser = null) {
  const appt = await appointmentRepo.findById(id);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });

  const isGuestOwner = appt.guest_session_id === guestSessionId;
  const isUserOwner = currentUser && appt.user_id && appt.user_id === currentUser.id;
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (!isGuestOwner && !isUserOwner && !isAdmin) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  if (appt.status === 'cancelled') {
    throw Object.assign(new Error('Appointment already cancelled'), { status: 400 });
  }
  if (appt.status === 'completed') {
    throw Object.assign(new Error('Cannot cancel a completed appointment'), { status: 400 });
  }

  return appointmentRepo.updateStatus(id, 'cancelled');
}

async function lookupAppointmentByPhoneAndBookingCode(phone, bookingCode) {
  if (!phone || !bookingCode) {
    throw Object.assign(
      new Error('Vui lòng cung cấp đầy đủ số điện thoại và mã đặt lịch'),
      { status: 400 }
    );
  }

  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone) {
    throw Object.assign(new Error('Số điện thoại không hợp lệ'), { status: 400 });
  }

  const cleanCode = String(bookingCode).trim().toUpperCase();
  if (!cleanCode) {
    throw Object.assign(new Error('Mã đặt lịch không hợp lệ'), { status: 400 });
  }

  let appt = null;

  // 1. First attempt: call appointmentRepository.findByBookingCodeAndPhone (bookingCode, phone)
  if (typeof appointmentRepo.findByBookingCodeAndPhone === 'function') {
    try {
      appt = await appointmentRepo.findByBookingCodeAndPhone(cleanCode, cleanPhone);
      if (!appt) {
        appt = await appointmentRepo.findByBookingCodeAndPhone(cleanCode, phone.trim());
      }
    } catch (err) {
      console.warn('[lookupAppointment] Repository findByBookingCodeAndPhone error, falling back:', err.message);
    }
  }

  // 2. Fallback: search via findAll
  if (!appt && typeof appointmentRepo.findAll === 'function') {
    try {
      const { rows } = await appointmentRepo.findAll({ limit: 10000 });
      if (Array.isArray(rows)) {
        appt = rows.find(a =>
          a.booking_code &&
          a.booking_code.trim().toUpperCase() === cleanCode &&
          (cleanPhoneNumber(a.customer_phone) === cleanPhone || (a.customer_phone && a.customer_phone.trim() === phone.trim()))
        ) || null;
      }
    } catch (_) {}
  }

  // 3. Fallback: search directly in jsonStore if needed
  if (!appt) {
    try {
      const jsonStore = require('../config/jsonStore');
      const appointments = jsonStore.getCollection('appointments') || [];
      const found = appointments.find(a =>
        a.booking_code &&
        a.booking_code.trim().toUpperCase() === cleanCode &&
        (cleanPhoneNumber(a.customer_phone) === cleanPhone || (a.customer_phone && a.customer_phone.trim() === phone.trim()))
      );
      if (found) {
        const products = jsonStore.getCollection('products') || [];
        const product = found.product_id ? products.find(p => p.id === found.product_id) : null;
        appt = {
          ...found,
          product_name: product ? product.name : null,
        };
      }
    } catch (_) {}
  }

  if (!appt) {
    throw Object.assign(
      new Error('Không tìm thấy lịch hẹn phù hợp với số điện thoại và mã đặt lịch đã cung cấp'),
      { status: 404 }
    );
  }

  return appt;
}

async function reassignStaff(id, { newStaffId, appointmentTime, appointmentDate, changedBy, changedById }) {
  if (!id) {
    throw Object.assign(new Error('Appointment ID is required'), { status: 400 });
  }
  if (!newStaffId && !appointmentTime && !appointmentDate) {
    throw Object.assign(new Error('Vui lòng chọn nhân viên hoặc thời gian hẹn cần thay đổi'), { status: 400 });
  }
  return appointmentRepo.reassignStaff(id, { newStaffId, appointmentTime, appointmentDate, changedBy, changedById });
}

async function getActiveStaff() {
  return appointmentRepo.findActiveStaff();
}

module.exports = {
  getBusinessHours,
  checkAvailableSlots,
  holdSlot,
  releaseHoldSlot,
  confirmHoldingSlot,
  createAppointment,
  getAppointmentByToken,
  getUserAppointments,
  cancelAppointment,
  lookupAppointmentByPhoneAndBookingCode,
  reassignStaff,
  getActiveStaff,
  cleanupExpiredHolds: appointmentRepo.cleanupExpiredHolds,
  isValidEmail,
  cleanPhoneNumber,
  PHONE_REGEX,
  EMAIL_REGEX,
};
