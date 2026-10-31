'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOLD_DURATION_MS = 5 * 60 * 1000;
const SLOT_INTERVAL_MINUTES = 30;

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getSelectedProducts(productIds, productId = null) {
  const products = jsonStore.getCollection('products');

  const ids = Array.isArray(productIds) && productIds.length > 0
    ? [...new Set(productIds.filter(Boolean))]
    : productId
      ? [productId]
      : [];

  return products.filter(p => ids.includes(p.id));
}

function calculateServiceDetails(selectedProducts) {
  return {
    duration: selectedProducts.reduce(
      (sum, p) => sum + (Number(p.duration) || 45),
      0
    ),
    price: selectedProducts.reduce(
      (sum, p) => sum + (Number(p.price) || 0),
      0
    ),
    productName: selectedProducts.map(p => p.name).join(' + '),
    productIds: selectedProducts.map(p => p.id),
    productId: selectedProducts.length > 0
      ? selectedProducts[0].id
      : null,
  };
}

function enrichAppointment(appt) {
  if (!appt) return null;

  const products = jsonStore.getCollection('products');

  const selectedProducts = Array.isArray(appt.product_ids) && appt.product_ids.length > 0
    ? products.filter(p => appt.product_ids.includes(p.id))
    : appt.product_id
      ? products.filter(p => p.id === appt.product_id)
      : [];

  const product = appt.product_id
    ? products.find(p => p.id === appt.product_id)
    : null;

  const users = jsonStore.getCollection('users');
  const staff = appt.staff_id
    ? users.find(u => u.id === appt.staff_id)
    : null;

  const calculatedName = selectedProducts.map(p => p.name).join(' + ');
  const calculatedPrice = selectedProducts.reduce(
    (sum, p) => sum + (Number(p.price) || 0),
    0
  );

  return {
    ...appt,
    product_name: appt.product_name || calculatedName || (product ? product.name : null),
    price: (appt.price !== undefined && appt.price !== null)
      ? appt.price
      : selectedProducts.length > 0
        ? calculatedPrice
        : product
          ? product.price
          : null,
    staff_name: appt.staff_name || (staff ? staff.name : null),
  };
}

function hasTimeOverlap(timeA, durationA, timeB, durationB) {
  const startA = timeToMinutes(timeA);
  const endA = startA + durationA;
  const startB = timeToMinutes(timeB);
  const endB = startB + durationB;

  return startA < endB && endA > startB;
}

function isSlotOccupiedByAppt(appt, now = Date.now()) {
  if (appt.status === 'cancelled') return false;

  if (appt.status === 'holding') {
    if (
      appt.hold_expires_at &&
      new Date(appt.hold_expires_at).getTime() <= now
    ) {
      return false;
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
    if (
      appt.status === 'holding' &&
      appt.hold_expires_at &&
      new Date(appt.hold_expires_at).getTime() <= now
    ) {
      appt.status = 'cancelled';
      appt.notes = (appt.notes ? appt.notes + ' | ' : '') +
        'Holding slot expired (TTL 5m)';
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
  const cleanDate = (date || new Date().toISOString().slice(0, 10))
    .replace(/-/g, '');

  const rand = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();

  return `BK-${cleanDate}-${rand}`;
}

async function findAvailableSlots(date, durationMinutes = 30) {
  cleanupExpiredHolds();

  const duration = Number(durationMinutes) || 30;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(
      new Error('Thời lượng dịch vụ không hợp lệ'),
      { status: 400 }
    );
  }

  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];

  const dayName = dayNames[new Date(date).getDay()];

  const businessSettings = jsonStore.getCollection('business_settings');
  const whSetting = businessSettings.find(s => s.key === 'working_hours');

  if (!whSetting || !whSetting.value) return [];

  const wh = typeof whSetting.value === 'string'
    ? JSON.parse(whSetting.value)
    : whSetting.value;

  const dayConfig = wh[dayName];

  if (!dayConfig || !dayConfig.enabled) return [];

  const appointments = jsonStore.getCollection('appointments');
  const now = Date.now();

  const dayAppointments = appointments.filter(
    a => a.appointment_date === date && isSlotOccupiedByAppt(a, now)
  );

  const [openH, openM] = dayConfig.open.split(':').map(Number);
  const [closeH, closeM] = dayConfig.close.split(':').map(Number);

  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const occupied = dayAppointments.map(a => {
    const start = timeToMinutes(a.appointment_time);

    return {
      start,
      end: start + (Number(a.duration_minutes) || 30),
    };
  });

  const nowVN = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh'
    })
  );

  const todayVNStr =
    `${nowVN.getFullYear()}-${String(nowVN.getMonth() + 1).padStart(2, '0')}-${String(nowVN.getDate()).padStart(2, '0')}`;

  const currentMinutesVN =
    nowVN.getHours() * 60 + nowVN.getMinutes();

  const slots = [];

  // Khung giờ bắt đầu cách nhau 30 phút.
  // Thời lượng dịch vụ vẫn được dùng để kiểm tra trùng lịch.
  for (
    let t = openMinutes;
    t + duration <= closeMinutes;
    t += SLOT_INTERVAL_MINUTES
  ) {
    if (date === todayVNStr && t <= currentMinutesVN) {
      continue;
    }

    const end = t + duration;

    const isOccupied = occupied.some(
      o => t < o.end && end > o.start
    );

    if (!isOccupied) {
      const hours = Math.floor(t / 60)
        .toString()
        .padStart(2, '0');

      const mins = (t % 60)
        .toString()
        .padStart(2, '0');

      slots.push(`${hours}:${mins}`);
    }
  }

  return slots;
}

