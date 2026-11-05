'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const conversationRepository = require('../src/repositories/conversationRepository');
const messageRepository = require('../src/repositories/messageRepository');
const appointmentRepository = require('../src/repositories/appointmentRepository');
const appointmentService = require('../src/services/appointmentService');
const productRepository = require('../src/repositories/productRepository');
const orchestrator = require('../src/ai/orchestrator');
const provider = require('../src/ai/provider');
const jsonStore = require('../src/config/jsonStore');
const { getVietnamDate } = require('../src/ai/tools');

const originals = {
  findForAI: messageRepository.findForAI,
  findActiveHoldByConversation: appointmentRepository.findActiveHoldByConversation,
  checkAvailableSlots: appointmentService.checkAvailableSlots,
  holdSlot: appointmentService.holdSlot,
  releaseHoldSlot: appointmentService.releaseHoldSlot,
  isConfigured: provider.isConfigured,
  chat: provider.chat,
};
const testSessionIds = [];
const histories = new Map();
const activeHolds = new Map();
const availabilityChecks = [];
const holds = [];
const releases = [];
let availableSlots = ['14:00', '15:00'];
let availabilityError = null;
let providerCalls = 0;

messageRepository.findForAI = async conversationId => histories.get(conversationId) || [];
appointmentRepository.findActiveHoldByConversation = async conversationId =>
  activeHolds.get(conversationId) || null;
appointmentService.checkAvailableSlots = async date => {
  availabilityChecks.push(date);
  if (availabilityError) throw availabilityError;
  return { date, slots: [...availableSlots] };
};
appointmentService.holdSlot = async input => {
  holds.push(input);
  const service = await productRepository.findById(input.productIds[0]);
  const tier = input.hairSize ? service.prices_by_size?.[input.hairSize] : null;
  const hold = {
    id: `test-hold-${holds.length}`,
    holding_token: `test-token-${holds.length}`,
    conversation_id: input.conversationId,
    appointment_date: input.appointmentDate,
    appointment_time: input.appointmentTime,
    product_name: service.name,
    price: tier?.price ?? service.price,
    duration_minutes: tier?.duration ?? service.duration,
    hold_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  activeHolds.set(input.conversationId, hold);
  return hold;
};
appointmentService.releaseHoldSlot = async ({ holdingToken }) => {
  releases.push(holdingToken);
  for (const [conversationId, hold] of activeHolds) {
    if (hold.holding_token === holdingToken) {
      activeHolds.delete(conversationId);
      return true;
    }
  }
  return false;
};
provider.isConfigured = () => true;
provider.chat = async () => {
  providerCalls++;
  throw new Error('Booking continuation must not depend on the LLM');
};

async function createConversation(label, chatContext = {}) {
  const guestSessionId = `booking-transition-${label}-${Date.now()}-${Math.random()}`;
  let conversation = await conversationRepository.create({ guestSessionId });
  testSessionIds.push(guestSessionId);
  if (Object.keys(chatContext).length) {
    conversation = await conversationRepository.updateChatContext(conversation.id, chatContext);
  }
  histories.set(conversation.id, []);
  return conversation;
}

async function sendTurn(conversation, userMessage) {
  const reply = await orchestrator.chat({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    userMessage,
  });
  const history = histories.get(conversation.id) || [];
  history.push(
    { sender_type: 'user', content: userMessage },
    { sender_type: 'assistant', content: reply.content }
  );
  histories.set(conversation.id, history);
  return reply;
}

async function findService(name) {
  const { rows } = await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  });
  return rows.find(service => service.name === name);
}

after(() => {
  messageRepository.findForAI = originals.findForAI;
  appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldByConversation;
  appointmentService.checkAvailableSlots = originals.checkAvailableSlots;
  appointmentService.holdSlot = originals.holdSlot;
  appointmentService.releaseHoldSlot = originals.releaseHoldSlot;
  provider.isConfigured = originals.isConfigured;
  provider.chat = originals.chat;

  const sessions = new Set(testSessionIds);
  const conversations = jsonStore.getCollection('conversations');
  const conversationIds = new Set(conversations
    .filter(conversation => sessions.has(conversation.guest_session_id))
    .map(conversation => conversation.id));
  jsonStore.saveCollection(
    'conversations',
    conversations.filter(conversation => !sessions.has(conversation.guest_session_id))
  );
  jsonStore.saveCollection(
    'messages',
    jsonStore.getCollection('messages').filter(message => !conversationIds.has(message.conversation_id))
  );
  jsonStore.saveCollection(
    'appointments',
    jsonStore.getCollection('appointments').filter(appointment =>
      !conversationIds.has(appointment.conversation_id)
    )
  );
});

test('service-first booking retains service/date/time and asks for required size before holding', async () => {
  const service = await findService('Uốn mái / phồng mái');
  const conversation = await createConversation('service-first');
  const consultation = await sendTurn(conversation, 'uốn mái');
  assert.match(consultation.content, /Uốn mái \/ phồng mái/u);

  const beforeProvider = providerCalls;
  const beforeChecks = availabilityChecks.length;
  const beforeHolds = holds.length;
  const reply = await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');
  const updated = await conversationRepository.findById(conversation.id);

  assert.match(reply.content, /độ dài tóc|size S, M hay L/u);
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.equal(availabilityChecks.length, beforeChecks);
  assert.equal(holds.length, beforeHolds);
  assert.equal(providerCalls, beforeProvider);
});

