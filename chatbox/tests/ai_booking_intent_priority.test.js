'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const conversationRepository = require('../src/repositories/conversationRepository');
const messageRepository = require('../src/repositories/messageRepository');
const appointmentRepository = require('../src/repositories/appointmentRepository');
const appointmentService = require('../src/services/appointmentService');
const productRepository = require('../src/repositories/productRepository');
const conversationContext = require('../src/ai/conversationContext');
const servicePricing = require('../src/ai/servicePricing');
const orchestrator = require('../src/ai/orchestrator');
const provider = require('../src/ai/provider');
const jsonStore = require('../src/config/jsonStore');
const { getVietnamDate } = require('../src/ai/tools');

const originals = {
  findForAI: messageRepository.findForAI,
  findActiveHoldByConversation: appointmentRepository.findActiveHoldByConversation,
  checkAvailableSlots: appointmentService.checkAvailableSlots,
  holdSlot: appointmentService.holdSlot,
  resolvePriceInquiry: servicePricing.resolvePriceInquiry,
  isConfigured: provider.isConfigured,
  chat: provider.chat,
};
const testSessionIds = [];
const histories = new Map();
const availabilityChecks = [];
const holds = [];
let priceResolverCalls = 0;
let providerCalls = 0;

messageRepository.findForAI = async conversationId => histories.get(conversationId) || [];
appointmentRepository.findActiveHoldByConversation = async () => null;
appointmentService.checkAvailableSlots = async date => {
  availabilityChecks.push(date);
  return { slots: ['14:00'] };
};
appointmentService.holdSlot = async input => {
  holds.push(input);
  return {
    holding_token: `test-hold-${holds.length}`,
    appointment_date: input.appointmentDate,
    appointment_time: input.appointmentTime,
    hold_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
};
servicePricing.resolvePriceInquiry = async () => {
  priceResolverCalls++;
  return { handled: true, content: 'Báo giá cũ không được lặp lại.' };
};
provider.isConfigured = () => true;
provider.chat = async () => {
  providerCalls++;
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: 'Dạ, anh/chị muốn đặt vào khung giờ nào ạ?',
      },
    }],
  };
};

after(() => {
  messageRepository.findForAI = originals.findForAI;
  appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldByConversation;
  appointmentService.checkAvailableSlots = originals.checkAvailableSlots;
  appointmentService.holdSlot = originals.holdSlot;
  servicePricing.resolvePriceInquiry = originals.resolvePriceInquiry;
  provider.isConfigured = originals.isConfigured;
  provider.chat = originals.chat;

  const testSessions = new Set(testSessionIds);
  const conversations = jsonStore.getCollection('conversations');
  const conversationIds = new Set(conversations
    .filter(conversation => testSessions.has(conversation.guest_session_id))
    .map(conversation => conversation.id));
  jsonStore.saveCollection(
    'conversations',
    conversations.filter(conversation => !testSessions.has(conversation.guest_session_id))
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

async function createBookingConversation(label, chatContext, history = []) {
  const guestSessionId = `booking-intent-priority-${label}-${Date.now()}-${Math.random()}`;
  let conversation = await conversationRepository.create({ guestSessionId });
  testSessionIds.push(guestSessionId);
  conversation = await conversationRepository.updateChatContext(conversation.id, chatContext);
  histories.set(conversation.id, history);
  return conversation;
}

async function sendTurn(conversation, userMessage) {
  return orchestrator.chat({
    conversationId: conversation.id,
    guestSessionId: conversation.guest_session_id,
    userMessage,
  });
}

test('prioritizes booking with confirmed service, date and time over a pending price response', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.find(item => /uốn mái\s*\/\s*phồng mái/iu.test(item.name));
  assert.ok(service);
  const date = getVietnamDate(1);
  const conversation = await createBookingConversation('confirmed', {
    selected_service_ids: [service.id],
    booking_service_confirmed: true,
    booking_started: true,
    hair_size: 'M',
    pricing_inquiry_active: true,
  }, [
    { sender_type: 'user', content: 'Giá uốn tóc bao nhiêu?' },
    { sender_type: 'assistant', content: 'Dạ, uốn mái / phồng mái: 100.000 VNĐ.' },
  ]);
  const beforeChecks = availabilityChecks.length;
  const beforeHolds = holds.length;

  const reply = await sendTurn(conversation, 'Tôi muốn đặt lịch 14 giờ ngày mai');
  const updated = await conversationRepository.findById(conversation.id);

  assert.equal(updated.chat_context.appointment_date, date);
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.equal(availabilityChecks.length, beforeChecks + 1);
  assert.equal(availabilityChecks.at(-1), date);
  assert.equal(holds.length, beforeHolds + 1);
  assert.equal(holds.at(-1).appointmentTime, '14:00');
  assert.equal(holds.at(-1).hairSize, 'M');
  assert.match(reply.content, /họ tên và số điện thoại/u);
  assert.equal(priceResolverCalls, 0);
});

test('asks only for a time when the confirmed service and requested date are known', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows[0];
  const conversation = await createBookingConversation('missing-time', {
    selected_service_ids: [service.id],
    booking_service_confirmed: true,
    booking_started: true,
    hair_size: 'M',
    pricing_inquiry_active: true,
  }, [
    { sender_type: 'user', content: 'Giá dịch vụ bao nhiêu?' },
    { sender_type: 'assistant', content: 'Dạ, dịch vụ có giá theo size.' },
  ]);
  const beforeChecks = availabilityChecks.length;

  const reply = await sendTurn(conversation, 'Tôi muốn đặt lịch ngày mai');
  const updated = await conversationRepository.findById(conversation.id);

  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, undefined);
  assert.equal(availabilityChecks.length, beforeChecks);
  assert.match(reply.content, /khung giờ nào/u);
  assert.equal(priceResolverCalls, 0);
});