async function hold({
  conversationId,
  guestSessionId,
  appointmentDate,
  appointmentTime,
  durationMinutes = 30,
  productId = null,
  productIds = [],
  userId = null,
  notes = null,
}) {
  cleanupExpiredHolds();

  const appointments = jsonStore.getCollection('appointments');
  const now = Date.now();

  // Tìm các dịch vụ khách đã chọn.
  const selectedProducts = getSelectedProducts(
    productIds,
    productId
  );

  // Tính tổng thời lượng và giá tiền.
  const serviceDetails = calculateServiceDetails(selectedProducts);

  const finalDuration = selectedProducts.length > 0
    ? serviceDetails.duration
    : Number(durationMinutes) || 30;

  if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
    throw Object.assign(
      new Error('Thời lượng dịch vụ không hợp lệ'),
      { status: 400 }
    );
  }

  // Kiểm tra xung đột lịch theo toàn bộ thời lượng.
  const conflict = appointments.some(a =>
    a.appointment_date === appointmentDate &&
    isSlotOccupiedByAppt(a, now) &&
    hasTimeOverlap(
      a.appointment_time,
      Number(a.duration_minutes) || 30,
      appointmentTime,
      finalDuration
    )
  );

  if (conflict) {
    throw Object.assign(
      new Error(
        'Khung giờ này vừa có khách khác đặt. Vui lòng chọn khung giờ khác.'
      ),
      {
        status: 409,
        code: 'SLOT_CONFLICT'
      }
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

    product_id: serviceDetails.productId || productId || null,
    product_ids: serviceDetails.productIds,
    product_name: serviceDetails.productName || null,
    price: selectedProducts.length > 0
      ? serviceDetails.price
      : null,

    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    duration_minutes: finalDuration,

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

  appt.notes = (appt.notes ? appt.notes + ' | ' : '') +
    'Hold released by client';

  appt.updated_at = new Date().toISOString();

  jsonStore.saveCollection('appointments', appointments);

  return enrichAppointment(appt);
}

async function confirmHold({
  holdingToken,
  customerName,
  customerPhone,
  customerEmail,
  notes,
  guestSessionId = null,
  userId = null,
}) {
  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(
    a => a.holding_token === holdingToken
  );

  if (!appt) {
    cleanupExpiredHolds();

    throw Object.assign(
      new Error('Holding appointment not found'),
      { status: 404 }
    );
  }

  if (
    guestSessionId &&
    appt.guest_session_id &&
    appt.guest_session_id !== guestSessionId
  ) {
    throw Object.assign(
      new Error('Access denied to this holding session'),
      { status: 403 }
    );
  }

  if (appt.status === 'confirmed') {
    return enrichAppointment(appt);
  }

  const now = Date.now();

  const isHoldExpired =
    (
      appt.hold_expires_at &&
      new Date(appt.hold_expires_at).getTime() <= now
    ) ||
    (
      appt.status === 'cancelled' &&
      (
        appt.notes &&
        (
          appt.notes.includes('Hold expired') ||
          appt.notes.includes('Holding slot expired')
        )
      )
    );

  if (isHoldExpired) {
    if (appt.status !== 'cancelled') {
      appt.status = 'cancelled';

      appt.notes = (appt.notes ? appt.notes + ' | ' : '') +
        'Hold expired';

      appt.updated_at = new Date().toISOString();

      jsonStore.saveCollection('appointments', appointments);
    }

    cleanupExpiredHolds();

    throw Object.assign(
      new Error(
        'Holding period of 5 minutes has expired. Please select a time slot again.'
      ),
      {
        status: 410,
        code: 'HOLD_EXPIRED',
        preservedData: {
          customerName,
          customerPhone,
          productId: appt.product_id,
          productIds: appt.product_ids || [],
        },
      }
    );
  }

  if (appt.status !== 'holding') {
    throw Object.assign(
      new Error('Appointment is not in holding state'),
      { status: 400 }
    );
  }

  cleanupExpiredHolds();

  // Kiểm tra lại xung đột trước khi xác nhận.
  const conflict = appointments.some(a =>
    a.id !== appt.id &&
    a.appointment_date === appt.appointment_date &&
    isSlotOccupiedByAppt(a, now) &&
    hasTimeOverlap(
      a.appointment_time,
      Number(a.duration_minutes) || 30,
      appt.appointment_time,
      Number(appt.duration_minutes) || 30
    )
  );

  if (conflict) {
    throw Object.assign(
      new Error(
        'This time slot was just booked by another customer. Please choose an alternative slot.'
      ),
      {
        status: 409,
        code: 'SLOT_CONFLICT',
        preservedData: {
          customerName,
          customerPhone,
          productId: appt.product_id,
          productIds: appt.product_ids || [],
        },
      }
    );
  }

  // Xác nhận lịch.
  const nowIso = new Date().toISOString();

  appt.customer_name = customerName;
  appt.customer_phone = customerPhone;
  appt.notes = notes || appt.notes || null;

  if (userId) {
    appt.user_id = userId;
  }

  appt.status = 'confirmed';
  appt.booking_code = generateBookingCode(appt.appointment_date);
  appt.confirmed_at = nowIso;
  appt.updated_at = nowIso;

  jsonStore.saveCollection('appointments', appointments);

  return enrichAppointment(appt);
}

async function create({
  conversationId,
  guestSessionId,
  customerName,
  customerPhone,
  customerEmail,
  productId,
  productIds,
  appointmentDate,
  appointmentTime,
  durationMinutes = 30,
  notes,
  userId = null,
  staffId = null,
  status = 'pending',
  createdBy = null,
  price = null
}) {
  cleanupExpiredHolds();

  const appointments = jsonStore.getCollection('appointments');
  const businessSettings = jsonStore.getCollection('business_settings');
  const users = jsonStore.getCollection('users');
  const products = jsonStore.getCollection('products');

  const now = Date.now();

  // Tìm danh sách dịch vụ khách đã chọn.
  let selectedProducts = [];

  if (Array.isArray(productIds) && productIds.length > 0) {
    selectedProducts = products.filter(
      p => productIds.includes(p.id)
    );
  } else if (productId) {
    const p = products.find(prod => prod.id === productId);

    if (p) {
      selectedProducts = [p];
    }
  }

  let finalDuration = Number(durationMinutes) || 30;
  let finalPrice = price;
  let finalProductName = null;
  let finalProductId = productId || null;

  if (selectedProducts.length > 0) {
    const serviceDetails = calculateServiceDetails(selectedProducts);

    // Lấy đúng trường duration từ productRepository.
    finalDuration = serviceDetails.duration;
    finalPrice = serviceDetails.price;
    finalProductName = serviceDetails.productName;
    finalProductId = serviceDetails.productId;
  } else if (productId) {
    const p = products.find(prod => prod.id === productId);

    if (p) {
      finalDuration = Number(p.duration) || finalDuration;
      finalPrice = p.price;
      finalProductName = p.name;
    }
  }

  // 1. Kiểm tra giờ hoạt động.
  const whSetting = businessSettings.find(
    s => s.key === 'working_hours'
  );

  let workingHours = {};

  if (whSetting) {
    try {
      workingHours = typeof whSetting.value === 'string'
        ? JSON.parse(whSetting.value)
        : whSetting.value;
    } catch (e) {}
  }

  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];

  const dayOfWeek = dayNames[new Date(appointmentDate).getDay()];
  const dayConfig = workingHours[dayOfWeek];

  if (dayConfig && dayConfig.enabled === false) {
    throw Object.assign(
      new Error(
        `Salon không hoạt động vào ${dayOfWeek} (${appointmentDate}). Vui lòng chọn ngày làm việc khác.`
      ),
      { status: 400 }
    );
  }

  const openTime = dayConfig && dayConfig.open
    ? dayConfig.open
    : '08:30';

  const closeTime = dayConfig && dayConfig.close
    ? dayConfig.close
    : '20:30';

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const startMinutes = timeToMinutes(appointmentTime);
  const endMinutes = startMinutes + finalDuration;

  if (startMinutes < openMinutes) {
    throw Object.assign(
      new Error(
        `Thời gian hẹn (${appointmentTime}) nằm ngoài giờ mở cửa của salon (mở cửa lúc ${openTime}).`
      ),
      { status: 400 }
    );
  }

  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endTimeStr = `${endH}:${endM}`;

  if (endMinutes > closeMinutes) {
    throw Object.assign(
      new Error(
        `Lịch hẹn kéo dài ${finalDuration} phút sẽ kết thúc lúc ${endTimeStr}, vượt quá giờ đóng cửa của salon (${closeTime}).`
      ),
      { status: 400 }
    );
  }

  // 2. Kiểm tra nhân viên nếu được phân công.
  let targetStaff = null;

  if (staffId) {
    targetStaff = users.find(u => u.id === staffId);

    if (!targetStaff) {
      throw Object.assign(
        new Error('Nhân viên không tồn tại trong hệ thống'),
        { status: 404 }
      );
    }

    if (targetStaff.is_active === false) {
      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} đang bị khóa hoặc ngừng hoạt động`
        ),
        { status: 400 }
      );
    }

    if (targetStaff.is_available === false) {
      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} hiện đang tạm ngưng tiếp nhận lịch`
        ),
        { status: 400 }
      );
    }

    const conflictingAppt = appointments.find(a =>
      a.staff_id === staffId &&
      a.appointment_date === appointmentDate &&
      a.status !== 'cancelled' &&
      isSlotOccupiedByAppt(a, now) &&
      hasTimeOverlap(
        a.appointment_time,
        a.duration_minutes || 30,
        appointmentTime,
        finalDuration
      )
    );

    if (conflictingAppt) {
      const conflictStart = conflictingAppt.appointment_time;
      const [ch, cm] = conflictStart.split(':').map(Number);

      const cEndMinutes =
        ch * 60 + cm + (conflictingAppt.duration_minutes || 30);

      const cEndH = Math.floor(cEndMinutes / 60)
        .toString()
        .padStart(2, '0');

      const cEndM = Math.floor(cEndMinutes % 60)
        .toString()
        .padStart(2, '0');

      const conflictEnd = `${cEndH}:${cEndM}`;

      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} đã có lịch hẹn phục vụ khách (${conflictingAppt.customer_name || 'Khách hàng'}) từ ${conflictStart} đến ${conflictEnd}.`
        ),
        { status: 409, code: 'STAFF_TIME_CONFLICT' }
      );
    }
  }

  // 3. Kiểm tra sức chứa các khung giờ.
  const slotCapacitySetting = businessSettings.find(
    s => s.key === 'slot_capacity'
  );

  const activeStaffList = users.filter(
    u =>
      u.is_active &&
      ['staff', 'admin', 'receptionist'].includes(u.role) &&
      u.is_available !== false
  );

  const maxSlotCapacity = slotCapacitySetting
    ? Number(slotCapacitySetting.value)
    : Math.max(1, activeStaffList.length);

  const startHourFloor = Math.floor(startMinutes / 60);
  const endHourCeil = Math.ceil(endMinutes / 60);

  for (let H = startHourFloor; H < endHourCeil; H++) {
    const slotStartMin = H * 60;
    const slotEndMin = (H + 1) * 60;

    if (startMinutes < slotEndMin && endMinutes > slotStartMin) {
      const slotHourStr =
        `${String(H).padStart(2, '0')}:00`;

      const slotConcurrentAppts = appointments.filter(a =>
        a.appointment_date === appointmentDate &&
        a.status !== 'cancelled' &&
        isSlotOccupiedByAppt(a, now) &&
        hasTimeOverlap(
          a.appointment_time,
          a.duration_minutes || 30,
          slotHourStr,
          60
        )
      );

      if (slotConcurrentAppts.length + 1 > maxSlotCapacity) {
        throw Object.assign(
          new Error(
            `Khung giờ ${slotHourStr} ngày ${appointmentDate} đã kín chỗ (tối đa ${maxSlotCapacity} khách phục vụ cùng lúc).`
          ),
          { status: 409, code: 'SLOT_CAPACITY_EXCEEDED' }
        );
      }
    }
  }

  // 4. Kiểm tra trùng lịch chung khi chưa phân công nhân viên.
  if (!staffId) {
    const conflict = appointments.some(a =>
      a.appointment_date === appointmentDate &&
      isSlotOccupiedByAppt(a, now) &&
      hasTimeOverlap(
        a.appointment_time,
        a.duration_minutes || 30,
        appointmentTime,
        finalDuration
      )
    );

    if (conflict) {
      throw Object.assign(
        new Error(
          'This time slot has just been booked. Please choose another.'
        ),
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

    product_id: finalProductId,
    product_ids: selectedProducts.map(p => p.id),
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

  return matched
    .slice(offset, offset + limit)
    .map(enrichAppointment);
}

async function findByToken(confirmationToken) {
  if (!confirmationToken || !UUID_REGEX.test(confirmationToken)) {
    return null;
  }

  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(
    a => a.confirmation_token === confirmationToken
  );

  return enrichAppointment(appt);
}

async function findByHoldingToken(holdingToken) {
  if (!holdingToken || !UUID_REGEX.test(holdingToken)) {
    return null;
  }

  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(
    a => a.holding_token === holdingToken
  );

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

async function findBySession(
  guestSessionId,
  { page = 1, limit = 10 } = {}
) {
  const appointments = jsonStore.getCollection('appointments');

  const matched = appointments.filter(
    a => a.guest_session_id === guestSessionId
  );

  matched.sort((a, b) => {
    const dComp = b.appointment_date.localeCompare(a.appointment_date);

    if (dComp !== 0) return dComp;

    return b.appointment_time.localeCompare(a.appointment_time);
  });

  const offset = (page - 1) * limit;

  return matched
    .slice(offset, offset + limit)
    .map(enrichAppointment);
}

async function findAll({
  status,
  date,
  page = 1,
  limit = 20
} = {}) {
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

  const rows = matched
    .slice(offset, offset + limit)
    .map(enrichAppointment);

  return { rows, total };
}

async function updateStatus(id, status, guestSessionId = null) {
  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(
    a =>
      a.id === id &&
      (!guestSessionId || a.guest_session_id === guestSessionId)
  );

  if (!appt) return null;

  appt.status = status;
  appt.updated_at = new Date().toISOString();

  jsonStore.saveCollection('appointments', appointments);

  return enrichAppointment(appt);
}

async function reschedule(
  id,
  {
    appointmentDate,
    appointmentTime,
    durationMinutes = 30
  },
  guestSessionId = null
) {
  cleanupExpiredHolds();

  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(
    a =>
      a.id === id &&
      (!guestSessionId || a.guest_session_id === guestSessionId)
  );

  if (!appt) return null;

  const now = Date.now();

  const conflict = appointments.some(a =>
    a.id !== id &&
    a.appointment_date === appointmentDate &&
    isSlotOccupiedByAppt(a, now) &&
    hasTimeOverlap(
      a.appointment_time,
      a.duration_minutes || 30,
      appointmentTime,
      durationMinutes || 30
    )
  );

  if (conflict) {
    throw Object.assign(
      new Error('Time slot is already taken'),
      { status: 409, code: 'SLOT_CONFLICT' }
    );
  }

  appt.appointment_date = appointmentDate;
  appt.appointment_time = appointmentTime;
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
    if (a.status !== 'pending' && a.status !== 'confirmed') {
      return false;
    }

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
    (
      !a.hold_expires_at ||
      new Date(a.hold_expires_at).getTime() > now
    )
  );

  return found ? enrichAppointment(found) : null;
}

async function reassignStaff(
  id,
  {
    newStaffId,
    appointmentTime,
    appointmentDate,
    changedBy,
    changedById
  }
) {
  cleanupExpiredHolds();

  const appointments = jsonStore.getCollection('appointments');

  const appt = appointments.find(a => a.id === id);

  if (!appt) {
    throw Object.assign(
      new Error('Lịch hẹn không tồn tại'),
      { status: 404 }
    );
  }

  if (appt.status === 'cancelled') {
    throw Object.assign(
      new Error('Không thể điều chỉnh lịch hẹn đã bị hủy'),
      { status: 400 }
    );
  }

  if (appt.status === 'completed') {
    throw Object.assign(
      new Error('Không thể điều chỉnh lịch hẹn đã hoàn thành'),
      { status: 400 }
    );
  }

  const users = jsonStore.getCollection('users');

  const targetDate = appointmentDate || appt.appointment_date;
  const targetTime = appointmentTime || appt.appointment_time;

  const targetStaffId = newStaffId !== undefined
    ? newStaffId
    : appt.staff_id;

  const duration = Number(appt.duration_minutes) || 30;

  if (!targetTime || !/^\d{2}:\d{2}$/.test(targetTime)) {
    throw Object.assign(
      new Error('Giờ hẹn không hợp lệ (định dạng HH:mm)'),
      { status: 400 }
    );
  }

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw Object.assign(
      new Error('Ngày hẹn không hợp lệ (định dạng YYYY-MM-DD)'),
      { status: 400 }
    );
  }

  // 1. Kiểm tra giờ hoạt động.
  const businessSettings = jsonStore.getCollection('business_settings');

  const whSetting = businessSettings.find(
    s => s.key === 'working_hours'
  );

  const workingHours = whSetting
    ? (
      typeof whSetting.value === 'string'
        ? JSON.parse(whSetting.value)
        : whSetting.value
    )
    : null;

  const dayNames = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday'
  ];

  const dayOfWeek = dayNames[
    new Date(targetDate + 'T00:00:00').getDay()
  ];

  const dayConfig = workingHours
    ? workingHours[dayOfWeek]
    : null;

  if (dayConfig && dayConfig.enabled === false) {
    throw Object.assign(
      new Error(
        `Salon không hoạt động vào ${dayOfWeek} (${targetDate}). Vui lòng chọn ngày làm việc khác.`
      ),
      { status: 400 }
    );
  }

  const openTime = dayConfig && dayConfig.open
    ? dayConfig.open
    : '08:30';

  const closeTime = dayConfig && dayConfig.close
    ? dayConfig.close
    : '20:30';

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);
  const startMinutes = timeToMinutes(targetTime);
  const endMinutes = startMinutes + duration;

  if (startMinutes < openMinutes) {
    throw Object.assign(
      new Error(
        `Thời gian hẹn (${targetTime}) nằm ngoài giờ mở cửa của salon (mở cửa lúc ${openTime}).`
      ),
      { status: 400 }
    );
  }

  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endTimeStr = `${endH}:${endM}`;

  if (endMinutes > closeMinutes) {
    throw Object.assign(
      new Error(
        `Lịch hẹn kéo dài ${duration} phút sẽ kết thúc lúc ${endTimeStr}, vượt quá giờ đóng cửa của salon (${closeTime}).`
      ),
      { status: 400 }
    );
  }

  // 2. Kiểm tra nhân viên.
  let targetStaff = null;

  if (targetStaffId) {
    targetStaff = users.find(u => u.id === targetStaffId);

    if (!targetStaff) {
      throw Object.assign(
        new Error('Nhân viên không tồn tại trong hệ thống'),
        { status: 404 }
      );
    }

    if (targetStaff.is_active === false) {
      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} đang bị khóa hoặc ngừng hoạt động`
        ),
        { status: 400 }
      );
    }

    if (targetStaff.is_available === false) {
      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} hiện đang tạm ngưng tiếp nhận lịch`
        ),
        { status: 400 }
      );
    }
  }

  // 3. Kiểm tra trùng lịch nhân viên.
  const now = Date.now();

  if (targetStaffId) {
    const conflictingAppt = appointments.find(a =>
      a.id !== id &&
      a.staff_id === targetStaffId &&
      a.appointment_date === targetDate &&
      a.status !== 'cancelled' &&
      isSlotOccupiedByAppt(a, now) &&
      hasTimeOverlap(
        a.appointment_time,
        a.duration_minutes || 30,
        targetTime,
        duration
      )
    );

    if (conflictingAppt) {
      const conflictStart = conflictingAppt.appointment_time;
      const [ch, cm] = conflictStart.split(':').map(Number);

      const cEndMinutes =
        ch * 60 + cm + (conflictingAppt.duration_minutes || 30);

      const cEndH = Math.floor(cEndMinutes / 60)
        .toString()
        .padStart(2, '0');

      const cEndM = Math.floor(cEndMinutes % 60)
        .toString()
        .padStart(2, '0');

      const conflictEnd = `${cEndH}:${cEndM}`;

      throw Object.assign(
        new Error(
          `Nhân viên ${targetStaff.name} đã có lịch hẹn phục vụ khách (${conflictingAppt.customer_name || 'Khách hàng'}) từ ${conflictStart} đến ${conflictEnd}.`
        ),
        { status: 409, code: 'STAFF_TIME_CONFLICT' }
      );
    }
  }

  // 4. Kiểm tra sức chứa các khung giờ.
  const slotCapacitySetting = businessSettings.find(
    s => s.key === 'slot_capacity'
  );

  const activeStaffList = users.filter(
    u =>
      u.is_active &&
      ['staff', 'admin', 'receptionist'].includes(u.role) &&
      u.is_available !== false
  );

  const maxSlotCapacity = slotCapacitySetting
    ? Number(slotCapacitySetting.value)
    : Math.max(1, activeStaffList.length);

  const startHourFloor = Math.floor(startMinutes / 60);
  const endHourCeil = Math.ceil(endMinutes / 60);

  for (let H = startHourFloor; H < endHourCeil; H++) {
    const slotStartMin = H * 60;
    const slotEndMin = (H + 1) * 60;

    if (startMinutes < slotEndMin && endMinutes > slotStartMin) {
      const slotHourStr =
        `${String(H).padStart(2, '0')}:00`;

      const slotConcurrentAppts = appointments.filter(a =>
        a.id !== id &&
        a.appointment_date === targetDate &&
        a.status !== 'cancelled' &&
        isSlotOccupiedByAppt(a, now) &&
        hasTimeOverlap(
          a.appointment_time,
          a.duration_minutes || 30,
          slotHourStr,
          60
        )
      );

      if (slotConcurrentAppts.length + 1 > maxSlotCapacity) {
        const slotLabel =
          `${slotHourStr} - ${String(H + 1).padStart(2, '0')}:00`;

        throw Object.assign(
          new Error(
            `Khung giờ ${slotLabel} ngày ${targetDate} đã đạt sức chứa tối đa (${maxSlotCapacity}/${maxSlotCapacity} lượt). Không thể xếp thêm lịch.`
          ),
          { status: 409, code: 'SLOT_CAPACITY_EXCEEDED' }
        );
      }
    }
  }

  // 5. Ghi lịch sử thay đổi.
  const oldTime = appt.appointment_time;
  const oldDate = appt.appointment_date;
  const oldStaffId = appt.staff_id || null;

  const oldStaffName =
    appt.staff_name ||
    (
      oldStaffId
        ? (users.find(u => u.id === oldStaffId)?.name || null)
        : 'Chưa phân công'
    );

  const newStaffName = targetStaff ? targetStaff.name : null;

  const isTimeChanged =
    oldTime !== targetTime || oldDate !== targetDate;

  const isStaffChanged =
    oldStaffId !== (targetStaff ? targetStaff.id : null);

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
    .filter(
      u =>
        u.is_active &&
        ['staff', 'admin', 'receptionist'].includes(u.role)
    )
    .map(({ id, name, role, email, phone, is_active, is_available }) => ({
      id,
      name,
      role,
      email,
      phone,
      is_active,
      is_available
    }));
}

module.exports = {
  findAvailableSlots,
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
};