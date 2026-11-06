'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const sourceDataDir = path.resolve(__dirname, '../database/data');
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'may-hair-booking-'));
process.env.JSON_STORE_DATA_DIR = testDataDir;

for (const filename of [
  'categories.json',
  'products.json',
  'business_settings.json',
  'system_settings.json',
]) {
  fs.copyFileSync(path.join(sourceDataDir, filename), path.join(testDataDir, filename));
}
fs.writeFileSync(path.join(testDataDir, 'users.json'), JSON.stringify(
  Array.from({ length: 10 }, (_, index) => ({
    id: `test-staff-${index + 1}`,
    name: `Test staff ${index + 1}`,
    role: 'staff',
    is_active: true,
    is_available: true,
  })),
));

const jsonStore = require('../src/config/jsonStore');
const appointmentRepository = require('../src/repositories/appointmentRepository');
const appointmentService = require('../src/services/appointmentService');
const conversationRepository = require('../src/repositories/conversationRepository');
const conversationService = require('../src/services/conversationService');
const productRepository = require('../src/repositories/productRepository');
const provider = require('../src/ai/provider');
const orchestrator = require('../src/ai/orchestrator');
const { getVietnamDate, extractTimeFromText } = require('../src/ai/tools');

provider.isConfigured = () => true;
provider.chat = async () => ({
  choices: [{
    message: {
      role: 'assistant',
      content: 'Dạ, mình cho em xin thông tin cần thiết tiếp theo nhé ạ.',
    },
  }],
});

after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

async function createConversation(label) {
  return conversationService.getOrCreate({
    guestSessionId: `isolated-booking-${label}-${Date.now()}-${Math.random()}`,
  });
}

async function sendTurn(conversation, userMessage) {
  return orchestrator.chat({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    userMessage,
  });
}

async function findProduct(name) {
  const { rows } = await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  });
  return rows.find(product => product.name === name);
}

