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
