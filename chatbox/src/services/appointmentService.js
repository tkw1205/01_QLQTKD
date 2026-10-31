'use strict';

const appointmentRepo = require('../repositories/appointmentRepository');
const settingsRepo = require('../repositories/settingsRepository');

const PHONE_REGEX = /^0[35789][0-9]{8}$/;

function cleanPhoneNumber(phone) {
  if (!phone) return '';

  let p = phone.trim().replace(/[\s.-]/g, '');

  if (p.startsWith('+84')) {
    p = '0' + p.slice(3);
  } else if (p.startsWith('84') && p.length === 11) {
    p = '0' + p.slice(2);
  }

  return p;
}

async function getBusinessHours() {
  const wh = await settingsRepo.getBusinessSetting('working_hours');
  const duration = parseInt(await settingsRepo.get('appointment_duration')) || 30;

  return {
    workingHours: wh,
    appointmentDuration: duration,
  };
}

async function checkAvailableSlots(date, requestedDuration) {
  const durationSetting =
    parseInt(await settingsRepo.get('appointment_duration')) || 30;

  const duration = Number(requestedDuration) || durationSetting;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(
      new Error('Thời lượng dịch vụ không hợp lệ'),
      { status: 400 }
    );
  }

  const d = new Date(date);

  if (isNaN(d.getTime())) {
    throw Object.assign(
      new Error('Ngày không hợp lệ'),
      { status: 400 }
    );
  }

  const nowVN = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
    })
  );

  const todayStr =
    `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;

  if (date < todayStr) {
    throw Object.assign(
      new Error('Không thể đặt lịch vào ngày trong quá khứ'),
      { status: 400 }
    );
  }

  const slots = await appointmentRepo.findAvailableSlots(
    date,
    duration
  );

  return {
    date,
    slots,
    duration,
  };
}

async function holdSlot({
  conversationId,
  guestSessionId,
  appointmentDate,
  appointmentTime,
  durationMinutes,
  productId,
  productIds = [],
  userId = null,
  notes = null,
}) {
  if (!appointmentDate || !appointmentTime) {
    throw Object.assign(
      new Error('Vui lòng cung cấp ngày và giờ cần giữ chỗ'),
      { status: 400 }
    );
  }

  if (!/^\d{2}:\d{2}$/.test(appointmentTime)) {
    throw Object.assign(
      new Error('Giờ hẹn không hợp lệ. Định dạng yêu cầu HH:mm'),
      { status: 400 }
    );
  }

  const d = new Date(appointmentDate);

  if (isNaN(d.getTime())) {
    throw Object.assign(
      new Error('Ngày hẹn không hợp lệ'),
      { status: 400 }
    );
  }

  const nowVN = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
    })
  );

  const todayStr =
    `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;

  if (appointmentDate < todayStr) {
    throw Object.assign(
      new Error('Không thể đặt lịch vào ngày trong quá khứ'),
      { status: 400 }
    );
  }

  const duration =
    Number(durationMinutes) ||
    parseInt(await settingsRepo.get('appointment_duration')) ||
    30;

  if (duration <= 0) {
    throw Object.assign(
      new Error('Thời lượng dịch vụ không hợp lệ'),
      { status: 400 }
    );
  }

  const normalizedProductIds = Array.isArray(productIds)
    ? [...new Set(productIds.filter(Boolean))]
    : [];

  return appointmentRepo.hold({
    conversationId,
    guestSessionId,
    appointmentDate,
    appointmentTime,
    durationMinutes: duration,
    productId: productId || normalizedProductIds[0] || null,
    productIds: normalizedProductIds,
    userId,
    notes,
  });
}

async function releaseHoldSlot({
  holdingToken,
  guestSessionId = null,
}) {
  if (!holdingToken) {
    throw Object.assign(
      new Error('Thiếu mã giữ chỗ'),
      { status: 400 }
    );
  }

  return appointmentRepo.releaseHold(
    holdingToken,
    guestSessionId
  );
}