test('multi-turn booking keeps state, corrects invalid time, and uses the selected size tier', async () => {
  const product = await findProduct('Cắt tạo kiểu');
  assert.ok(product);
  const conversation = await createConversation('multi-turn');

  await sendTurn(conversation, 'Tôi muốn đặt lịch');
  await sendTurn(conversation, 'Cắt tạo kiểu');
  await sendTurn(conversation, 'Ngày mai');
  await sendTurn(conversation, 'Tóc ngang vai');
  const invalidTimeReply = await sendTurn(conversation, '25 giờ');
  assert.match(invalidTimeReply.content, /giờ|hợp lệ|chọn lại/iu);

  assert.equal(extractTimeFromText('3 giờ chiều'), '15:00');
  await sendTurn(conversation, '3 giờ chiều');

  const savedConversation = await conversationRepository.findById(conversation.id);
  const hold = await appointmentRepository.findActiveHoldByConversation(conversation.id);
  assert.equal(savedConversation.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(savedConversation.chat_context.appointment_time, '15:00');
  assert.equal(savedConversation.chat_context.hair_size, 'M');
  assert.ok(hold);
  assert.equal(hold.product_id, product.id);
  assert.equal(hold.hair_size, 'M');
  assert.equal(hold.duration_minutes, product.prices_by_size.M.duration);
  assert.equal(hold.price, product.prices_by_size.M.price);
  assert.equal(hold.status, 'holding');

  await sendTurn(conversation, 'Tôi tên Nguyễn Văn An');
  await sendTurn(conversation, '0912345678');
  assert.equal((await appointmentRepository.findById(hold.id)).status, 'holding');
  const confirmationReply = await sendTurn(conversation, 'Xác nhận đặt lịch');
  const confirmedAppointment = await appointmentRepository.findById(hold.id);
  assert.match(confirmationReply.content, /xác nhận lịch hẹn thành công/iu);
  assert.equal(confirmedAppointment.status, 'confirmed');
  assert.equal(confirmedAppointment.customer_name, 'Nguyễn Văn An');
  assert.equal(confirmedAppointment.customer_phone, '0912345678');
  assert.equal(confirmedAppointment.hair_size, 'M');
});

test('service changes clear dependent size and availability state but preserve date and time', async () => {
  const haircut = await findProduct('Cắt tạo kiểu');
  const curling = await findProduct('Uốn mái / phồng mái');
  assert.ok(haircut);
  assert.ok(curling);
  const conversation = await createConversation('service-change');
  await conversationRepository.updateChatContext(conversation.id, {
    selected_service_ids: [haircut.id],
    selected_service_source: 'booking_request',
    booking_started: true,
    booking_service_confirmed: true,
    appointment_date: getVietnamDate(1),
    appointment_time: '14:00',
    hair_size: 'M',
    availability_query_pending: true,
    availability_query_date: getVietnamDate(1),
    availability_query_service_ids: [haircut.id],
  });

  await sendTurn(conversation, 'Tôi muốn đổi sang uốn mái');
  const updated = await conversationRepository.findById(conversation.id);
  assert.deepEqual(updated.chat_context.selected_service_ids, [curling.id]);
  assert.equal(updated.chat_context.hair_size, null);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.notDeepEqual(updated.chat_context.availability_query_service_ids, [haircut.id]);
});

test('availability query preserves the selected service category instead of re-asking the same question', async () => {
  const conversation = await createConversation('availability-category');
  await conversationRepository.updateChatContext(conversation.id, {
    availability_query_pending: true,
    availability_query_date: getVietnamDate(1),
    availability_query_service_ids: [],
  });

  const reply = await sendTurn(conversation, 'uốn tóc');
  const updated = await conversationRepository.findById(conversation.id);

  assert.ok(reply.content.includes('Uốn tóc') || reply.content.includes('nhóm Uốn tóc'));
  assert.equal(updated.chat_context.booking_requested_category, 'Uốn tóc');
  assert.equal(updated.chat_context.availability_query_pending, true);
});

test('available-slot query waits for size, then reads real isolated appointments and working hours', async () => {
  const product = await findProduct('Cắt tạo kiểu');
  assert.ok(product);
  const conversation = await createConversation('available-slots');
  const date = getVietnamDate(1);

  const sizeReply = await sendTurn(
    conversation,
    `Ngày mai còn giờ nào trống cho ${product.name}?`,
  );
  assert.match(sizeReply.content, /độ dài tóc|size/iu);
  let updated = await conversationRepository.findById(conversation.id);
  assert.equal(updated.chat_context.availability_query_pending, true);
  assert.deepEqual(updated.chat_context.availability_query_service_ids, [product.id]);

  const slotsReply = await sendTurn(conversation, 'Tóc ngang vai');
  const slots = await appointmentRepository.findAvailableSlots(
    date,
    product.prices_by_size.M.duration,
    { requiredStaff: product.prices_by_size.M.staff_count },
  );
  assert.ok(slots.length > 0);
  assert.ok(slotsReply.content.includes(slots[0]));

  const nextSlot = slots[0];
  jsonStore.saveCollection('appointments', [{
    id: 'isolated-busy-appointment',
    appointment_date: date,
    appointment_time: nextSlot,
    duration_minutes: product.prices_by_size.M.duration,
    staff_count: 1,
    status: 'confirmed',
  }]);
  const conflictReply = await sendTurn(conversation, nextSlot);
  assert.match(conflictReply.content, /chưa còn chỗ|giờ salon còn trống/iu);
  assert.equal(await appointmentRepository.findActiveHoldByConversation(conversation.id), null);

  const refreshedSlots = await appointmentService.checkAvailableSlots(
    date,
    null,
    { productIds: [product.id], hairSize: 'M' },
  );
  assert.ok(!refreshedSlots.slots.includes(nextSlot));
});

test('natural back-length description selects size L and uses that service tier', async () => {
  const product = await findProduct('Uốn mái / phồng mái');
  assert.ok(product);
  const conversation = await createConversation('back-length');
  const date = getVietnamDate(1);

  const question = await sendTurn(
    conversation,
    `Ngày mai còn giờ nào trống cho ${product.name}?`,
  );
  assert.match(question.content, /độ dài tóc|size/iu);

  const slotsReply = await sendTurn(conversation, 'Tóc ngang lưng');
  const updated = await conversationRepository.findById(conversation.id);
  const requirements = appointmentRepository.getServiceRequirements(product, 'L');
  const availability = await appointmentService.checkAvailableSlots(
    date,
    null,
    { productIds: [product.id], hairSize: 'L' },
  );

  assert.equal(updated.chat_context.hair_size, 'L');
  assert.equal(requirements.price, product.prices_by_size.L.price);
  assert.equal(requirements.durationMinutes, product.prices_by_size.L.duration);
  assert.ok(availability.slots.length > 0);
  assert.ok(slotsReply.content.includes(availability.slots[0]));
  assert.doesNotMatch(slotsReply.content, /chọn size\s*[SML]/iu);
});

test('natural afternoon time parsing uses the salon time, not the morning hour', () => {
  assert.equal(extractTimeFromText('3 giờ chiều'), '15:00');
  assert.equal(extractTimeFromText('3 giờ sáng'), '03:00');
  assert.equal(extractTimeFromText('25 giờ'), null);
});

test('service selection, catalog price, booking, and "oke" confirmation persist through one real appointment', async () => {
  const product = await findProduct('Phồng chân');
  assert.ok(product);
  const conversation = await createConversation('service-price-book-confirm');

  const categoryReply = await sendTurn(conversation, 'Tôi muốn uốn tóc');
  assert.match(categoryReply.content, /Phồng chân/u);
  assert.doesNotMatch(categoryReply.content, /hỏi giá dịch vụ nào/u);

  await sendTurn(conversation, 'Phồng chân');
  let saved = await conversationRepository.findById(conversation.id);
  assert.deepEqual(saved.chat_context.selected_service_ids, [product.id]);
  assert.equal(saved.chat_context.service_id, product.id);
  assert.equal(saved.chat_context.service_name, product.name);

  const sizeQuestion = await sendTurn(conversation, 'Giá uốn là bao nhiêu');
  assert.match(sizeQuestion.content, /độ dài tóc|size/iu);
  saved = await conversationRepository.findById(conversation.id);
  assert.deepEqual(saved.chat_context.selected_service_ids, [product.id]);
  assert.equal(saved.chat_context.current_intent, 'ASK_PRICE');

  const quote = await sendTurn(conversation, 'Tóc ngang lưng');
  const tier = product.prices_by_size.L;
  assert.equal(saved.chat_context.hair_size, null);
  assert.match(quote.content, new RegExp(
    `${new Intl.NumberFormat('vi-VN').format(tier.price)} VNĐ`,
  ));
  saved = await conversationRepository.findById(conversation.id);
  assert.equal(saved.chat_context.hair_size, 'L');
  assert.deepEqual(saved.chat_context.selected_service_ids, [product.id]);
  assert.equal(saved.chat_context.service_price, tier.price);
  assert.equal(saved.chat_context.service_duration, tier.duration);
  assert.equal(saved.chat_context.service_staff_count, tier.staff_count);

  const availability = await sendTurn(conversation, 'Tôi muốn đặt lịch 16 giờ ngày mai');
  saved = await conversationRepository.findById(conversation.id);
  const hold = await appointmentRepository.findActiveHoldByConversation(conversation.id);
  assert.ok(hold);
  assert.match(availability.content, /họ tên|số điện thoại/iu);
  assert.equal(saved.chat_context.current_intent, 'BOOK_APPOINTMENT');
  assert.equal(saved.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(saved.chat_context.appointment_time, '16:00');
  assert.deepEqual(saved.chat_context.selected_service_ids, [product.id]);
  assert.equal(saved.chat_context.hair_size, 'L');
  assert.equal(hold.product_id, product.id);
  assert.equal(hold.hair_size, 'L');
  assert.equal(hold.price, tier.price);
  assert.equal(hold.duration_minutes, tier.duration);

  await sendTurn(conversation, 'Trần Quang Hải 0909089972');
  saved = await conversationRepository.findById(conversation.id);
  assert.equal(saved.chat_context.booking_status, 'AWAITING_CONFIRMATION');
  const confirmedReply = await sendTurn(conversation, 'oke');
  assert.match(confirmedReply.content, /đã xác nhận lịch hẹn thành công/u);
  assert.doesNotMatch(confirmedReply.content, /giữ chỗ.{0,50}\b(?:5|10)\s*phút/iu);

  saved = await conversationRepository.findById(conversation.id);
  const appointment = await appointmentRepository.findById(saved.chat_context.appointment_id);
  assert.equal(saved.chat_context.booking_status, 'BOOKED');
  assert.equal(saved.chat_context.booking_completed, true);
  assert.equal(appointment.status, 'confirmed');
  assert.equal(appointment.product_id, product.id);
  assert.deepEqual(appointment.product_ids, [product.id]);
  assert.equal(appointment.hair_size, 'L');
  assert.equal(appointment.appointment_date, getVietnamDate(1));
  assert.equal(appointment.appointment_time, '16:00');
  assert.equal(appointment.price, tier.price);
  assert.equal(appointment.duration_minutes, tier.duration);
  assert.equal(saved.chat_context.service_price, appointment.price);
  assert.equal(saved.chat_context.service_duration, appointment.duration_minutes);
  assert.ok(appointment.booking_code);
  assert.equal(
    jsonStore.getCollection('appointments')
      .filter(item => item.conversation_id === conversation.id && item.status === 'confirmed').length,
    1,
  );

  const duplicateConfirmation = await sendTurn(conversation, 'xác nhận');
  assert.match(duplicateConfirmation.content, new RegExp(appointment.booking_code));
  assert.equal(
    jsonStore.getCollection('appointments')
      .filter(item => item.conversation_id === conversation.id && item.status === 'confirmed').length,
    1,
  );
});

test('confirmation synonyms are accepted only when they are not negated or changed', () => {
  for (const phrase of [
    'xác nhận',
    'đồng ý',
    'ok',
    'okay',
    'oke',
    'oki',
    'okie',
    'có',
    'yes',
    'confirm',
    'đúng',
    'đúng rồi',
    'đúng vậy',
    'vâng',
    'dạ vâng',
    'ừ',
    'được',
    'chốt nhé',
    'đặt giúp tôi',
  ]) {
    assert.equal(orchestrator.detectConfirmation(phrase), true, phrase);
  }
  assert.equal(orchestrator.detectConfirmation('không đồng ý'), false);
  assert.equal(orchestrator.detectConfirmation('oke nhưng đổi giờ'), false);
});

test('explicit "xác nhận" commits the active hold and reads the saved appointment back', async () => {
  const product = await findProduct('Phồng chân');
  const conversation = await createConversation('explicit-confirm');
  const date = getVietnamDate(2);
  const slots = await appointmentService.checkAvailableSlots(
    date,
    null,
    { productIds: [product.id], hairSize: 'L' },
  );
  const time = slots.slots[0];
  const hold = await appointmentService.holdSlot({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    appointmentDate: date,
    appointmentTime: time,
    productId: product.id,
    productIds: [product.id],
    hairSize: 'L',
  });
  await conversationRepository.updateCustomerInfo(conversation.id, {
    name: 'Test Customer',
    phone: '0901234567',
    email: null,
  });
  await conversationRepository.updateChatContext(conversation.id, {
    selected_service_ids: [product.id],
    service_id: product.id,
    service_name: product.name,
    selected_service_source: 'booking_request',
    booking_service_confirmed: true,
    booking_started: true,
    booking_status: 'AWAITING_CONFIRMATION',
    booking_confirmation_pending: true,
    appointment_date: date,
    appointment_time: time,
    hair_size: 'L',
  });

  const reply = await sendTurn(conversation, 'xác nhận');
  const saved = await conversationRepository.findById(conversation.id);
  const appointment = await appointmentRepository.findById(hold.id);
  assert.match(reply.content, /đã xác nhận lịch hẹn thành công/u);
  assert.equal(saved.chat_context.booking_status, 'BOOKED');
  assert.equal(saved.chat_context.appointment_id, appointment.id);
  assert.equal(appointment.status, 'confirmed');
  assert.equal(appointment.booking_code, saved.chat_context.booking_code);
});

test('a failed confirmation never reports booking success', async t => {
  const product = await findProduct('Phồng chân');
  const conversation = await createConversation('failed-confirm');
  const date = getVietnamDate(2);
  const slots = await appointmentService.checkAvailableSlots(
    date,
    null,
    { productIds: [product.id], hairSize: 'L' },
  );
  const time = slots.slots[0];
  await appointmentService.holdSlot({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    appointmentDate: date,
    appointmentTime: time,
    productId: product.id,
    productIds: [product.id],
    hairSize: 'L',
  });
  await conversationRepository.updateCustomerInfo(conversation.id, {
    name: 'Test Customer',
    phone: '0901234567',
    email: null,
  });
  await conversationRepository.updateChatContext(conversation.id, {
    selected_service_ids: [product.id],
    selected_service_source: 'booking_request',
    booking_service_confirmed: true,
    booking_started: true,
    booking_status: 'AWAITING_CONFIRMATION',
    booking_confirmation_pending: true,
    appointment_date: date,
    appointment_time: time,
    hair_size: 'L',
  });

  const originalConfirm = appointmentService.confirmHoldingSlot;
  t.after(() => {
    appointmentService.confirmHoldingSlot = originalConfirm;
  });
  appointmentService.confirmHoldingSlot = async () => {
    throw Object.assign(new Error('Simulated confirmation failure'), {
      status: 409,
      code: 'SLOT_CONFLICT',
    });
  };

  const reply = await sendTurn(conversation, 'oke');
  const saved = await conversationRepository.findById(conversation.id);
  assert.doesNotMatch(reply.content, /đặt lịch thành công|đã xác nhận lịch hẹn thành công/iu);
  assert.notEqual(saved.chat_context.booking_status, 'BOOKED');
  assert.equal(
    jsonStore.getCollection('appointments')
      .filter(item => item.conversation_id === conversation.id && item.status === 'confirmed').length,
    0,
  );
});

test('a change request after "oke" is handled before confirmation', async () => {
  const product = await findProduct('Phồng chân');
  const conversation = await createConversation('change-before-confirm');
  const date = getVietnamDate(3);
  const slots = await appointmentService.checkAvailableSlots(
    date,
    null,
    { productIds: [product.id], hairSize: 'L' },
  );
  const time = slots.slots[0];
  const hold = await appointmentService.holdSlot({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    appointmentDate: date,
    appointmentTime: time,
    productId: product.id,
    productIds: [product.id],
    hairSize: 'L',
  });
  await conversationRepository.updateCustomerInfo(conversation.id, {
    name: 'Test Customer',
    phone: '0901234567',
    email: null,
  });
  await conversationRepository.updateChatContext(conversation.id, {
    selected_service_ids: [product.id],
    booking_service_confirmed: true,
    booking_started: true,
    booking_status: 'AWAITING_CONFIRMATION',
    booking_confirmation_pending: true,
    appointment_date: date,
    appointment_time: time,
    hair_size: 'L',
  });

  const reply = await sendTurn(conversation, 'oke nhưng đổi giờ');
  const saved = await conversationRepository.findById(conversation.id);
  const unchangedHold = await appointmentRepository.findById(hold.id);
  assert.match(reply.content, /đổi ngày hay giờ/u);
  assert.equal(unchangedHold.status, 'holding');
  assert.equal(saved.chat_context.booking_status, 'COLLECTING_BOOKING_DETAILS');
  assert.equal(saved.chat_context.booking_confirmation_pending, false);
  assert.equal(
    jsonStore.getCollection('appointments')
      .filter(item => item.conversation_id === conversation.id && item.status === 'confirmed').length,
    0,
  );
});

test('closed salon days are rejected as a business rule, not a backend exception', async () => {
  const product = await findProduct('Cắt tạo kiểu');
  const settings = jsonStore.getCollection('business_settings');
  const originalWorkingHours = settings.find(item => item.key === 'working_hours').value;
  const date = getVietnamDate(1);
  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = weekdayNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const workingHours = typeof originalWorkingHours === 'string'
    ? JSON.parse(originalWorkingHours)
    : JSON.parse(JSON.stringify(originalWorkingHours));

  workingHours[weekday] = { ...workingHours[weekday], enabled: false };
  settings.find(item => item.key === 'working_hours').value = workingHours;
  jsonStore.saveCollection('business_settings', settings);
  try {
    await assert.rejects(
      appointmentRepository.hold({
        conversationId: null,
        guestSessionId: 'isolated-closed-day',
        appointmentDate: date,
        appointmentTime: '14:00',
        productId: product.id,
        hairSize: 'M',
      }),
      error => error.status === 400 && /không hoạt động/u.test(error.message),
    );
  } finally {
    settings.find(item => item.key === 'working_hours').value = originalWorkingHours;
    jsonStore.saveCollection('business_settings', settings);
  }
});
