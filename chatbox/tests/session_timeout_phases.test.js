'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { v4: uuidv4 } = require('uuid');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-timeout-phases-'));
process.env.JSON_STORE_DATA_DIR = testDataDir;

const jsonStore = require('../src/config/jsonStore');
const conversationRepository = require('../src/repositories/conversationRepository');
const messageRepository = require('../src/repositories/messageRepository');
const sessionTimeoutService = require('../src/services/sessionTimeoutService');

const createdConversationIds = new Set();
const AI_CLOSE_MESSAGE = 'Phiên tư vấn tự động tạm đóng do hết thời gian chờ phản hồi. Salon sẽ liên hệ lại nếu có thông tin.';
const HUMAN_CLOSE_MESSAGE = 'Cuộc trò chuyện với nhân viên đã tự động kết thúc do không có tương tác trong 60 phút.';
const REMINDERS = [
  {
    phase: 'first_response',
    context: {},
    hasCustomerMessage: false,
    text: 'Dạ em vẫn sẵn sàng hỗ trợ; mình cứ nhắn lại khi tiện nhé ạ!',
  },
  {
    phase: 'consultation',
    context: {},
    hasCustomerMessage: true,
    text: 'Dạ, mình còn cần em tư vấn thêm về dịch vụ, giá hoặc thời gian thực hiện không ạ? Em sẵn sàng hỗ trợ mình.',
  },
  {
    phase: 'booking',
    context: { booking_intent_pending: true },
    hasCustomerMessage: true,
    text: 'Dạ, mình cho em biết dịch vụ muốn đặt để em hỗ trợ tiếp nhé ạ.',
  },
  {
    phase: 'slot_selection',
    context: { availability_query_pending: true },
    hasCustomerMessage: true,
    text: 'Dạ, mình chọn giúp em một khung giờ phù hợp trong các khung giờ em vừa gửi nhé ạ.',
  },
  {
    phase: 'customer_details',
    context: { booking_status: 'COLLECTING_CUSTOMER' },
    hasCustomerMessage: true,
    text: 'Dạ, em đang chờ thông tin để tiếp tục đặt lịch. Mình gửi giúp em họ tên và số điện thoại (nếu chưa gửi) nhé ạ.',
  },
  {
    phase: 'booking_confirmation',
    context: { booking_status: 'AWAITING_CONFIRMATION' },
    hasCustomerMessage: true,
    text: 'Dạ, mình kiểm tra lại thông tin đặt lịch và xác nhận giúp em khi sẵn sàng nhé ạ.',
  },
];

async function createConversation({
  mode = 'ai',
  context = {},
  hasCustomerMessage = true,
  at = Date.now() - 60 * 60 * 1000,
} = {}) {
  const conversation = await conversationRepository.create({ guestSessionId: uuidv4() });
  createdConversationIds.add(conversation.id);

  if (Object.keys(context).length) {
    await conversationRepository.updateChatContext(conversation.id, context);
  }
  if (mode !== 'ai') {
    await conversationRepository.updateMode(conversation.id, mode);
  }

  const initialMessage = await messageRepository.create({
    conversationId: conversation.id,
    senderType: hasCustomerMessage ? 'user' : 'assistant',
    content: hasCustomerMessage ? 'Mình cần được hỗ trợ.' : 'Xin chào quý khách.',
  });
  const messages = jsonStore.getCollection('messages');
  messages.find(message => message.id === initialMessage.id).created_at = new Date(at).toISOString();
  jsonStore.saveCollection('messages', messages);

  const conversations = jsonStore.getCollection('conversations');
  const saved = conversations.find(item => item.id === conversation.id);
  saved.created_at = new Date(at).toISOString();
  saved.updated_at = new Date(at).toISOString();
  jsonStore.saveCollection('conversations', conversations);

  return { ...saved, baseTime: at };
}

async function addMessageAt(conversationId, senderType, content, at) {
  const message = await messageRepository.create({ conversationId, senderType, content });
  const messages = jsonStore.getCollection('messages');
  messages.find(item => item.id === message.id).created_at = new Date(at).toISOString();
  jsonStore.saveCollection('messages', messages);
  return message;
}

async function checkAt(now) {
  const previousIds = new Set(jsonStore.getCollection('messages').map(message => message.id));
  const result = await sessionTimeoutService.checkTimeouts(null, { now });
  const messages = jsonStore.getCollection('messages');
  for (const message of messages) {
    if (!previousIds.has(message.id)) {
      message.created_at = new Date(now).toISOString();
    }
  }
  jsonStore.saveCollection('messages', messages);
  return result;
}

