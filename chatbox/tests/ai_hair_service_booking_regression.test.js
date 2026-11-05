'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const conversationRepository = require('../src/repositories/conversationRepository');
const messageRepository = require('../src/repositories/messageRepository');
const appointmentRepository = require('../src/repositories/appointmentRepository');
const productRepository = require('../src/repositories/productRepository');
const conversationContext = require('../src/ai/conversationContext');
const orchestrator = require('../src/ai/orchestrator');
const provider = require('../src/ai/provider');
const servicePricing = require('../src/ai/servicePricing');
const jsonStore = require('../src/config/jsonStore');
const systemSettings = require('../src/repositories/settingsRepository');
const { getVietnamDate } = require('../src/ai/tools');

const originals = {
  findForAI: messageRepository.findForAI,
  findActiveHoldForConversation: appointmentRepository.findActiveHoldByConversation,
  isConfigured: provider.isConfigured,
  chat: provider.chat,
};
const testSessionIds = [];
const histories = new Map();
let providerContent = 'Dạ, mình muốn đặt lịch vào ngày nào ạ?';
const providerRequests = [];

messageRepository.findForAI = async conversationId => histories.get(conversationId) || [];
appointmentRepository.findActiveHoldByConversation = async () => null;
provider.isConfigured = () => true;
provider.chat = async request => {
  providerRequests.push(request);
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: providerContent,
      },
    }],
  };
};

async function createConversation(label, chatContext = {}) {
  const guestSessionId = `hair-service-regression-${label}-${Date.now()}-${Math.random()}`;
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

after(() => {
  messageRepository.findForAI = originals.findForAI;
  appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldForConversation;
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

test('broad perm inquiry lists only active catalog services and asks for a real choice', async () => {
  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.filter(service => service.category_name === 'Uốn tóc');
  const reply = await servicePricing.resolveServiceInquiry({
    userMessage: 'Tôi muốn uốn tóc',
    conversation: { chat_context: {} },
  });

  assert.equal(reply.handled, true);
  for (const service of services) assert.ok(reply.content.includes(service.name));
  assert.doesNotMatch(reply.content, /uốn lỏng|uốn nếp|tự uốn tóc|thời lượng|dịch vụ bổ sung/iu);
});

test('perm bang phrases map to the existing bang-perm catalog service', async () => {
  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;
  const phrases = ['Uốn tóc mái', 'Uốn mái', 'Phồng mái', 'Uốn phồng phần mái'];
  const matches = phrases.map(phrase => servicePricing.findDirectMatches(phrase, services));

  assert.ok(matches.every(items => items.length === 1));
  assert.equal(new Set(matches.map(items => items[0].id)).size, 1);
  assert.equal(matches[0][0].name, 'Uốn mái / phồng mái');
});

test('confirmed service and booking date persist when customer provides only the date', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.find(item => item.name === 'Uốn mái / phồng mái');
  assert.ok(service);
  const conversation = await createConversation('service-then-date');
  providerContent = 'Dạ, em đã ghi nhận dịch vụ. Mình muốn đặt lịch ngày nào ạ?';
  const beforeProviderCalls = providerRequests.length;

  const serviceReply = await sendTurn(conversation, 'Tôi muốn đặt lịch uốn tóc mái');
  let updated = await conversationRepository.findById(conversation.id);
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.match(serviceReply.content, /độ dài tóc/u);
  assert.equal(providerRequests.length, beforeProviderCalls);

  await sendTurn(conversation, 'Tóc ngang vai');
  const dateReply = await sendTurn(conversation, 'Ngày mai');
  updated = await conversationRepository.findById(conversation.id);

  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.doesNotMatch(dateReply.content, /dịch vụ gì|dịch vụ nào/u);
});

test('service provided after date-first booking is saved and internal output is blocked', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.find(item => item.name === 'Uốn mái / phồng mái');
  const conversation = await createConversation('date-then-service');

  const dateReply = await sendTurn(conversation, 'Tôi muốn đặt lịch ngày mai');
  assert.match(dateReply.content, /dịch vụ/u);

  providerContent = 'assistant\nBạn muốn uốn tóc mái kiểu gì (uốn lỏng, uốn nếp hay uốn xoăn)? Bạn có muốn thêm dịch vụ bổ sung không?';
  const serviceReply = await sendTurn(conversation, 'Uốn tóc mái');
  const updated = await conversationRepository.findById(conversation.id);

  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
  assert.doesNotMatch(serviceReply.content, /assistant|nếu khách muốn|bạn có thể hỏi|thời lượng/iu);
  assert.match(serviceReply.content, /Uốn mái \/ phồng mái/u);
  assert.match(serviceReply.content, /độ dài tóc/u);
});

test('a service selected during consultation is reused when booking starts', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.find(item => item.name === 'Uốn mái / phồng mái');
  const conversation = await createConversation('consultation-then-booking');

  const consultationReply = await sendTurn(conversation, 'Uốn tóc mái');
  assert.match(consultationReply.content, /Uốn mái \/ phồng mái/u);
  let updated = await conversationRepository.findById(conversation.id);
  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, false);
  assert.equal(updated.chat_context.selected_service_source, 'service_consultation');

  providerContent = 'Dạ, mình muốn đặt lịch vào ngày nào ạ?';
  const bookingReply = await sendTurn(conversation, 'Tôi muốn đặt lịch');
  updated = await conversationRepository.findById(conversation.id);

  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.equal(updated.chat_context.selected_service_source, 'booking_request');
  assert.match(bookingReply.content, /độ dài tóc/u);
  assert.doesNotMatch(bookingReply.content, /dịch vụ nào|dịch vụ gì/u);
});

