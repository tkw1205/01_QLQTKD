'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');
const {
  assertAppointmentIsFuture,
  getDayOfWeek,
  getLocalDateTimeParts,
} = require('../utils/appointmentDateTime');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function enrichAppointment(appt) {
  if (!appt) return null;
  const products = jsonStore.getCollection('products');
  const product = appt.product_id ? products.find(p => p.id === appt.product_id) : null;
  const users = jsonStore.getCollection('users');
  const staff = appt.staff_id ? users.find(u => u.id === appt.staff_id) : null;
  return {
    ...appt,
    product_name: appt.product_name || (product ? product.name : null),
    price: appt.price ?? null,
    staff_name: appt.staff_name || (staff ? staff.name : null),
  };
}

function getAppointmentDurationMinutes(appointment) {
  const savedDuration = Number(appointment?.duration_minutes);
  if (Number.isFinite(savedDuration) && savedDuration > 0) return savedDuration;

  const productIds = Array.isArray(appointment?.product_ids) && appointment.product_ids.length
    ? appointment.product_ids
    : appointment?.product_id
      ? [appointment.product_id]
      : [];
  if (productIds.length) {
    const products = jsonStore.getCollection('products')
      .filter(product => productIds.includes(product.id));
    if (products.length !== productIds.length) return null;
    try {
      return products.reduce((total, product) =>
        total + getServiceRequirements(
          product,
          appointment.product_sizes?.[product.id] ||
            appointment.hair_size ||
            appointment.size ||
            null
        ).durationMinutes, 0
      );
    } catch (error) {
      if (error.code !== 'HAIR_SIZE_REQUIRED' &&
          error.code !== 'SERVICE_SIZE_UNAVAILABLE') {
        throw error;
      }
      return null;
    }
  }

  const configuredDuration = Number(
    jsonStore.getCollection('system_settings')
      .find(setting => setting.key === 'appointment_duration')?.value
  );
  return Number.isFinite(configuredDuration) && configuredDuration > 0
    ? configuredDuration
    : null;
}

function appointmentOverlapsWindow(appointment, targetStart, targetEnd, closingTime = Infinity) {
  const existingStart = timeToMinutes(appointment.appointment_time);
  const duration = getAppointmentDurationMinutes(appointment);
  const existingEnd = duration ? existingStart + duration : closingTime;
  return existingStart < targetEnd && existingEnd > targetStart;
}

function getServiceRequirements(product, hairSize) {
  const tiers = product.prices_by_size;
  const hasSizeTiers = tiers && Object.keys(tiers).length > 0;
  if (hasSizeTiers && !hairSize) {
    throw Object.assign(new Error(`Cần xác định size tóc cho dịch vụ ${product.name}.`), {
      status: 400,
      code: 'HAIR_SIZE_REQUIRED',
    });
  }

  const tier = hasSizeTiers ? tiers[hairSize] : null;
  if (hasSizeTiers && !tier) {
    throw Object.assign(new Error(`Dịch vụ ${product.name} không hỗ trợ size ${hairSize}.`), {
      status: 400,
      code: 'SERVICE_SIZE_UNAVAILABLE',
    });
  }

  const durationMinutes = Number(tier?.duration ?? product.duration_minutes ?? product.duration);
  const staffCount = Number(tier?.staff_count ?? product.staff_count);
  const price = Number(tier?.price ?? product.price);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw Object.assign(new Error(`Danh mục thiếu thời lượng hợp lệ cho dịch vụ ${product.name}.`), {
      status: 503,
      code: 'SERVICE_DURATION_MISSING',
    });
  }
  if (!Number.isInteger(staffCount) || staffCount <= 0) {
    throw Object.assign(new Error(`Danh mục thiếu số nhân viên hợp lệ cho dịch vụ ${product.name}.`), {
      status: 503,
      code: 'SERVICE_STAFF_COUNT_MISSING',
    });
  }
  if (!Number.isFinite(price) || price < 0) {
    throw Object.assign(new Error(`Danh mục thiếu giá hợp lệ cho dịch vụ ${product.name}.`), {
      status: 503,
      code: 'SERVICE_PRICE_MISSING',
    });
  }
  return { durationMinutes, staffCount, price };
}

function getServiceSize(product, productSizes = {}, hairSize = null) {
  return productSizes[product.id] || hairSize || null;
}

function getSelectedServiceRequirements(products, productSizes = {}, hairSize = null) {
  return products.map(product =>
    getServiceRequirements(product, getServiceSize(product, productSizes, hairSize))
  );
}