async function confirmHoldingSlot({
  holdingToken,
  customerName,
  customerPhone,
  notes,
  guestSessionId = null,
  userId = null,
}) {
  if (!holdingToken) {
    throw Object.assign(
      new Error('Thiếu mã giữ chỗ để xác nhận lịch'),
      { status: 400 }
    );
  }

  if (!customerName || !customerName.trim()) {
    throw Object.assign(
      new Error('Vui lòng cung cấp tên khách hàng'),
      { status: 400 }
    );
  }

  if (!customerPhone || !customerPhone.trim()) {
    throw Object.assign(
      new Error('Vui lòng cung cấp số điện thoại'),
      { status: 400 }
    );
  }

  const cleanPhone = cleanPhoneNumber(customerPhone);

  if (!PHONE_REGEX.test(cleanPhone)) {
    throw Object.assign(
      new Error(
        'Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 số tại Việt Nam.'
      ),
      { status: 400 }
    );
  }

  return appointmentRepo.confirmHold({
    holdingToken,
    customerName: customerName.trim(),
    customerPhone: cleanPhone,
    notes: notes ? notes.trim() : null,
    guestSessionId,
    userId,
  });
}

async function createAppointment({
  conversationId,
  guestSessionId,
  confirmedBySystem,
  customerName,
  customerPhone,
  productId,
  productIds,
  appointmentDate,
  appointmentTime,
  durationMinutes,
  notes,
  userId = null,
  staffId = null,
  status = 'pending',
  createdBy = null,
}) {
  if (!confirmedBySystem) {
    throw Object.assign(
      new Error('Lịch hẹn phải được khách xác nhận trước khi tạo'),
      { status: 400 }
    );
  }

  if (
    !customerName ||
    !customerPhone ||
    !appointmentDate ||
    !appointmentTime
  ) {
    throw Object.assign(
      new Error('Thiếu thông tin bắt buộc để tạo lịch hẹn'),
      { status: 400 }
    );
  }

  const cleanPhone = cleanPhoneNumber(customerPhone);

  if (!PHONE_REGEX.test(cleanPhone)) {
    throw Object.assign(
      new Error(
        'Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 số tại Việt Nam.'
      ),
      { status: 400 }
    );
  }

  const duration =
    Number(durationMinutes) ||
    parseInt(await settingsRepo.get('appointment_duration')) ||
    30;

  const normalizedProductIds = Array.isArray(productIds)
    ? [...new Set(productIds.filter(Boolean))]
    : [];

  const appointment = await appointmentRepo.create({
    conversationId,
    guestSessionId,
    customerName: customerName.trim(),
    customerPhone: cleanPhone,
    productId: productId || normalizedProductIds[0] || null,
    productIds: normalizedProductIds,
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

async function getAppointmentByToken(
  confirmationToken,
  guestSessionId,
  currentUser = null
) {
  let appt = await appointmentRepo.findByToken(
    confirmationToken
  );

  if (!appt) {
    appt = await appointmentRepo.findByHoldingToken(
      confirmationToken
    );
  }

  if (!appt) {
    throw Object.assign(
      new Error('Không tìm thấy lịch hẹn'),
      { status: 404 }
    );
  }

  const isGuestOwner =
    appt.guest_session_id === guestSessionId;

  const isUserOwner =
    currentUser &&
    appt.user_id &&
    appt.user_id === currentUser.id;

  const isStaff =
    currentUser &&
    ['admin', 'staff', 'receptionist'].includes(currentUser.role);

  if (!isGuestOwner && !isUserOwner && !isStaff) {
    throw Object.assign(
      new Error('Bạn không có quyền truy cập lịch hẹn này'),
      { status: 403 }
    );
  }

  return appt;
}

async function getUserAppointments(
  userId,
  { page = 1, limit = 20 } = {}
) {
  if (!userId) return [];

  return appointmentRepo.findByUserId(
    userId,
    { page, limit }
  );
}

async function cancelAppointment(
  id,
  guestSessionId,
  currentUser = null
) {
  const appt = await appointmentRepo.findById(id);

  if (!appt) {
    throw Object.assign(
      new Error('Không tìm thấy lịch hẹn'),
      { status: 404 }
    );
  }

  const isGuestOwner =
    appt.guest_session_id === guestSessionId;

  const isUserOwner =
    currentUser &&
    appt.user_id &&
    appt.user_id === currentUser.id;

  const isAdmin =
    currentUser &&
    currentUser.role === 'admin';

  if (!isGuestOwner && !isUserOwner && !isAdmin) {
    throw Object.assign(
      new Error('Bạn không có quyền hủy lịch hẹn này'),
      { status: 403 }
    );
  }

  if (appt.status === 'cancelled') {
    throw Object.assign(
      new Error('Lịch hẹn đã được hủy trước đó'),
      { status: 400 }
    );
  }

  if (appt.status === 'completed') {
    throw Object.assign(
      new Error('Không thể hủy lịch hẹn đã hoàn thành'),
      { status: 400 }
    );
  }

  return appointmentRepo.updateStatus(
    id,
    'cancelled'
  );
}

async function lookupAppointmentByPhoneAndBookingCode(
  phone,
  bookingCode
) {
  if (!phone || !bookingCode) {
    throw Object.assign(
      new Error('Vui lòng cung cấp số điện thoại và mã đặt lịch'),
      { status: 400 }
    );
  }

  const cleanPhone = cleanPhoneNumber(phone);

  if (!PHONE_REGEX.test(cleanPhone)) {
    throw Object.assign(
      new Error('Số điện thoại không hợp lệ'),
      { status: 400 }
    );
  }

  const cleanCode = String(bookingCode)
    .trim()
    .toUpperCase();

  if (!cleanCode) {
    throw Object.assign(
      new Error('Mã đặt lịch không hợp lệ'),
      { status: 400 }
    );
  }

  let appt = null;

  if (
    typeof appointmentRepo.findByBookingCodeAndPhone ===
    'function'
  ) {
    try {
      appt = await appointmentRepo.findByBookingCodeAndPhone(
        cleanCode,
        cleanPhone
      );
    } catch (err) {
      console.warn(
        '[lookupAppointment] Repository lookup error:',
        err.message
      );
    }
  }

  if (!appt && typeof appointmentRepo.findAll === 'function') {
    try {
      const { rows } = await appointmentRepo.findAll({
        limit: 10000,
      });

      if (Array.isArray(rows)) {
        appt = rows.find(a =>
          a.booking_code &&
          String(a.booking_code).trim().toUpperCase() === cleanCode &&
          cleanPhoneNumber(a.customer_phone) === cleanPhone
        ) || null;
      }
    } catch (_) {}
  }

  if (!appt) {
    try {
      const jsonStore = require('../config/jsonStore');
      const appointments =
        jsonStore.getCollection('appointments') || [];

      const found = appointments.find(a =>
        a.booking_code &&
        String(a.booking_code).trim().toUpperCase() === cleanCode &&
        cleanPhoneNumber(a.customer_phone) === cleanPhone
      );

      if (found) {
        const products =
          jsonStore.getCollection('products') || [];

        const selectedProducts = Array.isArray(found.product_ids)
          ? products.filter(p => found.product_ids.includes(p.id))
          : [];

        const firstProduct = found.product_id
          ? products.find(p => p.id === found.product_id)
          : null;

        appt = {
          ...found,
          product_name:
            found.product_name ||
            selectedProducts.map(p => p.name).join(' + ') ||
            (firstProduct ? firstProduct.name : null),
        };
      }
    } catch (_) {}
  }

  if (!appt) {
    throw Object.assign(
      new Error(
        'Không tìm thấy lịch hẹn phù hợp với số điện thoại và mã đặt lịch đã cung cấp'
      ),
      { status: 404 }
    );
  }

  return appt;
}

async function reassignStaff(
  id,
  {
    newStaffId,
    appointmentTime,
    appointmentDate,
    changedBy,
    changedById,
  }
) {
  if (!id) {
    throw Object.assign(
      new Error('Thiếu mã lịch hẹn'),
      { status: 400 }
    );
  }

  if (!newStaffId && !appointmentTime && !appointmentDate) {
    throw Object.assign(
      new Error('Vui lòng chọn nhân viên hoặc thời gian cần thay đổi'),
      { status: 400 }
    );
  }

  return appointmentRepo.reassignStaff(id, {
    newStaffId,
    appointmentTime,
    appointmentDate,
    changedBy,
    changedById,
  });
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
  cleanPhoneNumber,
  PHONE_REGEX,
};