function getMessages(conversationId) {
  return jsonStore.getCollection('messages')
    .filter(message => message.conversation_id === conversationId)
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
}

afterEach(() => {
  const conversations = jsonStore.getCollection('conversations');
  jsonStore.saveCollection(
    'conversations',
    conversations.filter(conversation => !createdConversationIds.has(conversation.id))
  );
  for (const collection of ['messages', 'appointments']) {
    const records = jsonStore.getCollection(collection);
    jsonStore.saveCollection(
      collection,
      records.filter(record => !createdConversationIds.has(record.conversation_id))
    );
  }
  createdConversationIds.clear();
});

after(() => {
  sessionTimeoutService.stop();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test('AUTO-03/AUTO-04: first-response reminder is absent at 4:59 and sent once at 5:00', async () => {
  const conversation = await createConversation({ hasCustomerMessage: false });

  const beforeThreshold = await checkAt(conversation.baseTime + 4 * 60 * 1000 + 59 * 1000);
  assert.equal(beforeThreshold.warningsSent.includes(conversation.id), false);
  assert.equal(getMessages(conversation.id).length, 1);

  const atThreshold = await checkAt(conversation.baseTime + 5 * 60 * 1000);
  assert.ok(atThreshold.warningsSent.includes(conversation.id));
  const warning = getMessages(conversation.id)[1];
  assert.equal(warning.content, REMINDERS[0].text);
  assert.equal(warning.metadata.phase, 'first_response');
});

test('AUTO-06/AUTO-10/AUTO-24: AI session remains open at 9:59 and closes 5 minutes after its reminder', async () => {
  const conversation = await createConversation();
  const appointments = jsonStore.getCollection('appointments');
  const hold = {
    id: `hold-${uuidv4()}`,
    conversation_id: conversation.id,
    status: 'holding',
    hold_expires_at: new Date(conversation.baseTime + 5 * 60 * 1000).toISOString(),
  };
  appointments.push(hold);
  jsonStore.saveCollection('appointments', appointments);

  await checkAt(conversation.baseTime + 5 * 60 * 1000);
  const reminder = getMessages(conversation.id)[1];
  assert.equal(reminder.content, REMINDERS[1].text);
  assert.equal(jsonStore.getCollection('appointments').find(item => item.id === hold.id).hold_expires_at, hold.hold_expires_at);

  const beforeClose = await checkAt(conversation.baseTime + 9 * 60 * 1000 + 59 * 1000);
  assert.equal(beforeClose.closedAI.includes(conversation.id), false);

  const result = await checkAt(conversation.baseTime + 10 * 60 * 1000);
  assert.ok(result.closedAI.includes(conversation.id));
  const closed = await conversationRepository.findById(conversation.id);
  assert.equal(closed.mode, 'closed');
  assert.equal(closed.is_lead, true);
  assert.ok(getMessages(conversation.id).some(message => message.content === AI_CLOSE_MESSAGE));
  assert.equal(jsonStore.getCollection('appointments').find(item => item.id === hold.id).status, 'cancelled');
  assert.equal(getMessages(conversation.id).some(message => message.content === reminder.content), true);
});

test('AUTO-07/AUTO-08/AUTO-12/AUTO-13/AUTO-14/AUTO-15/AUTO-21/AUTO-22: each active AI stage observes the 5-minute boundary and sends its matching notice', async () => {
  for (const expected of REMINDERS) {
    const conversation = await createConversation({
      context: expected.context,
      hasCustomerMessage: expected.hasCustomerMessage,
    });

    const beforeThreshold = await checkAt(conversation.baseTime + 4 * 60 * 1000 + 59 * 1000);
    assert.equal(
      beforeThreshold.warningsSent.includes(conversation.id),
      false,
      `${expected.phase}: warning must not be sent before 5 minutes`
    );

    const result = await checkAt(conversation.baseTime + 5 * 60 * 1000);
    assert.ok(result.warningsSent.includes(conversation.id), `${expected.phase}: missing warning`);

    const warning = getMessages(conversation.id).at(-1);
    assert.equal(warning.sender_type, 'assistant');
    assert.equal(warning.content, expected.text);
    assert.equal(warning.metadata.kind, 'session_timeout_warning');
    assert.equal(warning.metadata.phase, expected.phase);
  }
});

test('AUTO-05/AUTO-11/AUTO-27: customer activity resets the old phase timer and changes reminder', async () => {
  const conversation = await createConversation();
  await checkAt(conversation.baseTime + 5 * 60 * 1000);

  const replyTime = conversation.baseTime + 6 * 60 * 1000;
  await addMessageAt(conversation.id, 'user', 'Mình muốn đặt lịch.', replyTime);
  await conversationRepository.updateChatContext(conversation.id, {
    booking_intent_pending: true,
    booking_status: 'SELECTING_SERVICE',
  });
  sessionTimeoutService.resetInactivityWarning(conversation.id);

  const oldDeadline = await checkAt(replyTime + 4 * 60 * 1000 + 59 * 1000);
  assert.equal(oldDeadline.warningsSent.includes(conversation.id), false);

  const newDeadline = await checkAt(replyTime + 5 * 60 * 1000);
  assert.ok(newDeadline.warningsSent.includes(conversation.id));
  assert.equal(getMessages(conversation.id).at(-1).content, REMINDERS[2].text);
});

test('AUTO-16/AUTO-25: completed bookings do not receive a booking reminder and repeated scans do not duplicate notices', async () => {
  const completed = await createConversation({
    context: { booking_status: 'BOOKED', booking_completed: true },
  });
  const result = await checkAt(completed.baseTime + 5 * 60 * 1000);
  assert.ok(result.warningsSent.includes(completed.id));
  assert.equal(getMessages(completed.id).at(-1).metadata.phase, 'consultation');
  assert.doesNotMatch(getMessages(completed.id).at(-1).content, /giữ chỗ|gửi giúp em họ tên/iu);

  const repeated = await createConversation();
  await checkAt(repeated.baseTime + 5 * 60 * 1000);
  await checkAt(repeated.baseTime + 5 * 60 * 1000 + 15 * 1000);
  await checkAt(repeated.baseTime + 9 * 60 * 1000 + 59 * 1000);
  assert.equal(
    getMessages(repeated.id).filter(message => message.metadata?.kind === 'session_timeout_warning').length,
    1
  );
});

test('AUTO-26: concurrent timeout scans persist only one reminder for a conversation', async () => {
  const conversation = await createConversation();
  const now = conversation.baseTime + 5 * 60 * 1000;

  await Promise.all([
    sessionTimeoutService.checkTimeouts(null, { now }),
    sessionTimeoutService.checkTimeouts(null, { now }),
  ]);

  assert.equal(
    getMessages(conversation.id).filter(message => message.metadata?.kind === 'session_timeout_warning').length,
    1
  );
});

test('AUTO-18/AUTO-19/AUTO-20: reminders neither extend holds nor claim an expired hold is active', async () => {
  const conversation = await createConversation({
    context: { booking_status: 'COLLECTING_CUSTOMER' },
  });
  const expiresAt = new Date(conversation.baseTime + 5 * 60 * 1000).toISOString();
  const appointments = jsonStore.getCollection('appointments');
  appointments.push({
    id: `hold-${uuidv4()}`,
    conversation_id: conversation.id,
    status: 'holding',
    hold_expires_at: expiresAt,
  });
  jsonStore.saveCollection('appointments', appointments);

  await checkAt(conversation.baseTime + 6 * 60 * 1000);
  const warning = getMessages(conversation.id).at(-1);
  const hold = jsonStore.getCollection('appointments').find(item => item.conversation_id === conversation.id);
  assert.equal(warning.content, REMINDERS[4].text);
  assert.equal(hold.hold_expires_at, expiresAt);
  assert.doesNotMatch(warning.content, /còn \d+ phút|đang giữ chỗ/iu);
});

for (const mode of ['human', 'waiting_for_agent']) {
  test(`AUTO-31: ${mode} conversation closes after 60 minutes with the configured notice`, async () => {
    const conversation = await createConversation({ mode });
    const beforeClose = await checkAt(conversation.baseTime + 60 * 60 * 1000 - 1);
    assert.equal(beforeClose.closedHuman.includes(conversation.id), false);

    const atClose = await checkAt(conversation.baseTime + 60 * 60 * 1000);
    assert.ok(atClose.closedHuman.includes(conversation.id));
    assert.equal(getMessages(conversation.id).at(-1).content, HUMAN_CLOSE_MESSAGE);
  });
}

test.todo('AUTO-09: suppress an inactivity reminder while an AI response is still being generated; no in-progress marker exists yet');