test('does not treat a service used for pricing as confirmed for booking', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows[0];
  const conversation = await createBookingConversation('unconfirmed-service', {
    selected_service_ids: [service.id],
    booking_service_confirmed: false,
    pricing_inquiry_active: true,
  }, [
    { sender_type: 'user', content: 'Giá dịch vụ này bao nhiêu?' },
    { sender_type: 'assistant', content: 'Dạ, dịch vụ có giá theo size.' },
  ]);
  const beforeChecks = availabilityChecks.length;

  const reply = await sendTurn(conversation, 'Tôi muốn đặt lịch 14 giờ ngày mai');
  const updated = await conversationRepository.findById(conversation.id);

  assert.match(reply.content, /muốn đặt lịch sử dụng dịch vụ (?:nào|gì)/u);
  assert.deepEqual(updated.chat_context.selected_service_ids, []);
  assert.equal(updated.chat_context.booking_intent_pending, true);
  assert.equal(updated.chat_context.booking_service_confirmed, false);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.equal(updated.chat_context.appointment_time, '14:00');
  assert.equal(availabilityChecks.length, beforeChecks);
  assert.equal(priceResolverCalls, 0);
});

test('switches from a price inquiry to asking for a service when booking starts', async () => {
  const conversation = await createBookingConversation('price-to-booking', {
    pricing_inquiry_active: true,
  }, [
    { sender_type: 'user', content: 'Giá uốn tóc bao nhiêu?' },
    { sender_type: 'assistant', content: 'Dạ, mình muốn hỏi giá dịch vụ nào ạ?' },
  ]);
  const beforeProviderCalls = providerCalls;

  const reply = await sendTurn(conversation, 'Tôi muốn đặt lịch');

  assert.match(reply.content, /muốn đặt lịch sử dụng dịch vụ (?:nào|gì)/u);
  assert.equal(priceResolverCalls, 0);
  assert.equal(providerCalls, beforeProviderCalls);
});

test('repeated booking requests continue the pending booking instead of replaying pricing', async () => {
  const conversation = await createBookingConversation('repeat-booking', {
    pricing_inquiry_active: true,
  }, [
    { sender_type: 'user', content: 'Giá uốn tóc bao nhiêu?' },
    { sender_type: 'assistant', content: 'Dạ, mình muốn hỏi giá dịch vụ nào ạ?' },
  ]);
  const beforeProviderCalls = providerCalls;

  const firstReply = await sendTurn(conversation, 'Tôi muốn đặt lịch');
  histories.set(conversation.id, [
    ...histories.get(conversation.id),
    { sender_type: 'user', content: 'Tôi muốn đặt lịch' },
    { sender_type: 'assistant', content: firstReply.content },
  ]);
  const secondReply = await sendTurn(conversation, 'Tôi muốn đặt lịch ngày mai');

  assert.match(firstReply.content, /muốn đặt lịch sử dụng dịch vụ (?:nào|gì)/u);
  assert.match(secondReply.content, /muốn đặt lịch sử dụng dịch vụ (?:nào|gì)/u);
  assert.doesNotMatch(secondReply.content, /VNĐ/u);
  assert.equal(priceResolverCalls, 0);
  assert.equal(providerCalls, beforeProviderCalls);
});

test('starts a new booking without reusing the completed booking date, time or service', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows[0];
  const conversation = await createBookingConversation('new-after-completion', {
    selected_service_ids: [service.id],
    booking_service_confirmed: true,
    booking_started: false,
    booking_completed: true,
    appointment_date: '2027-05-20',
    appointment_time: '14:00',
  });

  const reply = await sendTurn(conversation, 'Tôi muốn đặt lịch');
  const updated = await conversationRepository.findById(conversation.id);

  assert.match(reply.content, /muốn đặt lịch sử dụng dịch vụ (?:nào|gì)/u);
  assert.deepEqual(updated.chat_context.selected_service_ids, []);
  assert.equal(updated.chat_context.booking_service_confirmed, false);
  assert.equal(updated.chat_context.appointment_date, null);
  assert.equal(updated.chat_context.appointment_time, null);
  assert.equal(updated.chat_context.booking_intent_pending, true);
});