function getWorkingHoursForDate(businessSettings, date) {
  const setting = businessSettings.find(item => item.key === 'working_hours');
  if (!setting?.value) {
    throw Object.assign(new Error('Salon working hours are not configured'), {
      status: 503,
      code: 'BUSINESS_HOURS_UNAVAILABLE',
    });
  }

  let workingHours;
  try {
    workingHours = typeof setting.value === 'string'
      ? JSON.parse(setting.value)
      : setting.value;
  } catch (error) {
    throw Object.assign(new Error('Salon working hours configuration is invalid'), {
      status: 503,
      code: 'BUSINESS_HOURS_INVALID',
      cause: error,
    });
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayConfig = workingHours?.[dayNames[getDayOfWeek(date)]];
  if (!dayConfig) {
    throw Object.assign(new Error('Working hours are missing for the requested day'), {
      status: 503,
      code: 'BUSINESS_HOURS_UNAVAILABLE',
    });
  }
  if (dayConfig.enabled === false) return { closed: true };

  const isValidTime = value => typeof value === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
  if (!isValidTime(dayConfig.open) || !isValidTime(dayConfig.close) ||
      timeToMinutes(dayConfig.close) <= timeToMinutes(dayConfig.open)) {
    throw Object.assign(new Error('Working hours for the requested day are invalid'), {
      status: 503,
      code: 'BUSINESS_HOURS_INVALID',
    });
  }
  return dayConfig;
}

function getActiveStaffCount(users) {
  return users.filter(user =>
    user.is_active !== false &&
    user.is_available !== false &&
    ['staff', 'admin', 'receptionist'].includes(user.role)
  ).length;
}

function isSlotOccupiedByAppt(appt, now = Date.now()) {
  if (appt.status === 'cancelled') return false;
  if (appt.status === 'holding') {
    if (appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) {
      return false; // Holding expired, slot is free
    }
  }
  return true;
}

function cleanupExpiredHolds() {
  const appointments = jsonStore.getCollection('appointments');
  const now = Date.now();
  let modified = false;
  let count = 0;

  for (const appt of appointments) {
    if (appt.status === 'holding' && appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) {
      appt.status = 'cancelled';
      appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot expired (TTL 5m)';
      appt.updated_at = new Date().toISOString();
      modified = true;
      count++;
    }
  }

  if (modified) {
    jsonStore.saveCollection('appointments', appointments);
  }
  return count;
}

function generateBookingCode(date) {
  const cleanDate = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${cleanDate}-${rand}`;
}

async function findAvailableSlots(date, durationMinutes, { requiredStaff = 1 } = {}) {
  if (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) <= 0) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 400,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }
  if (!Number.isInteger(Number(requiredStaff)) || Number(requiredStaff) <= 0) {
    throw Object.assign(new Error('A valid service staff requirement is required'), {
      status: 400,
      code: 'SERVICE_STAFF_COUNT_MISSING',
    });
  }
  cleanupExpiredHolds();
  const businessSettings = jsonStore.getCollection('business_settings');
  const dayConfig = getWorkingHoursForDate(businessSettings, date);
  if (dayConfig.closed) return [];

  const appointments = jsonStore.getCollection('appointments');
  const users = jsonStore.getCollection('users');
  const slotCapacitySetting = businessSettings.find(setting => setting.key === 'slot_capacity');
  const activeStaffCount = getActiveStaffCount(users);
  const staffCapacity = slotCapacitySetting
    ? Number(slotCapacitySetting.value)
    : activeStaffCount;
  if (!Number.isFinite(staffCapacity) || staffCapacity < Number(requiredStaff)) {
    throw Object.assign(new Error('Not enough active staff for the selected service'), {
      status: 409,
      code: 'INSUFFICIENT_STAFF',
    });
  }
  const now = Date.now();
  const dayAppointments = appointments.filter(
    a => a.appointment_date === date && isSlotOccupiedByAppt(a, now)
  );

  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const nowVN = getLocalDateTimeParts(now);
  const todayVNStr = `${nowVN.year}-${String(nowVN.month).padStart(2, '0')}-${String(nowVN.day).padStart(2, '0')}`;
  const currentMinutesVN = nowVN.hour * 60 + nowVN.minute;

  const slots = [];
  for (let t = openMinutes; t + durationMinutes <= closeMinutes; t += 1) {
    // If checking today, ignore past time slots
    if (date === todayVNStr && t <= currentMinutesVN) {
      continue;
    }
    const end = t + durationMinutes;
    const isOccupied = dayAppointments.some(appointment =>
      appointmentOverlapsWindow(appointment, t, end, closeMinutes)
    );
    if (!isOccupied) {
      const hours = Math.floor(t / 60).toString().padStart(2, '0');
      const mins = (t % 60).toString().padStart(2, '0');
      slots.push(`${hours}:${mins}`);
    }
  }

  return slots;
}

async function hold({
  conversationId, guestSessionId, appointmentDate, appointmentTime,
  durationMinutes = 30, productId = null, productIds = null, productSizes = {}, hairSize = null,
  userId = null, notes = null,
}) {
  const now = Date.now();
  assertAppointmentIsFuture(appointmentDate, appointmentTime, now);
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const businessSettings = jsonStore.getCollection('business_settings');
  const products = jsonStore.getCollection('products');
  const selectedProducts = Array.isArray(productIds) && productIds.length > 0
    ? products.filter(product => productIds.includes(product.id) && product.status === 'active')
    : productId
      ? products.filter(product => product.id === productId && product.status === 'active')
      : [];
  const requestedProductCount = Array.isArray(productIds) && productIds.length > 0
    ? productIds.length
    : productId
      ? 1
      : 0;
  if (!productSizes || typeof productSizes !== 'object' || Array.isArray(productSizes)) {
    throw Object.assign(new Error('Invalid service size selection.'), {
      status: 400,
      code: 'INVALID_SERVICE_SIZE',
    });
  }
  if (selectedProducts.length !== requestedProductCount) {
    throw Object.assign(new Error('Một hoặc nhiều dịch vụ đã chọn không còn khả dụng.'), {
      status: 400,
      code: 'INVALID_SERVICES',
    });
  }
  if (productId && selectedProducts.length === 0) {
    throw Object.assign(new Error('Dịch vụ đã chọn không còn khả dụng.'), {
      status: 400,
      code: 'INVALID_SERVICES',
    });
  }
  const serviceRequirements = getSelectedServiceRequirements(selectedProducts, productSizes, hairSize);
  const selectedDuration = selectedProducts.length > 0
    ? serviceRequirements.reduce((total, requirements) => total + requirements.durationMinutes, 0)
    : Number(durationMinutes);
  if (!Number.isFinite(Number(selectedDuration)) || Number(selectedDuration) <= 0) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 400,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }
  const selectedPrice = selectedProducts.length > 0
    ? serviceRequirements.reduce((total, requirements) => total + requirements.price, 0)
    : null;
  const requiredStaff = serviceRequirements.length
    ? Math.max(...serviceRequirements.map(requirements => requirements.staffCount))
    : 1;
  const activeStaffCount = getActiveStaffCount(jsonStore.getCollection('users'));
  if (activeStaffCount < requiredStaff) {
    throw Object.assign(new Error('Not enough active staff for the selected service'), {
      status: 409,
      code: 'INSUFFICIENT_STAFF',
    });
  }
  const selectedProductIds = selectedProducts.map(product => product.id);
  const selectedProductId = selectedProductIds[0] || productId;
  const selectedProductName = selectedProducts.length > 0
    ? selectedProducts.map(product => product.name).join(' + ')
    : null;

  const dayConfig = getWorkingHoursForDate(businessSettings, appointmentDate);
  if (dayConfig.closed) {
    throw Object.assign(
      new Error(`Salon không hoạt động vào ngày đã chọn (${appointmentDate}). Vui lòng chọn ngày làm việc khác.`),
      { status: 400 }
    );
  }

  const openTime = dayConfig.open;
  const closeTime = dayConfig.close;
  const startMinutes = timeToMinutes(appointmentTime);
  const endMinutes = startMinutes + selectedDuration;
  const closeMinutes = timeToMinutes(closeTime);
  if (startMinutes < timeToMinutes(openTime) || endMinutes > closeMinutes) {
    throw Object.assign(
      new Error(`Lịch hẹn phải nằm trong giờ hoạt động của salon (${openTime} - ${closeTime}).`),
      { status: 400 }
    );
  }

  // Check conflicts
  const conflict = appointments.some(a =>
    a.appointment_date === appointmentDate &&
    isSlotOccupiedByAppt(a, now) &&
    appointmentOverlapsWindow(
      a,
      timeToMinutes(appointmentTime),
      timeToMinutes(appointmentTime) + selectedDuration,
      timeToMinutes(closeTime)
    )
  );

  if (conflict) {
    throw Object.assign(
      new Error('This time slot is no longer available. Please select another slot.'),
      { status: 409, code: 'SLOT_CONFLICT' }
    );
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(now + HOLD_DURATION_MS).toISOString();
  const holdingToken = uuidv4();

  const newAppt = {
    id: uuidv4(),
    user_id: userId || null,
    conversation_id: conversationId || null,
    guest_session_id: guestSessionId,
    holding_token: holdingToken,
    confirmation_token: uuidv4(),
    booking_code: null,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    product_id: selectedProductId || null,
    product_ids: selectedProductIds,
    product_sizes: Object.fromEntries(selectedProducts
      .filter(product => getServiceSize(product, productSizes, hairSize))
      .map(product => [product.id, getServiceSize(product, productSizes, hairSize)])),
    hair_size: hairSize || null,
    product_name: selectedProductName,
    price: selectedPrice,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    duration_minutes: selectedDuration,
    staff_count: requiredStaff,
    status: 'holding',
    hold_expires_at: expiresAt,
    notes: notes || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  appointments.push(newAppt);
  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(newAppt);
}

async function releaseHold(holdingToken, guestSessionId = null) {
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a =>
    a.holding_token === holdingToken &&
    (!guestSessionId || a.guest_session_id === guestSessionId)
  );

  if (!appt) return null;

  appt.status = 'cancelled';
  appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Hold released by client';
  appt.updated_at = new Date().toISOString();
  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(appt);
}

async function confirmHold({
  holdingToken, customerName, customerPhone, customerEmail, notes, guestSessionId = null, userId = null,
}) {
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.holding_token === holdingToken);

  if (!appt) {
    cleanupExpiredHolds();
    throw Object.assign(new Error('Holding appointment not found'), { status: 404 });
  }

  if (guestSessionId && appt.guest_session_id && appt.guest_session_id !== guestSessionId) {
    throw Object.assign(new Error('Access denied to this holding session'), { status: 403 });
  }

  if (appt.status === 'confirmed') {
    return enrichAppointment(appt); // Idempotent
  }

  // Check TTL expiration first before status or cleanupExpiredHolds masks it
  const now = Date.now();
  const isHoldExpired = (appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) ||
    (appt.status === 'cancelled' && (appt.notes && (appt.notes.includes('Hold expired') || appt.notes.includes('Holding slot expired'))));

  if (isHoldExpired) {
    if (appt.status !== 'cancelled') {
      appt.status = 'cancelled';
      appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Hold expired';
      appt.updated_at = new Date().toISOString();
      jsonStore.saveCollection('appointments', appointments);
    }
    cleanupExpiredHolds();

    throw Object.assign(
      new Error('The temporary hold has expired. Please select a time slot again.'),
      {
        status: 410,
        code: 'HOLD_EXPIRED',
        preservedData: { customerName, customerPhone, customerEmail, productId: appt.product_id },
      }
    );
  }

  if (appt.status !== 'holding') {
    throw Object.assign(new Error('Appointment is not in holding state'), { status: 400 });
  }

  assertAppointmentIsFuture(appt.appointment_date, appt.appointment_time, now);

  cleanupExpiredHolds();
  const dayConfig = getWorkingHoursForDate(
    jsonStore.getCollection('business_settings'),
    appt.appointment_date
  );
  const holdDuration = getAppointmentDurationMinutes(appt);
  if (!holdDuration) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 503,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }
  const closeMinutes = dayConfig.closed ? 24 * 60 : timeToMinutes(dayConfig.close);
  const holdStart = timeToMinutes(appt.appointment_time);

  let confirmedDuration = Number(appt.duration_minutes) || 30;
  let confirmedPrice = appt.price;
  let confirmedProductName = appt.product_name;
  const heldProductIds = Array.isArray(appt.product_ids) && appt.product_ids.length
    ? appt.product_ids
    : appt.product_id
      ? [appt.product_id]
      : [];
  if (heldProductIds.length) {
    const products = jsonStore.getCollection('products');
    const selectedProducts = heldProductIds.map(id => products.find(product => product.id === id && product.status === 'active'));
    if (selectedProducts.some(product => !product)) {
      appt.status = 'cancelled';
      appt.notes = (appt.notes ? `${appt.notes} | ` : '') + 'Service unavailable at confirmation';
      appt.updated_at = new Date().toISOString();
      jsonStore.saveCollection('appointments', appointments);
      throw Object.assign(new Error('Một hoặc nhiều dịch vụ đã chọn không còn khả dụng.'), {
        status: 400,
        code: 'INVALID_SERVICES',
      });
    }

    const productSizes = appt.product_sizes || {};
    const serviceRequirements = getSelectedServiceRequirements(
      selectedProducts,
      productSizes,
      appt.hair_size || appt.size || null
    );
    confirmedDuration = serviceRequirements.reduce(
      (total, requirements) => total + requirements.durationMinutes,
      0
    );
    confirmedPrice = serviceRequirements.reduce(
      (total, requirements) => total + requirements.price,
      0
    );
    confirmedProductName = selectedProducts.map(product => product.name).join(' + ');

    const businessSettings = jsonStore.getCollection('business_settings');
    const hoursSetting = businessSettings.find(setting => setting.key === 'working_hours');
    const workingHours = hoursSetting
      ? (typeof hoursSetting.value === 'string' ? JSON.parse(hoursSetting.value) : hoursSetting.value)
      : {};
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayConfig = workingHours[dayNames[getDayOfWeek(appt.appointment_date)]];
    const openMinutes = timeToMinutes(dayConfig?.open || '08:30');
    const closeMinutes = timeToMinutes(dayConfig?.close || '20:30');
    const startMinutes = timeToMinutes(appt.appointment_time);
    if ((dayConfig && dayConfig.enabled === false) ||
        startMinutes < openMinutes || startMinutes + confirmedDuration > closeMinutes) {
      throw Object.assign(new Error('Thời lượng dịch vụ đã thay đổi; vui lòng chọn lại khung giờ.'), {
        status: 400,
        code: 'SERVICE_DURATION_CHANGED',
      });
    }
  }

  // Double check Step 9: Re-verify conflict with other confirmed/pending appointments
  const conflict = appointments.some(a =>
    a.id !== appt.id &&
    a.appointment_date === appt.appointment_date &&
    isSlotOccupiedByAppt(a, now) &&
    appointmentOverlapsWindow(a, holdStart, holdStart + holdDuration, closeMinutes)
  );

  if (conflict) {
    throw Object.assign(
      new Error('This time slot was just booked by another customer. Please choose an alternative slot.'),
      {
        status: 409,
        code: 'SLOT_CONFLICT',
        preservedData: { customerName, customerPhone, customerEmail, productId: appt.product_id },
      }
    );
  }

  // Commit Step 9: Set confirmed and generate booking code
  const nowIso = new Date().toISOString();
  appt.customer_name = customerName;
  appt.customer_phone = customerPhone;
  appt.customer_email = customerEmail || appt.customer_email || null;
  appt.notes = notes || appt.notes || null;
  appt.duration_minutes = confirmedDuration;
  appt.price = confirmedPrice;
  appt.product_name = confirmedProductName;
  if (userId) appt.user_id = userId;
  appt.status = 'confirmed';
  appt.booking_code = generateBookingCode(appt.appointment_date);
  appt.confirmed_at = nowIso;
  appt.updated_at = nowIso;

  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(appt);
}

async function create({
  conversationId, guestSessionId, customerName, customerPhone, customerEmail,
  productId, productIds, productSizes = {}, appointmentDate, appointmentTime, durationMinutes = 30, notes,
  userId = null, hairSize = null, staffId = null, status = 'pending', createdBy = null, price = null
}) {
  const now = Date.now();
  assertAppointmentIsFuture(appointmentDate, appointmentTime, now);
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const businessSettings = jsonStore.getCollection('business_settings');
  const users = jsonStore.getCollection('users');
  const products = jsonStore.getCollection('products');

  // Multi-service support & calculate duration / price
  let selectedProducts = [];
  if (Array.isArray(productIds) && productIds.length > 0) {
    selectedProducts = products.filter(p => productIds.includes(p.id) && p.status === 'active');
    if (selectedProducts.length !== productIds.length) {
      throw Object.assign(new Error('Một hoặc nhiều dịch vụ đã chọn không còn khả dụng.'), {
        status: 400,
        code: 'INVALID_SERVICES',
      });
    }
  } else if (productId) {
    const p = products.find(prod => prod.id === productId && prod.status === 'active');
    if (p) selectedProducts = [p];
    else {
      throw Object.assign(new Error('Dịch vụ đã chọn không còn khả dụng.'), {
        status: 400,
        code: 'INVALID_SERVICES',
      });
    }
  }
  if (!productSizes || typeof productSizes !== 'object' || Array.isArray(productSizes)) {
    throw Object.assign(new Error('Invalid service size selection.'), {
      status: 400,
      code: 'INVALID_SERVICE_SIZE',
    });
  }
  const serviceRequirements = getSelectedServiceRequirements(selectedProducts, productSizes, hairSize);
  let finalDuration = durationMinutes === undefined || durationMinutes === null
    ? null
    : Number(durationMinutes);
  let finalPrice = price;
  let finalProductName = null;
  let finalProductId = productId || null;

  if (selectedProducts.length > 0) {
    finalDuration = serviceRequirements.reduce(
      (sum, requirements) => sum + requirements.durationMinutes,
      0
    );
    finalPrice = serviceRequirements.reduce((sum, requirements) => sum + requirements.price, 0);
    finalProductName = selectedProducts.map(p => p.name).join(' + ');
    finalProductId = selectedProducts[0].id;
  } else if (productId) {
    throw Object.assign(new Error('Dịch vụ đã chọn không còn khả dụng.'), {
      status: 400,
      code: 'INVALID_SERVICES',
    });
  }
  if (!Number.isFinite(Number(finalDuration)) || Number(finalDuration) <= 0) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 400,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }

  const dayConfig = getWorkingHoursForDate(businessSettings, appointmentDate);
  if (dayConfig.closed) {
    throw Object.assign(
      new Error(`Salon không hoạt động vào ngày đã chọn (${appointmentDate}). Vui lòng chọn ngày làm việc khác.`),
      { status: 400 }
    );
  }

  const openTime = dayConfig.open;
  const closeTime = dayConfig.close;
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const startMinutes = timeToMinutes(appointmentTime);
  const endMinutes = startMinutes + finalDuration;

  if (startMinutes < openMinutes) {
    throw Object.assign(
      new Error(`Thời gian hẹn (${appointmentTime}) nằm ngoài giờ mở cửa của salon (mở cửa lúc ${openTime}).`),
      { status: 400 }
    );
  }

  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endTimeStr = `${endH}:${endM}`;

  if (endMinutes > closeMinutes) {
    throw Object.assign(
      new Error(`Lịch hẹn kéo dài ${finalDuration} phút sẽ kết thúc lúc ${endTimeStr}, vượt quá giờ đóng cửa của salon (${closeTime}).`),
      { status: 400 }
    );
  }

  // 2. Validate Staff (if assigned)
  let targetStaff = null;
  if (staffId) {
    targetStaff = users.find(u => u.id === staffId);
    if (!targetStaff) {
      throw Object.assign(new Error('Nhân viên không tồn tại trong hệ thống'), { status: 404 });
    }
    if (targetStaff.is_active === false) {
      throw Object.assign(new Error(`Nhân viên ${targetStaff.name} đang bị khóa hoặc ngừng hoạt động`), { status: 400 });
    }
    if (targetStaff.is_available === false) {
      throw Object.assign(new Error(`Nhân viên ${targetStaff.name} hiện đang tạm ngưng tiếp nhận lịch`), { status: 400 });
    }

    // Check staff time conflict
    const conflictingAppt = appointments.find(a =>
      a.staff_id === staffId &&
      a.appointment_date === appointmentDate &&
      a.status !== 'cancelled' &&
      isSlotOccupiedByAppt(a, now) &&
      appointmentOverlapsWindow(
        a,
        startMinutes,
        endMinutes,
        closeMinutes
      )
    );

    if (conflictingAppt) {
      const conflictStart = conflictingAppt.appointment_time;
      const [ch, cm] = conflictStart.split(':').map(Number);
      const cEndMinutes = Math.min(
        closeMinutes,
        ch * 60 + cm + (getAppointmentDurationMinutes(conflictingAppt) || closeMinutes)
      );
      const cEndH = Math.floor(cEndMinutes / 60).toString().padStart(2, '0');
      const cEndM = (cEndMinutes % 60).toString().padStart(2, '0');
      const conflictEnd = `${cEndH}:${cEndM}`;

      throw Object.assign(
        new Error(`Nhân viên ${targetStaff.name} đã có lịch hẹn phục vụ khách (${conflictingAppt.customer_name || 'Khách hàng'}) từ ${conflictStart} đến ${conflictEnd}.`),
        { status: 409, code: 'STAFF_TIME_CONFLICT' }
      );
    }
  }

  // 3. Check Slot Capacity Across All Affected 1-Hour Intervals
  const slotCapacitySetting = businessSettings.find(s => s.key === 'slot_capacity');
  const activeStaffCount = getActiveStaffCount(users);
  const maxSlotCapacity = slotCapacitySetting ? Number(slotCapacitySetting.value) : activeStaffCount;
  const requiredStaffCount = serviceRequirements.length
    ? Math.max(...serviceRequirements.map(requirements => requirements.staffCount))
    : 1;
  if (!Number.isFinite(maxSlotCapacity) || maxSlotCapacity < requiredStaffCount) {
    throw Object.assign(new Error('Not enough active staff for the selected service'), {
      status: 409,
      code: 'INSUFFICIENT_STAFF',
    });
  }

  const startHourFloor = Math.floor(startMinutes / 60);
  const endHourCeil = Math.ceil(endMinutes / 60);

  for (let H = startHourFloor; H < endHourCeil; H++) {
    const slotStartMin = H * 60;
    const slotEndMin = (H + 1) * 60;

    if (startMinutes < slotEndMin && endMinutes > slotStartMin) {
      const slotHourStr = `${String(H).padStart(2, '0')}:00`;

      const slotConcurrentAppts = appointments.filter(a =>
        a.appointment_date === appointmentDate &&
        a.status !== 'cancelled' &&
        isSlotOccupiedByAppt(a, now) &&
        appointmentOverlapsWindow(
          a,
          slotStartMin,
          slotEndMin,
          closeMinutes
        )
      );

      const occupiedStaff = slotConcurrentAppts.reduce(
        (total, appointment) => total + (Number(appointment.staff_count) || 1),
        0
      );
      if (occupiedStaff + requiredStaffCount > maxSlotCapacity) {
        throw Object.assign(
          new Error(`Khung giờ ${slotHourStr} ngày ${appointmentDate} đã kín chỗ (tối đa ${maxSlotCapacity} khách phục vụ cùng lúc).`),
          { status: 409, code: 'SLOT_CAPACITY_EXCEEDED' }
        );
      }
    }
  }

  // 4. Backward-compatible general slot conflict check (when no specific staff is assigned)
  if (!staffId) {
    const conflict = appointments.some(a =>
      a.appointment_date === appointmentDate &&
      isSlotOccupiedByAppt(a, now) &&
        appointmentOverlapsWindow(
          a,
          startMinutes,
          endMinutes,
          closeMinutes
        )
    );
    if (conflict) {
      throw Object.assign(
        new Error('This time slot has just been booked. Please choose another.'),
        { status: 409, code: 'SLOT_CONFLICT' }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const newAppt = {
    id: uuidv4(),
    user_id: userId || null,
    conversation_id: conversationId || null,
    guest_session_id: guestSessionId,
    confirmation_token: uuidv4(),
    holding_token: null,
    booking_code: generateBookingCode(appointmentDate),
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail || null,
    staff_id: staffId || null,
    staff_name: targetStaff ? targetStaff.name : null,
    staff_count: requiredStaffCount,
    product_id: finalProductId,
    product_ids: selectedProducts.map(p => p.id),
    product_sizes: Object.fromEntries(selectedProducts
      .filter(product => getServiceSize(product, productSizes, hairSize))
      .map(product => [product.id, getServiceSize(product, productSizes, hairSize)])),
    hair_size: hairSize || null,
    product_name: finalProductName,
    price: finalPrice,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    duration_minutes: finalDuration,
    status: status || 'pending',
    notes: notes || null,
    history: [
      {
        action: 'create',
        changed_by: createdBy || customerName || 'Khách hàng',
        changed_at: nowIso,
        notes: 'Tạo lịch hẹn mới'
      }
    ],
    created_at: nowIso,
    updated_at: nowIso,
  };

  appointments.push(newAppt);
  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(newAppt);
}

async function findByUserId(userId, { page = 1, limit = 20 } = {}) {
  if (!userId) return [];
  const appointments = jsonStore.getCollection('appointments');
  const matched = appointments.filter(a => a.user_id === userId);

  matched.sort((a, b) => {
    const dComp = b.appointment_date.localeCompare(a.appointment_date);
    if (dComp !== 0) return dComp;
    return b.appointment_time.localeCompare(a.appointment_time);
  });

  const offset = (page - 1) * limit;
  return matched.slice(offset, offset + limit).map(enrichAppointment);
}

async function findByToken(confirmationToken) {
  if (!confirmationToken || !UUID_REGEX.test(confirmationToken)) return null;
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.confirmation_token === confirmationToken);
  return enrichAppointment(appt);
}

async function findByHoldingToken(holdingToken) {
  if (!holdingToken || !UUID_REGEX.test(holdingToken)) return null;
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.holding_token === holdingToken);
  return enrichAppointment(appt);
}

async function findById(id) {
  if (!id || !UUID_REGEX.test(id)) return null;
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.id === id);
  return enrichAppointment(appt);
}

async function findByBookingCodeAndPhone(bookingCode, phone) {
  if (!bookingCode || !phone) return null;
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const cleanCode = String(bookingCode).trim().toUpperCase();
  const cleanPhone = String(phone).trim();
  const appt = appointments.find(a =>
    a.booking_code &&
    String(a.booking_code).trim().toUpperCase() === cleanCode &&
    a.customer_phone &&
    String(a.customer_phone).trim() === cleanPhone
  );
  return enrichAppointment(appt);
}

async function findBySession(guestSessionId, { page = 1, limit = 10 } = {}) {
  const appointments = jsonStore.getCollection('appointments');
  const matched = appointments.filter(a => a.guest_session_id === guestSessionId);

  matched.sort((a, b) => {
    const dComp = b.appointment_date.localeCompare(a.appointment_date);
    if (dComp !== 0) return dComp;
    return b.appointment_time.localeCompare(a.appointment_time);
  });

  const offset = (page - 1) * limit;
  return matched.slice(offset, offset + limit).map(enrichAppointment);
}

async function findAll({ status, date, page = 1, limit = 20 } = {}) {
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  let matched = [...appointments];

  if (status) {
    matched = matched.filter(a => a.status === status);
  }
  if (date) {
    matched = matched.filter(a => a.appointment_date === date);
  }

  matched.sort((a, b) => {
    const dComp = b.appointment_date.localeCompare(a.appointment_date);
    if (dComp !== 0) return dComp;
    return b.appointment_time.localeCompare(a.appointment_time);
  });

  const total = matched.length;
  const offset = (page - 1) * limit;
  const rows = matched.slice(offset, offset + limit).map(enrichAppointment);

  return { rows, total };
}

async function updateStatus(id, status, guestSessionId = null) {
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.id === id && (!guestSessionId || a.guest_session_id === guestSessionId));
  if (!appt) return null;

  appt.status = status;
  appt.updated_at = new Date().toISOString();
  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(appt);
}

async function reschedule(id, { appointmentDate, appointmentTime, durationMinutes }, guestSessionId = null) {
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.id === id && (!guestSessionId || a.guest_session_id === guestSessionId));
  if (!appt) return null;

  const now = Date.now();
  assertAppointmentIsFuture(appointmentDate, appointmentTime, now);
  const targetDuration = Number(durationMinutes) > 0
    ? Number(durationMinutes)
    : getAppointmentDurationMinutes(appt);
  if (!targetDuration) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 503,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }
  const dayConfig = getWorkingHoursForDate(
    jsonStore.getCollection('business_settings'),
    appointmentDate
  );
  if (dayConfig.closed) {
    throw Object.assign(new Error(`Salon không hoạt động vào ngày đã chọn (${appointmentDate}).`), {
      status: 400,
    });
  }
  const closeMinutes = timeToMinutes(dayConfig.close);
  const start = timeToMinutes(appointmentTime);
  const conflict = appointments.some(a =>
    a.id !== id &&
    a.appointment_date === appointmentDate &&
    isSlotOccupiedByAppt(a, now) &&
    appointmentOverlapsWindow(a, start, start + targetDuration, closeMinutes)
  );

  if (conflict) {
    throw Object.assign(new Error('Time slot is already taken'), { status: 409, code: 'SLOT_CONFLICT' });
  }

  appt.appointment_date = appointmentDate;
  appt.appointment_time = appointmentTime;
  appt.duration_minutes = targetDuration;
  appt.updated_at = new Date().toISOString();
  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(appt);
}

async function getCounts() {
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const result = {
    pending: 0,
    holding: 0,
    confirmed: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    total: 0,
  };
  for (const a of appointments) {
    if (result[a.status] !== undefined) {
      result[a.status]++;
    }
    result.total++;
  }
  return result;
}

async function getUpcoming(days = 3) {
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const future = new Date(today);
  future.setDate(future.getDate() + days);
  future.setHours(23, 59, 59, 999);

  const matched = appointments.filter(a => {
    if (a.status !== 'pending' && a.status !== 'confirmed') return false;
    const d = new Date(a.appointment_date);
    return d >= today && d <= future;
  });

  matched.sort((a, b) => {
    const dComp = a.appointment_date.localeCompare(b.appointment_date);
    if (dComp !== 0) return dComp;
    return a.appointment_time.localeCompare(b.appointment_time);
  });

  return matched.slice(0, 20).map(enrichAppointment);
}

async function findActiveHoldByConversation(conversationId) {
  if (!conversationId) return null;
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const now = Date.now();
  const found = appointments.find(a =>
    a.conversation_id === conversationId &&
    a.status === 'holding' &&
    (!a.hold_expires_at || new Date(a.hold_expires_at).getTime() > now)
  );
  return found ? enrichAppointment(found) : null;
}

async function findConfirmedByConversation(conversationId) {
  if (!conversationId) return null;
  const appointments = jsonStore.getCollection('appointments');
  const found = appointments
    .filter(a =>
      a.conversation_id === conversationId &&
      a.status === 'confirmed' &&
      a.booking_code
    )
    .sort((a, b) => new Date(b.confirmed_at || b.created_at) - new Date(a.confirmed_at || a.created_at))[0];
  return found ? enrichAppointment(found) : null;
}

async function reassignStaff(id, { newStaffId, appointmentTime, appointmentDate, changedBy, changedById }) {
  cleanupExpiredHolds();
  const appointments = jsonStore.getCollection('appointments');
  const appt = appointments.find(a => a.id === id);
  if (!appt) {
    throw Object.assign(new Error('Lịch hẹn không tồn tại'), { status: 404 });
  }

  if (appt.status === 'cancelled') {
    throw Object.assign(new Error('Không thể điều chỉnh lịch hẹn đã bị hủy'), { status: 400 });
  }

  if (appt.status === 'completed') {
    throw Object.assign(new Error('Không thể điều chỉnh lịch hẹn đã hoàn thành'), { status: 400 });
  }

  const users = jsonStore.getCollection('users');
  const targetDate = appointmentDate || appt.appointment_date;
  const targetTime = appointmentTime || appt.appointment_time;
  const targetStaffId = newStaffId !== undefined ? newStaffId : appt.staff_id;
  const duration = getAppointmentDurationMinutes(appt);
  if (!duration) {
    throw Object.assign(new Error('A valid service duration is required'), {
      status: 503,
      code: 'SERVICE_DURATION_REQUIRED',
    });
  }

  if (!targetTime || !/^\d{2}:\d{2}$/.test(targetTime)) {
    throw Object.assign(new Error('Giờ hẹn không hợp lệ (định dạng HH:mm)'), { status: 400 });
  }
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw Object.assign(new Error('Ngày hẹn không hợp lệ (định dạng YYYY-MM-DD)'), { status: 400 });
  }

  if (
    targetDate === appt.appointment_date &&
    targetTime === appt.appointment_time &&
    (targetStaffId || null) === (appt.staff_id || null)
  ) {
    return enrichAppointment(appt);
  }

  assertAppointmentIsFuture(targetDate, targetTime);

  // 1. Check Salon Operating Hours & Open Day Status
  const businessSettings = jsonStore.getCollection('business_settings');
  const dayConfig = getWorkingHoursForDate(businessSettings, targetDate);
  if (dayConfig.closed) {
    throw Object.assign(
      new Error(`Salon không hoạt động vào ngày đã chọn (${targetDate}). Vui lòng chọn ngày làm việc khác.`),
      { status: 400 }
    );
  }

  const openTime = dayConfig.open;
  const closeTime = dayConfig.close;
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const startMinutes = timeToMinutes(targetTime);
  const endMinutes = startMinutes + duration;

  if (startMinutes < openMinutes) {
    throw Object.assign(
      new Error(`Thời gian hẹn (${targetTime}) nằm ngoài giờ mở cửa của salon (mở cửa lúc ${openTime}).`),
      { status: 400 }
    );
  }

  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endTimeStr = `${endH}:${endM}`;

  if (endMinutes > closeMinutes) {
    throw Object.assign(
      new Error(`Lịch hẹn kéo dài ${duration} phút sẽ kết thúc lúc ${endTimeStr}, vượt quá giờ đóng cửa của salon (${closeTime}).`),
      { status: 400 }
    );
  }

  // 2. Check Staff Validity & Availability (if staff is assigned)
  let targetStaff = null;
  if (targetStaffId) {
    targetStaff = users.find(u => u.id === targetStaffId);
    if (!targetStaff) {
      throw Object.assign(new Error('Nhân viên không tồn tại trong hệ thống'), { status: 404 });
    }
    if (targetStaff.is_active === false) {
      throw Object.assign(new Error(`Nhân viên ${targetStaff.name} đang bị khóa hoặc ngừng hoạt động`), { status: 400 });
    }
    if (targetStaff.is_available === false) {
      throw Object.assign(new Error(`Nhân viên ${targetStaff.name} hiện đang tạm ngưng tiếp nhận lịch`), { status: 400 });
    }
  }

  // 3. Check Staff Time Conflict on Target Date
  const now = Date.now();
  if (targetStaffId) {
    const conflictingAppt = appointments.find(a =>
      a.id !== id &&
      a.staff_id === targetStaffId &&
      a.appointment_date === targetDate &&
      a.status !== 'cancelled' &&
      isSlotOccupiedByAppt(a, now) &&
      appointmentOverlapsWindow(
        a,
        startMinutes,
        endMinutes,
        closeMinutes
      )
    );

    if (conflictingAppt) {
      const conflictStart = conflictingAppt.appointment_time;
      const [ch, cm] = conflictStart.split(':').map(Number);
      const cEndMinutes = Math.min(
        closeMinutes,
        ch * 60 + cm + (getAppointmentDurationMinutes(conflictingAppt) || closeMinutes)
      );
      const cEndH = Math.floor(cEndMinutes / 60).toString().padStart(2, '0');
      const cEndM = (cEndMinutes % 60).toString().padStart(2, '0');
      const conflictEnd = `${cEndH}:${cEndM}`;

      throw Object.assign(
        new Error(`Nhân viên ${targetStaff.name} đã có lịch hẹn phục vụ khách (${conflictingAppt.customer_name || 'Khách hàng'}) từ ${conflictStart} đến ${conflictEnd}.`),
        { status: 409, code: 'STAFF_TIME_CONFLICT' }
      );
    }
  }

  // 4. Check Slot Capacity Across All Affected 1-Hour Intervals
  // In salon booking spec, 1-hour slots are 08:00-09:00, 09:00-10:00, ...
  const slotCapacitySetting = businessSettings.find(s => s.key === 'slot_capacity');
  const activeStaffList = users.filter(u => u.is_active && ['staff', 'admin', 'receptionist'].includes(u.role) && u.is_available !== false);
  const maxSlotCapacity = slotCapacitySetting ? Number(slotCapacitySetting.value) : Math.max(1, activeStaffList.length);

  const startHourFloor = Math.floor(startMinutes / 60);
  const endHourCeil = Math.ceil(endMinutes / 60);

  for (let H = startHourFloor; H < endHourCeil; H++) {
    const slotStartMin = H * 60;
    const slotEndMin = (H + 1) * 60;

    // Check if appointment actually spans into this 1-hour slot
    if (startMinutes < slotEndMin && endMinutes > slotStartMin) {
      const slotHourStr = `${String(H).padStart(2, '0')}:00`;

      // Count concurrent active appointments occupying this slot on targetDate (excluding this appt)
      const slotConcurrentAppts = appointments.filter(a =>
        a.id !== id &&
        a.appointment_date === targetDate &&
        a.status !== 'cancelled' &&
        isSlotOccupiedByAppt(a, now) &&
        appointmentOverlapsWindow(
          a,
          slotStartMin,
          slotEndMin,
          closeMinutes
        )
      );

      if (slotConcurrentAppts.length + 1 > maxSlotCapacity) {
        const slotLabel = `${slotHourStr} - ${String(H + 1).padStart(2, '0')}:00`;
        throw Object.assign(
          new Error(`Khung giờ ${slotLabel} ngày ${targetDate} đã đạt sức chứa tối đa (${maxSlotCapacity}/${maxSlotCapacity} lượt). Không thể xếp thêm lịch.`),
          { status: 409, code: 'SLOT_CAPACITY_EXCEEDED' }
        );
      }
    }
  }

  // 5. Build Audit History & Update Appointment Record
  const oldTime = appt.appointment_time;
  const oldDate = appt.appointment_date;
  const oldStaffId = appt.staff_id || null;
  const oldStaffName = appt.staff_name || (oldStaffId ? (users.find(u => u.id === oldStaffId)?.name || null) : 'Chưa phân công');
  const newStaffName = targetStaff ? targetStaff.name : null;

  const isTimeChanged = oldTime !== targetTime || oldDate !== targetDate;
  const isStaffChanged = oldStaffId !== (targetStaff ? targetStaff.id : null);

  let action = 'reassign_staff';
  if (isTimeChanged && isStaffChanged) {
    action = 'reschedule_and_reassign';
  } else if (isTimeChanged) {
    action = 'reschedule_time';
  }

  if (!Array.isArray(appt.history)) {
    appt.history = [];
  }
  appt.history.push({
    action,
    old_time: oldTime,
    new_time: targetTime,
    old_date: oldDate,
    new_date: targetDate,
    old_staff_id: oldStaffId,
    old_staff_name: oldStaffName,
    new_staff_id: targetStaff ? targetStaff.id : null,
    new_staff_name: newStaffName,
    changed_by: changedBy || 'Hệ thống',
    changed_by_id: changedById || null,
    changed_at: new Date().toISOString(),
  });

  appt.appointment_time = targetTime;
  appt.appointment_date = targetDate;
  if (targetStaff) {
    appt.staff_id = targetStaff.id;
    appt.staff_name = targetStaff.name;
  }
  appt.updated_at = new Date().toISOString();

  jsonStore.saveCollection('appointments', appointments);
  return enrichAppointment(appt);
}

async function findActiveStaff() {
  const users = jsonStore.getCollection('users');
  return users
    .filter(u => u.is_active && ['staff', 'admin', 'receptionist'].includes(u.role))
    .map(({ id, name, role, email, phone, is_active, is_available }) => ({
      id, name, role, email, phone, is_active, is_available
    }));
}

module.exports = {
  findAvailableSlots,
  getServiceRequirements,
  hold,
  createHoldingSlot: hold,
  releaseHold,
  confirmHold,
  create,
  findByToken,
  findByHoldingToken,
  findById,
  findByBookingCodeAndPhone,
  findBySession,
  findByUserId,
  findAll,
  updateStatus,
  reschedule,
  reassignStaff,
  findActiveStaff,
  getCounts,
  getUpcoming,
  cleanupExpiredHolds,
  findActiveHoldByConversation,
  findConfirmedByConversation,
};