test('role labels are removed from customer-facing AI output', async () => {
  const conversation = await createConversation('role-label');
  providerContent = 'assistant: Dạ, em có thể hỗ trợ mình tìm hiểu dịch vụ ạ.';

  const reply = await sendTurn(conversation, 'Bạn có thể tư vấn dịch vụ salon không?');

  assert.equal(reply.content, 'Dạ, em có thể hỗ trợ mình tìm hiểu dịch vụ ạ.');
  assert.doesNotMatch(reply.content, /^assistant/iu);
});

test('explicit service change replaces the selected service without losing the date', async () => {
  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;
  const oldService = services.find(item => item.name === 'Uốn mái / phồng mái');
  const newService = services.find(item => item.name === 'Cắt tạo kiểu');
  assert.ok(oldService);
  assert.ok(newService);
  const appointmentDate = getVietnamDate(1);
  const conversation = await createConversation('service-change', {
    selected_service_ids: [oldService.id],
    booking_service_confirmed: true,
    booking_started: true,
    appointment_date: appointmentDate,
  });

  await sendTurn(conversation, 'Tôi muốn đổi dịch vụ sang Cắt tóc');
  const updated = await conversationRepository.findById(conversation.id);

  assert.deepEqual(updated.chat_context.selected_service_ids, [newService.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.equal(updated.chat_context.appointment_date, appointmentDate);
  assert.equal(updated.chat_context.selected_service_ids.includes(oldService.id), false);
});

test('session warning stays visible but is excluded from AI history without erasing booking state', async () => {
  const service = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows.find(item => item.name === 'Uốn mái / phồng mái');
  const conversation = await createConversation('warning-resume', {
    selected_service_ids: [service.id],
    booking_service_confirmed: true,
    booking_started: true,
  });
  const warning = await messageRepository.create({
    conversationId: conversation.id,
    senderType: 'assistant',
    content: 'Dạ em thấy mình đang bận, phiên chat sẽ tự động kết thúc sau 5 phút nữa.',
    metadata: { kind: 'session_timeout_warning' },
  });
  assert.equal(warning.metadata.kind, 'session_timeout_warning');
  const legacyWarning = await messageRepository.create({
    conversationId: conversation.id,
    senderType: 'assistant',
    content: 'Dạ em thấy mình đang bận, phiên chat sẽ tự động kết thúc sau 5 phút nữa nếu không có tương tác ạ.',
  });
  assert.equal(legacyWarning.metadata, null);
  histories.set(conversation.id, await originals.findForAI(conversation.id));
  assert.deepEqual(histories.get(conversation.id), []);

  providerContent = 'Dạ, mình thuận tiện khung giờ nào ạ?';
  await sendTurn(conversation, 'Ngày mai');
  const updated = await conversationRepository.findById(conversation.id);

  assert.deepEqual(updated.chat_context.selected_service_ids, [service.id]);
  assert.equal(updated.chat_context.booking_service_confirmed, true);
  assert.equal(updated.chat_context.booking_started, true);
  assert.equal(updated.chat_context.appointment_date, getVietnamDate(1));
});

test('active System Prompt uses the six required sections and disallows internal instructions', async () => {
  const prompt = await systemSettings.get('ai_system_prompt');
  for (const section of [
    'ROLE – VAI TRÒ',
    'SCOPE – PHẠM VI DỮ LIỆU',
    'BUSINESS RULES – QUY TRÌNH NGHIỆP VỤ',
    'OUTPUT FORMAT – ĐỊNH DẠNG TRẢ LỜI',
    'UNCERTAINTY – XỬ LÝ KHI KHÔNG ĐỦ THÔNG TIN',
    'CONSTRAINTS – CÁC ĐIỀU CẤM',
  ]) {
    assert.ok(prompt.includes(section), `Missing prompt section ${section}`);
  }
  assert.match(prompt, /Không trả lời kiểu “Nếu khách muốn/u);
});