test('changing the requested time retains the selected service and rechecks availability', async () => {
  const service = await findService('Uốn mái / phồng mái');
  const conversation = await createConversation('time-change');
  await sendTurn(conversation, 'uốn mái');
  await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');
  await sendTurn(conversation, 'tóc ngang vai');
  const beforeChecks = availabilityChecks.length;
  const beforeHolds = holds.length;

  const reply = await sendTurn(conversation, 'đổi sang 15 giờ');
  const updated = await conversationRepository.findById(conversation.id);
  const conversationHolds = holds.slice(beforeHolds);

  assert.match(reply.content, /giữ chỗ|họ tên và số điện thoại/u);
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '15:00');
  assert.equal(availabilityChecks.length, beforeChecks + 1);
  assert.deepEqual(conversationHolds.map(hold => hold.appointmentTime), ['15:00']);
  assert.equal(conversationHolds[0].hairSize, 'M');
});

test('changing the service releases the old hold and clears dependent size state', async () => {
  const permService = await findService('Uốn mái / phồng mái');
  const haircutService = await findService('Cắt tạo kiểu');
  const conversation = await createConversation('service-change');
  await sendTurn(conversation, 'uốn mái');
  await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');
  await sendTurn(conversation, 'tóc ngang vai');
  const oldHold = activeHolds.get(conversation.id);

  const reply = await sendTurn(conversation, 'tôi muốn chuyển sang cắt tóc');
  const updated = await conversationRepository.findById(conversation.id);

  assert.ok(releases.includes(oldHold.holding_token));
  assert.ok(!updated.chat_context.selected_service_ids.includes(permService.id));
  assert.ok(
    updated.chat_context.selected_service_ids.includes(haircutService.id) ||
      updated.chat_context.booking_requested_category === 'Cắt tóc'
  );
  assert.equal(updated.chat_context.hair_size, null);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.match(reply.content, /size|dịch vụ/u);
  assert.notEqual(activeHolds.get(conversation.id)?.product_name, permService.name);
});

test('an occupied requested time returns only backend alternatives and does not hold a slot', async () => {
  const service = await findService('Uốn mái / phồng mái');
  availableSlots = ['15:00', '16:00'];
  const conversation = await createConversation('occupied-time', {
    selected_service_ids: [service.id],
    selected_service_source: 'booking_request',
    booking_service_confirmed: true,
    booking_started: true,
    hair_size: 'M',
  });
  const beforeHolds = holds.length;

  const reply = await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');

  assert.match(reply.content, /14:00/u);
  assert.match(reply.content, /15:00, 16:00/u);
  assert.equal(holds.length, beforeHolds);
  availableSlots = ['14:00', '15:00'];
});

test('availability errors are logged and preserve booking state without invoking the LLM', async () => {
  const service = await findService('Uốn mái / phồng mái');
  const conversation = await createConversation('availability-error', {
    selected_service_ids: [service.id],
    selected_service_source: 'booking_request',
    booking_service_confirmed: true,
    booking_started: true,
    hair_size: 'M',
  });
  availabilityError = Object.assign(new Error('database unavailable'), {
    code: 'DB_CONNECTION_FAILED',
    status: 503,
  });
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  const beforeProvider = providerCalls;
  let reply;
  try {
    reply = await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');
  } finally {
    console.error = originalConsoleError;
    availabilityError = null;
  }
  const updated = await conversationRepository.findById(conversation.id);
  const logEntry = logged.find(args => args[0] === '[AI] Booking step failed')?.[1];

  assert.match(reply.content, /hệ thống lịch đang gặp sự cố/u);
  assert.equal(updated.chat_context.selected_service_ids[0], service.id);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.equal(logEntry.phase, 'availability_check');
  assert.deepEqual(logEntry.serviceIds, [service.id]);
  assert.equal(logEntry.errorCode, 'DB_CONNECTION_FAILED');
  assert.equal(providerCalls, beforeProvider);
});

test('a size-priced service cannot be held or assigned a default price before size is known', async () => {
  const service = await findService('Uốn mái / phồng mái');
  const conversation = await createConversation('missing-size');
  await sendTurn(conversation, 'uốn mái');
  const beforeChecks = availabilityChecks.length;
  const beforeHolds = holds.length;

  const reply = await sendTurn(conversation, 'đặt lịch vào 14 giờ ngày mai');

  const updated = await conversationRepository.findById(conversation.id);
  assert.match(reply.content, /độ dài tóc/u);
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.hair_size, undefined);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.equal(availabilityChecks.length, beforeChecks);
  assert.equal(holds.length, beforeHolds);
});

test('repository calculates held service price from the selected size tier', async () => {
  const service = await findService('Uốn mái / phồng mái');
  const appointmentDay = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);
  while (appointmentDay.getDay() === 0 || appointmentDay.getDay() === 6) {
    appointmentDay.setDate(appointmentDay.getDate() + 1);
  }
  const appointmentDate = [
    appointmentDay.getFullYear(),
    String(appointmentDay.getMonth() + 1).padStart(2, '0'),
    String(appointmentDay.getDate()).padStart(2, '0'),
  ].join('-');
  let hold;

  try {
    hold = await appointmentRepository.hold({
      conversationId: `size-price-test-${Date.now()}`,
      guestSessionId: `size-price-test-session-${Date.now()}`,
      appointmentDate,
      appointmentTime: '08:30',
      productIds: [service.id],
      hairSize: 'M',
    });

    assert.equal(hold.price, service.prices_by_size.M.price);
    assert.equal(hold.duration_minutes, service.prices_by_size.M.duration);
  } finally {
    if (hold) {
      jsonStore.saveCollection(
        'appointments',
        jsonStore.getCollection('appointments').filter(appointment => appointment.id !== hold.id)
      );
    }
  }
});
