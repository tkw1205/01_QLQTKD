'use strict';

const { test, describe, after } = require('node:test');
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

describe('Conversation context across pricing and booking turns', { concurrency: false }, () => {
  let conversation;
  const originals = {};
  const testSessionIds = [];

  after(() => {
    if (originals.findById) conversationRepository.findById = originals.findById;
    if (originals.findForAI) messageRepository.findForAI = originals.findForAI;
    if (originals.findActiveHoldByConversation) {
      appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldByConversation;
    }
    if (originals.isConfigured) provider.isConfigured = originals.isConfigured;
    if (originals.chat) provider.chat = originals.chat;

    const testSessions = new Set(testSessionIds);
    const allConversations = jsonStore.getCollection('conversations');
    const testConversationIds = new Set(allConversations
      .filter(item => testSessions.has(item.guest_session_id))
      .map(item => item.id));
    const conversations = allConversations.filter(item => !testSessions.has(item.guest_session_id));
    jsonStore.saveCollection('conversations', conversations);
    jsonStore.saveCollection(
      'messages',
      jsonStore.getCollection('messages').filter(item => !testConversationIds.has(item.conversation_id))
    );
    jsonStore.saveCollection(
      'appointments',
      jsonStore.getCollection('appointments').filter(item => !testConversationIds.has(item.conversation_id))
    );
  });

  test('setup a new isolated conversation', async () => {
    conversation = await conversationRepository.create({
      guestSessionId: `context-test-${Date.now()}`,
    });
    testSessionIds.push(conversation.guest_session_id);

    originals.findById = conversationRepository.findById;
    originals.findForAI = messageRepository.findForAI;
    originals.findActiveHoldByConversation = appointmentRepository.findActiveHoldByConversation;
    originals.isConfigured = provider.isConfigured;
    originals.chat = provider.chat;

    const originalFindById = originals.findById;
    conversationRepository.findById = async id => {
      if (id === conversation.id) return originalFindById(id);
      return originals.findById(id);
    };
    messageRepository.findForAI = async id => id === conversation.id ? [] : originals.findForAI(id);
    appointmentRepository.findActiveHoldByConversation = async id =>
      id === conversation.id ? null : originals.findActiveHoldByConversation(id);
    provider.isConfigured = () => true;
    provider.chat = async () => {
      throw new Error('Booking context should be handled deterministically');
    };
  });

  async function processTurn(userMessage) {
    conversation = await processConversationTurn(conversation, userMessage);
    return conversation;
  }

  async function processConversationTurn(currentConversation, userMessage) {
    return conversationContext.updateConversationContext(
      currentConversation.id,
      currentConversation,
      userMessage,
      []
    );
  }

  test('preserves selected service and size through ambiguous price, selection, and length turns', async () => {
    await processTurn('Giá uốn tóc?');
    const emptyContext = conversation.chat_context;
    assert.equal(emptyContext.pricing_inquiry_active, true);

    await processTurn('Uốn mái');
    const selectedServiceId = conversation.chat_context.selected_service_ids[0];
    assert.ok(selectedServiceId);

    await processTurn('Tóc tôi ngang vai');
    assert.deepEqual(conversation.chat_context.selected_service_ids, [selectedServiceId]);
    assert.equal(conversation.chat_context.hair_size, 'M');

    const followUpPrice = await servicePricing.resolvePriceInquiry({
      userMessage: 'Tóc tôi ngang vai',
      history: [
        { sender_type: 'user', content: 'Giá uốn tóc?' },
        { sender_type: 'assistant', content: 'Mình muốn hỏi giá dịch vụ nào ạ?' },
        { sender_type: 'user', content: 'Uốn mái' },
        { sender_type: 'assistant', content: 'Mình cho em biết tóc thuộc size S, M hay L ạ?' },
      ],
      conversation,
    });
    assert.match(followUpPrice.content, /Uốn mái \/ phồng mái/u);
    assert.match(followUpPrice.content, /size M/u);
    assert.match(followUpPrice.content, /100\.000 VNĐ/u);
  });

  test('switches selected service while retaining hair size, then stores booking date and time intent', async () => {
    const firstServiceId = conversation.chat_context.selected_service_ids[0];
    await processTurn('Phồng chân uốn tóc ngang vai');
    const secondServiceId = conversation.chat_context.selected_service_ids[0];
    assert.notEqual(secondServiceId, firstServiceId);
    assert.equal(conversation.chat_context.hair_size, 'M');

    const switchedPrice = await servicePricing.resolvePriceInquiry({
      userMessage: 'Phồng chân uốn tóc ngang vai',
      conversation,
    });
    assert.match(switchedPrice.content, /Phồng chân/u);
    assert.match(switchedPrice.content, /200\.000 VNĐ/u);

    await processTurn('Tôi muốn làm vào lúc 24h');
    assert.equal(conversation.chat_context.booking_started, true);
    assert.deepEqual(conversation.chat_context.selected_service_ids, [secondServiceId]);
    assert.equal(conversation.chat_context.invalid_appointment_time, true);
    assert.equal(conversation.chat_context.appointment_time, null);

    const invalidTimeReply = await orchestrator.chat({
      conversationId: conversation.id,
      userMessage: 'Tôi muốn làm vào lúc 24h',
    });
    assert.match(invalidTimeReply.content, /24h không phải giờ hẹn hợp lệ/u);
    assert.match(invalidTimeReply.content, /08:30–20:30/u);

    await processTurn('Uốn tóc phồng chân');
    assert.equal(conversation.chat_context.selected_service_ids[0], secondServiceId);
    assert.equal(conversation.chat_context.pricing_inquiry_active, true);

    await processTurn('Mai làm');
    assert.equal(conversation.chat_context.booking_started, true);
    assert.ok(conversation.chat_context.appointment_date);
    assert.equal(conversation.chat_context.selected_service_ids[0], secondServiceId);
  });

  test('asks only for missing booking information and isolates context in a new conversation', async () => {
    const dateReply = await orchestrator.chat({
      conversationId: conversation.id,
      userMessage: 'Mai làm',
    });
    assert.match(dateReply.content, /muốn làm vào khung giờ nào/u);

    const newConversation = await conversationRepository.create({
      guestSessionId: `context-test-new-${Date.now()}`,
    });
    testSessionIds.push(newConversation.guest_session_id);
    assert.deepEqual(newConversation.chat_context, {});
    assert.notEqual(newConversation.chat_context.selected_service_ids, conversation.chat_context.selected_service_ids);
  });

  test('asks for a service before continuing a booking and accepts a service on the next turn', async () => {
    const bookingConversation = await conversationRepository.create({
      guestSessionId: `context-test-service-first-${Date.now()}`,
    });
    testSessionIds.push(bookingConversation.guest_session_id);

    const firstReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingConversation.guest_session_id,
      userMessage: 'Tôi muốn đặt lịch',
    });
    assert.match(firstReply.content, /muốn đặt lịch sử dụng dịch vụ gì/u);
    assert.equal(
      (await conversationRepository.findById(bookingConversation.id)).chat_context.booking_intent_pending,
      true
    );

    const serviceReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingConversation.guest_session_id,
      userMessage: 'Uốn mái',
    });
    assert.match(serviceReply.content, /ngày nào và khoảng thời gian nào/u);
    const updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.booking_started, true);
    assert.equal(updated.chat_context.booking_intent_pending, false);
  });

  test('prioritizes service discovery over a requested date and time, then resumes with the saved time', async () => {
    const guestSessionId = `context-test-service-priority-${Date.now()}`;
    const bookingConversation = await conversationRepository.create({ guestSessionId });
    testSessionIds.push(guestSessionId);

    const timeFirstReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn đặt lịch lúc 09:15 ngày mai',
    });
    assert.match(timeFirstReply.content, /dịch vụ (?:nào|gì)/u);
    assert.doesNotMatch(timeFirstReply.content, /họ tên|số điện thoại/u);

    let updated = await conversationRepository.findById(bookingConversation.id);
    const requestedDate = updated.chat_context.appointment_date;
    assert.ok(requestedDate);
    assert.equal(updated.chat_context.appointment_time, '09:15');
    assert.equal(updated.chat_context.booking_intent_pending, true);

    const serviceQuestionReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Bạn biết tôi làm dịch vụ gì chưa?',
    });
    assert.match(serviceQuestionReply.content, /chưa nhận được thông tin về dịch vụ/u);
    assert.doesNotMatch(serviceQuestionReply.content, /họ tên|số điện thoại/u);

    const dyeReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn nhuộm tóc',
    });
    assert.match(dyeReply.content, /màu nào/u);
    assert.match(dyeReply.content, /độ dài tóc/u);
    assert.doesNotMatch(dyeReply.content, /họ tên|số điện thoại/u);

    const colorReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Nâu trà sữa',
    });
    assert.match(colorReply.content, /độ dài tóc/u);
    assert.doesNotMatch(colorReply.content, /họ tên|số điện thoại/u);

    const lengthReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tóc ngang vai',
    });
    assert.match(lengthReply.content, /09:15/u);
    assert.doesNotMatch(lengthReply.content, /họ tên|số điện thoại/u);

    updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.appointment_date, requestedDate);
    assert.equal(updated.chat_context.appointment_time, '09:15');
    assert.equal(updated.chat_context.hair_size, 'M');
    assert.equal(updated.chat_context.booking_started, true);
  });

  test('keeps asking for a service when date and time arrive in separate turns', async () => {
    const guestSessionId = `context-test-service-date-first-${Date.now()}`;
    const bookingConversation = await conversationRepository.create({ guestSessionId });
    testSessionIds.push(guestSessionId);

    const dateReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn đặt lịch ngày mai',
    });
    assert.match(dateReply.content, /dịch vụ (?:nào|gì)/u);

    const timeReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: '09:15 nhé',
    });
    assert.match(timeReply.content, /dịch vụ (?:nào|gì)/u);
    assert.doesNotMatch(timeReply.content, /họ tên|số điện thoại/u);

    const updated = await conversationRepository.findById(bookingConversation.id);
    assert.ok(updated.chat_context.appointment_date);
    assert.equal(updated.chat_context.appointment_time, '09:15');
    assert.equal(updated.chat_context.booking_intent_pending, true);
  });

  test('handles new service requests before asking for missing booking contact details', async () => {
    const guestSessionId = `context-test-service-before-contact-${Date.now()}`;
    const bookingConversation = await conversationRepository.create({ guestSessionId });
    testSessionIds.push(guestSessionId);
    const services = (await productRepository.findAll({
      status: 'active',
      page: 1,
      limit: 1000,
    })).rows;
    const haircutService = services.find(service =>
      service.category_name === 'Cắt tóc' && /cắt tạo kiểu/iu.test(service.name)
    );
    assert.ok(haircutService);
    const appointmentDate = '2026-11-02';
    const availableSlots = await appointmentService.checkAvailableSlots(
      appointmentDate,
      haircutService.duration
    );
    assert.ok(availableSlots.slots.length);
    const appointmentTime = availableSlots.slots[0];
    await conversationRepository.updateChatContext(bookingConversation.id, {
      selected_service_ids: [haircutService.id],
      booking_started: true,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
    });

    const broadRequest = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn làm tóc',
    });
    assert.match(broadRequest.content, /cắt, uốn, nhuộm hay phục hồi tóc/u);
    assert.doesNotMatch(broadRequest.content, /số điện thoại/u);
    let updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.appointment_date, appointmentDate);
    assert.equal(updated.chat_context.appointment_time, appointmentTime);
    assert.deepEqual(updated.chat_context.selected_service_ids, []);

    const bobRequest = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Cắt tóc bob',
    });
    assert.match(bobRequest.content, /ghi nhận nhu cầu cắt tóc bob/u);
    assert.match(bobRequest.content, new RegExp(`${appointmentTime} ngày ${appointmentDate}`));
    assert.match(bobRequest.content, /xác nhận tiếp tục đặt lịch/u);
    assert.doesNotMatch(bobRequest.content, /số điện thoại/u);

    updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.appointment_date, appointmentDate);
    assert.equal(updated.chat_context.appointment_time, appointmentTime);
    assert.equal(updated.chat_context.booking_service_confirmation_pending, true);

    const confirmedService = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Đúng rồi',
    });
    assert.match(confirmedService.content, new RegExp(`${appointmentTime} ngày ${appointmentDate}`));
    assert.match(confirmedService.content, /họ tên và số điện thoại/u);
  });

  test('extracts valid and invalid phones, saves valid names, and requests only missing information', async () => {
    const services = (await productRepository.findAll({
      status: 'active',
      page: 1,
      limit: 1000,
    })).rows;
    const haircutService = services.find(service =>
      service.category_name === 'Cắt tóc' && /cắt tạo kiểu/iu.test(service.name)
    );
    assert.ok(haircutService);
    const appointmentDate = '2027-05-20';
    const available = await appointmentService.checkAvailableSlots(
      appointmentDate,
      haircutService.duration
    );
    assert.ok(available.slots.length);
    const appointmentTime = available.slots[0];

    async function sendStoredTurn(conversationId, guestSessionId, content) {
      await messageRepository.create({
        conversationId,
        senderType: 'user',
        content,
      });
      const reply = await orchestrator.chat({
        conversationId,
        guestSessionId,
        userMessage: content,
      });
      await messageRepository.create({
        conversationId,
        senderType: 'assistant',
        content: reply.content,
      });
      return reply;
    }

    async function createContactConversation(label) {
      const guestSessionId = `context-test-contact-${label}-${Date.now()}-${Math.random()}`;
      const contactConversation = await conversationRepository.create({ guestSessionId });
      testSessionIds.push(guestSessionId);
      await conversationRepository.updateChatContext(contactConversation.id, {
        selected_service_ids: [haircutService.id],
        booking_started: true,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      });
      await messageRepository.create({
        conversationId: contactConversation.id,
        senderType: 'assistant',
        content: 'Anh/chị vui lòng cung cấp họ tên và số điện thoại để hoàn tất đặt lịch.',
      });
      return { guestSessionId, conversation: contactConversation };
    }

    const combined = await createContactConversation('combined');
    const combinedReply = await sendStoredTurn(
      combined.conversation.id,
      combined.guestSessionId,
      'Trần Quang Hải sdt 0973936280'
    );
    assert.match(combinedReply.content, /Trần Quang Hải/u);
    assert.match(combinedReply.content, /0973936280/u);
    assert.match(combinedReply.content, /xác nhận/u);
    assert.doesNotMatch(combinedReply.content, /vui lòng cung cấp.*số điện thoại/u);
    let updated = await conversationRepository.findById(combined.conversation.id);
    assert.equal(updated.customer_name, 'Trần Quang Hải');
    assert.equal(updated.customer_phone, '0973936280');

    const nameOnly = await createContactConversation('name-only');
    const nameReply = await sendStoredTurn(
      nameOnly.conversation.id,
      nameOnly.guestSessionId,
      'Trần Quang Hải'
    );
    assert.match(nameReply.content, /số điện thoại/u);
    assert.doesNotMatch(nameReply.content, /họ tên/u);
    updated = await conversationRepository.findById(nameOnly.conversation.id);
    assert.equal(updated.customer_name, 'Trần Quang Hải');

    const phoneOnly = await createContactConversation('phone-only');
    const phoneReply = await sendStoredTurn(
      phoneOnly.conversation.id,
      phoneOnly.guestSessionId,
      '0973936280'
    );
    assert.match(phoneReply.content, /họ tên/u);
    assert.doesNotMatch(phoneReply.content, /số điện thoại/u);
    updated = await conversationRepository.findById(phoneOnly.conversation.id);
    assert.equal(updated.customer_phone, '0973936280');

    const invalid = await createContactConversation('invalid');
    const invalidReply = await sendStoredTurn(
      invalid.conversation.id,
      invalid.guestSessionId,
      'Trần Quang Hải sdt 097393628'
    );
    assert.match(invalidReply.content, /chưa hợp lệ/u);
    assert.match(invalidReply.content, /9 chữ số/u);
    assert.match(invalidReply.content, /đủ 10 chữ số/u);
    assert.doesNotMatch(invalidReply.content, /vui lòng cung cấp.*số điện thoại/u);
    updated = await conversationRepository.findById(invalid.conversation.id);
    assert.equal(updated.customer_name, 'Trần Quang Hải');
    assert.equal(updated.customer_phone, null);

    const correctedReply = await sendStoredTurn(
      invalid.conversation.id,
      invalid.guestSessionId,
      'Số điện thoại 0973936280'
    );
    assert.match(correctedReply.content, /0973936280/u);
    assert.match(correctedReply.content, /xác nhận/u);
    updated = await conversationRepository.findById(invalid.conversation.id);
    assert.equal(updated.customer_phone, '0973936280');

    const activeHold = await createContactConversation('active-hold');
    const hold = await appointmentService.holdSlot({
      conversationId: activeHold.conversation.id,
      guestSessionId: activeHold.guestSessionId,
      appointmentDate,
      appointmentTime,
      durationMinutes: haircutService.duration,
      productId: haircutService.id,
    });
    assert.ok(hold.holding_token);
    const invalidHeldPhone = await sendStoredTurn(
      activeHold.conversation.id,
      activeHold.guestSessionId,
      'Số điện thoại 092739722'
    );
    assert.match(invalidHeldPhone.content, /chưa hợp lệ/u);
    assert.match(invalidHeldPhone.content, /9 chữ số/u);
    assert.doesNotMatch(invalidHeldPhone.content, /vui lòng cung cấp.*số điện thoại/u);
  });

  test('changes the selected service without losing the requested date and time', async () => {
    const guestSessionId = `context-test-change-service-${Date.now()}`;
    const bookingConversation = await conversationRepository.create({ guestSessionId });
    testSessionIds.push(guestSessionId);
    const services = (await productRepository.findAll({
      status: 'active',
      page: 1,
      limit: 1000,
    })).rows;
    const oldService = services.find(service =>
      service.category_name === 'Cắt tóc' && /cắt tạo kiểu/iu.test(service.name)
    );
    assert.ok(oldService);
    const newService = services.find(service =>
      service.category_name === 'Uốn tóc' && /uốn \(sản phẩm art\)/iu.test(service.name)
    );
    assert.ok(newService);
    const appointmentDate = '2027-05-20';
    const [oldServiceSlots, newServiceSlots] = await Promise.all([
      appointmentService.checkAvailableSlots(appointmentDate, oldService.duration),
      appointmentService.checkAvailableSlots(appointmentDate, newService.duration),
    ]);
    const appointmentTime = oldServiceSlots.slots.find(time =>
      newServiceSlots.slots.includes(time)
    );
    assert.ok(appointmentTime);
    const hold = await appointmentService.holdSlot({
      conversationId: bookingConversation.id,
      guestSessionId,
      appointmentDate,
      appointmentTime,
      durationMinutes: oldService.duration,
      productId: oldService.id,
    });
    assert.ok(hold.holding_token);
    await conversationRepository.updateChatContext(bookingConversation.id, {
      selected_service_ids: [oldService.id],
      booking_started: true,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      booking_service_notes: 'Cắt tóc bob',
    });

    const changeReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn đổi dịch vụ',
    });
    assert.match(changeReply.content, /đổi sang dịch vụ nào/u);
    assert.doesNotMatch(changeReply.content, /số điện thoại/u);
    let updated = await conversationRepository.findById(bookingConversation.id);
    assert.deepEqual(updated.chat_context.selected_service_ids, []);
    assert.equal(updated.chat_context.appointment_date, appointmentDate);
    assert.equal(updated.chat_context.appointment_time, appointmentTime);
    assert.equal(await appointmentRepository.findActiveHoldByConversation(bookingConversation.id), null);

    const broadPermReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn uốn tóc',
    });
    assert.match(broadPermReply.content, /uốn kiểu nào/u);
    assert.match(broadPermReply.content, /tóc hiện tại dài/u);
    assert.doesNotMatch(broadPermReply.content, /số điện thoại/u);

    const detailedPermReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Uốn xoăn sóng, tóc ngang vai',
    });
    assert.match(detailedPermReply.content, /Uốn \(sản phẩm ART\)/u);
    assert.match(detailedPermReply.content, new RegExp(`${appointmentTime} ngày ${appointmentDate}`));
    assert.match(detailedPermReply.content, /xác nhận tiếp tục đặt lịch/u);
    assert.doesNotMatch(detailedPermReply.content, /số điện thoại/u);

    updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.appointment_date, appointmentDate);
    assert.equal(updated.chat_context.appointment_time, appointmentTime);
    assert.equal(updated.chat_context.selected_service_ids.length, 1);
    assert.notEqual(updated.chat_context.selected_service_ids[0], oldService.id);
    assert.match(updated.chat_context.booking_service_notes, /Uốn xoăn sóng/u);

    const confirmedService = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId,
      userMessage: 'Đúng rồi',
    });
    assert.match(
      confirmedService.content,
      new RegExp(`khung giờ ${appointmentTime} ngày ${appointmentDate} hiện còn trống`)
    );
    assert.match(confirmedService.content, /họ tên và số điện thoại/u);

    const directGuestSessionId = `context-test-direct-service-change-${Date.now()}`;
    const directConversation = await conversationRepository.create({
      guestSessionId: directGuestSessionId,
    });
    testSessionIds.push(directGuestSessionId);
    await conversationRepository.updateChatContext(directConversation.id, {
      selected_service_ids: [oldService.id],
      booking_started: true,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
    });
    const directChange = await orchestrator.chat({
      conversationId: directConversation.id,
      guestSessionId: directGuestSessionId,
      userMessage: 'Tôi muốn đổi dịch vụ sang uốn tóc',
    });
    assert.match(directChange.content, /uốn kiểu nào/u);
    assert.match(directChange.content, /tóc hiện tại dài/u);
    assert.doesNotMatch(directChange.content, /số điện thoại/u);
    updated = await conversationRepository.findById(directConversation.id);
    assert.deepEqual(updated.chat_context.selected_service_ids, []);
    assert.equal(updated.chat_context.appointment_date, appointmentDate);
    assert.equal(updated.chat_context.appointment_time, appointmentTime);
    assert.equal(updated.chat_context.booking_requested_category, 'Uốn tóc');
  });

  test('responds to a bob consultation request without entering contact collection', async () => {
    const guestSessionId = `context-test-bob-consult-${Date.now()}`;
    const consultConversation = await conversationRepository.create({ guestSessionId });
    testSessionIds.push(guestSessionId);

    const broadReply = await orchestrator.chat({
      conversationId: consultConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn làm tóc',
    });
    assert.match(broadReply.content, /cắt, uốn, nhuộm hay phục hồi tóc/u);

    const reply = await orchestrator.chat({
      conversationId: consultConversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn tư vấn kiểu tóc bob',
    });
    assert.match(reply.content, /bob ngắn hay bob ngang vai/u);
    assert.doesNotMatch(reply.content, /số điện thoại/u);

    const haircutReply = await orchestrator.chat({
      conversationId: consultConversation.id,
      guestSessionId,
      userMessage: 'Cắt tóc bob',
    });
    assert.match(haircutReply.content, /kiểu tóc bob/u);
    assert.match(haircutReply.content, /tư vấn.*hay muốn đặt lịch/u);

    const appointmentSessionId = `context-test-bob-appointment-${Date.now()}`;
    const appointmentConversation = await conversationRepository.create({
      guestSessionId: appointmentSessionId,
    });
    testSessionIds.push(appointmentSessionId);
    const appointmentReply = await orchestrator.chat({
      conversationId: appointmentConversation.id,
      guestSessionId: appointmentSessionId,
      userMessage: 'Tôi muốn đặt lịch cắt tóc bob',
    });
    assert.match(appointmentReply.content, /ngày nào và khoảng thời gian nào/u);
    assert.doesNotMatch(appointmentReply.content, /số điện thoại/u);

    const bookingSessionId = `context-test-bob-booking-${Date.now()}`;
    const bookingConversation = await conversationRepository.create({ guestSessionId: bookingSessionId });
    testSessionIds.push(bookingSessionId);
    await conversationRepository.updateChatContext(bookingConversation.id, {
      booking_intent_pending: true,
      appointment_date: '2026-11-02',
      appointment_time: '09:15',
    });

    const bookingConsultReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingSessionId,
      userMessage: 'Tôi muốn tư vấn kiểu tóc bob',
    });
    assert.match(bookingConsultReply.content, /bob ngắn hay bob ngang vai/u);
    assert.doesNotMatch(bookingConsultReply.content, /số điện thoại/u);

    const styleDetailReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingSessionId,
      userMessage: 'Bob ngang vai',
    });
    assert.match(styleDetailReply.content, /09:15 ngày 2026-11-02/u);
    assert.match(styleDetailReply.content, /xác nhận tiếp tục đặt lịch cắt tóc bob/u);
    assert.doesNotMatch(styleDetailReply.content, /số điện thoại/u);
  });

  test('clarifies a broad coloring request, then continues with the selected color service', async () => {
    const bookingConversation = await conversationRepository.create({
      guestSessionId: `context-test-coloring-${Date.now()}`,
    });
    testSessionIds.push(bookingConversation.guest_session_id);

    await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingConversation.guest_session_id,
      userMessage: 'Tôi muốn đặt lịch',
    });
    const serviceReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingConversation.guest_session_id,
      userMessage: 'Tôi muốn nhuộm tóc',
    });
    assert.match(serviceReply.content, /màu nào/u);
    assert.match(serviceReply.content, /độ dài tóc/u);

    const detailsReply = await orchestrator.chat({
      conversationId: bookingConversation.id,
      guestSessionId: bookingConversation.guest_session_id,
      userMessage: 'Nhuộm màu nâu trà sữa, tóc ngang vai',
    });
    assert.match(detailsReply.content, /ngày nào và khoảng thời gian nào/u);
    const updated = await conversationRepository.findById(bookingConversation.id);
    assert.equal(updated.chat_context.booking_started, true);
    assert.equal(updated.chat_context.selected_service_ids.length, 1);
    assert.equal(updated.chat_context.hair_size, 'M');
  });

  test('recognizes unlabeled name and phone in one message without treating schedule replies as names', () => {
    for (const content of [
      'Nguyễn Văn A 0927392930',
      'Nguyễn Văn A - 0927392930',
      'Tên: Nguyễn Văn A, SĐT: 0927392930',
    ]) {
      const contact = orchestrator.extractBookingContact([
        { sender_type: 'assistant', content: 'Vui lòng cung cấp họ tên và số điện thoại.' },
        { sender_type: 'user', content },
      ], null);
      assert.equal(contact.customer_name, 'Nguyễn Văn A', content);
      assert.equal(contact.customer_phone, '0927392930', content);
    }

    const nameOnly = orchestrator.extractBookingContact([
      { sender_type: 'assistant', content: 'Mình cho em xin họ tên và số điện thoại nhé.' },
      { sender_type: 'user', content: 'Nguyễn Văn A' },
    ], null);
    assert.equal(nameOnly.customer_name, 'Nguyễn Văn A');
    assert.equal(nameOnly.customer_phone, '');

    const dateReply = orchestrator.extractBookingContact([
      { sender_type: 'assistant', content: 'Anh/chị muốn đặt vào ngày nào ạ?' },
      { sender_type: 'user', content: 'Mai làm' },
    ], null);
    assert.equal(dateReply.customer_name, '');
  });

  test('recovers from an invalid time and accepts a valid time with a morning qualifier', async () => {
    const outOfHoursReply = await orchestrator.chat({
      conversationId: conversation.id,
      userMessage: '07:00',
    });
    assert.match(outOfHoursReply.content, /chưa thể nhận lịch lúc 07:00/u);
    assert.equal(conversation.chat_context.selected_service_ids.length, 1);

    await processTurn('10 giờ sáng');
    assert.equal(conversation.chat_context.appointment_time, '10:00');
    assert.equal(conversation.chat_context.invalid_appointment_time, false);
    assert.equal(conversation.chat_context.booking_started, true);
  });

  test('supports date-first booking and preserves state for unclear replies and repeat price questions', async () => {
    const serviceId = conversation.chat_context.selected_service_ids[0];
    const size = conversation.chat_context.hair_size;
    let dateFirstConversation = await conversationRepository.create({
      guestSessionId: `context-test-date-first-${Date.now()}`,
    });
    testSessionIds.push(dateFirstConversation.guest_session_id);
    dateFirstConversation = await conversationRepository.updateChatContext(dateFirstConversation.id, {
      selected_service_ids: [serviceId],
      hair_size: size,
      pricing_inquiry_active: false,
    });

    dateFirstConversation = await processConversationTurn(dateFirstConversation, 'Tôi muốn đặt lịch ngày mai');
    const date = dateFirstConversation.chat_context.appointment_date;
    assert.ok(date);

    dateFirstConversation = await processConversationTurn(dateFirstConversation, '10 giờ sáng');
    assert.equal(dateFirstConversation.chat_context.appointment_time, '10:00');
    assert.equal(dateFirstConversation.chat_context.appointment_date, date);
    assert.equal(dateFirstConversation.chat_context.selected_service_ids[0], serviceId);
    assert.equal(dateFirstConversation.chat_context.hair_size, size);

    const repeatPrice = await servicePricing.resolvePriceInquiry({
      userMessage: 'Giá Phồng chân bao nhiêu?',
      conversation: dateFirstConversation,
    });
    assert.match(repeatPrice.content, /200\.000 VNĐ/u);

    dateFirstConversation = await processConversationTurn(dateFirstConversation, 'Hmm, tôi chưa rõ');
    assert.equal(dateFirstConversation.chat_context.selected_service_ids[0], serviceId);
    assert.equal(dateFirstConversation.chat_context.hair_size, size);
    assert.equal(dateFirstConversation.chat_context.appointment_date, date);
  });
});
