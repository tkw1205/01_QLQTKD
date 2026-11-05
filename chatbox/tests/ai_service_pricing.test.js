'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const productRepository = require('../src/repositories/productRepository');
const servicePricing = require('../src/ai/servicePricing');

async function getActiveServices() {
  return (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;
}

describe('Deterministic salon service pricing', () => {
  test('answers every configured service and size from the JSON catalog', async () => {
    const services = await getActiveServices();
    assert.ok(services.length > 0);

    for (const service of services) {
      const tiers = Object.entries(service.prices_by_size || {});
      if (tiers.length === 0) {
        const result = await servicePricing.resolvePriceInquiry({
          userMessage: `Giá ${service.name}`,
        });
        assert.equal(result.handled, true, `${service.name} without size prices is handled`);
        assert.match(result.content, /chưa có giá theo size/u);
        assert.doesNotMatch(result.content, /trọn gói/u);
        continue;
      }

      for (const [size, tier] of tiers) {
        const result = await servicePricing.resolvePriceInquiry({
          userMessage: `Giá ${service.name} size ${size}`,
        });
        assert.equal(result.handled, true, `${service.name} size ${size} is handled`);
        assert.ok(
          result.content.includes(new Intl.NumberFormat('vi-VN').format(tier.price)),
          `${service.name} size ${size} uses its catalog price`
        );
        if (tier.duration ?? service.duration) {
          assert.ok(result.content.includes(`${tier.duration ?? service.duration} phút`));
        }
        if (tier.staff_count ?? service.staff_count) {
          assert.ok(result.content.includes(`${tier.staff_count ?? service.staff_count} nhân viên`));
        }
      }
    }
  });

  test('asks for size before quoting and resolves a size supplied on the next turn', async () => {
    const first = await servicePricing.resolvePriceInquiry({
      userMessage: 'Dịch vụ cắt tạo kiểu giá bao nhiêu?',
    });
    assert.match(first.content, /size S, M hay L/u);

    const followUp = await servicePricing.resolvePriceInquiry({
      userMessage: 'Tóc dài ngang vai',
      history: [
        { sender_type: 'user', content: 'Dịch vụ cắt tạo kiểu giá bao nhiêu?' },
        { sender_type: 'assistant', content: first.content },
      ],
    });
    assert.match(followUp.content, /150\.000 VNĐ/u);
    assert.match(followUp.content, /size M/u);
  });

  test('maps explicit sizes and hair lengths, while clarifying unresolved boundaries', () => {
    assert.deepEqual(servicePricing.parseHairSize('M'), { size: 'M' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc dài ngang vai'), { size: 'M' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc ngắn trên cằm'), { size: 'S' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc dài ngang ngực'), { size: 'L' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc dài đến ngực'), { size: 'L' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc dài qua ngực'), { size: 'L' });
    assert.deepEqual(servicePricing.parseHairSize('Tóc tôi dài tới ngang hông'), { size: 'L' });
    assert.deepEqual(servicePricing.parseHairSize('Hơn ngực'), { size: 'L' });
    for (const phrase of [
      'Tóc ngang lưng',
      'Tóc dài tới lưng',
      'Tóc qua vai đến lưng',
      'Tóc dài gần thắt lưng',
    ]) {
      assert.deepEqual(servicePricing.parseHairSize(phrase), { size: 'L' }, phrase);
    }
    assert.deepEqual(servicePricing.parseHairSize('Tóc ngang cằm'), { size: 'S' });
    assert.equal(servicePricing.parseHairSize('Tóc qua cằm').ambiguous, true);
    assert.equal(servicePricing.parseHairSize('Tóc qua vai nhưng chưa đến ngực').ambiguous, true);
    assert.equal(servicePricing.parseHairSize('Tóc chưa tới ngang lưng').ambiguous, true);
    assert.equal(servicePricing.parseHairSize('Tóc tôi cũng khá dài').ambiguous, true);
  });

  test('quotes the catalog L tier after a customer describes hair reaching the back', async () => {
    const first = await servicePricing.resolvePriceInquiry({
      userMessage: 'Giá Uốn mái / phồng mái bao nhiêu?',
    });
    const followUp = await servicePricing.resolvePriceInquiry({
      userMessage: 'Tóc tôi ngang lưng',
      history: [
        { sender_type: 'user', content: 'Giá Uốn mái / phồng mái bao nhiêu?' },
        { sender_type: 'assistant', content: first.content },
      ],
    });

    assert.match(first.content, /độ dài tóc/u);
    assert.match(followUp.content, /120\.000 VNĐ/u);
    assert.match(followUp.content, /size L/u);
    assert.match(followUp.content, /60 phút/u);
  });

  test('keeps “uốn phồng” ambiguous between matching catalog services', async () => {
    const result = await servicePricing.resolveServiceInquiry({
      userMessage: 'Uốn phồng',
    });
    assert.equal(result.handled, true);
    assert.match(result.content, /Uốn mái \/ phồng mái/u);
    assert.match(result.content, /Phồng chân/u);
    assert.doesNotMatch(result.content, /Uốn \(sản phẩm ART\)/u);
  });

  test('recognizes short service names and equivalent intent phrases from active catalog data', async () => {
    const cases = [
      { input: 'Uốn tóc', expected: ['Uốn mái / phồng mái', 'Phồng chân', 'Uốn (sản phẩm ART)'] },
      { input: 'Có làm uốn không?', expected: ['Uốn mái / phồng mái', 'Phồng chân', 'Uốn (sản phẩm ART)'] },
      { input: 'Cắt tóc', expected: ['Cắt tạo kiểu'] },
      { input: 'Nhuộm tóc', expected: ['Nhuộm (sản phẩm ART)', 'Chấm chân'] },
      { input: 'Tôi muốn làm tóc xoăn', expected: ['Uốn mái / phồng mái', 'Phồng chân', 'Uốn (sản phẩm ART)'] },
      { input: 'Làm tóc cho phồng lên', expected: ['Uốn mái / phồng mái', 'Phồng chân'] },
      { input: 'Làm phồng chân tóc', expected: ['Phồng chân'] },
      { input: 'Uốn phồng', expected: ['Uốn mái / phồng mái', 'Phồng chân'] },
      { input: 'Gội đầu', expected: ['Gội đầu'] },
      { input: 'Duỗi tóc', expected: ['Duỗi mái', 'Duỗi gốc', 'Duỗi (sản phẩm ART)'] },
      { input: 'Phục hồi tóc', expected: ['Hấp dầu', 'Phục hồi theo tóc', 'Phục hồi Biotin', 'Phục hồi chuyên sâu'] },
    ];

    for (const { input, expected } of cases) {
      const result = await servicePricing.resolveServiceInquiry({ userMessage: input });
      assert.equal(result?.handled, true, input);
      for (const name of expected) assert.ok(result.content.includes(name), `${input} includes ${name}`);
    }

    const catalogNames = new Set((await getActiveServices()).map(service => service.name));
    for (const { expected } of cases) {
      for (const name of expected) assert.ok(catalogNames.has(name), `${name} exists in active catalog`);
    }

    for (const input of ['Uốn tóc', 'Tôi muốn làm tóc xoăn', 'Nhuộm tóc']) {
      const bookingResult = await servicePricing.resolveServiceInquiry({
        userMessage: input,
        conversation: { chat_context: { booking_intent_pending: true } },
      });
      assert.equal(bookingResult?.handled, true, `${input} is recognized during booking`);
      assert.ok(bookingResult.content.includes('Uốn mái / phồng mái') ||
        bookingResult.content.includes('Nhuộm (sản phẩm ART)'));
    }
  });

  test('repeats service choices before handing off an unresolved service selection', async () => {
    const history = [
      { sender_type: 'user', content: 'Uốn tóc' },
      { sender_type: 'assistant', content: 'Nhóm Uốn tóc hiện có các dịch vụ. Mình muốn tìm hiểu dịch vụ nào ạ?' },
      { sender_type: 'user', content: 'Uốn phồng' },
      { sender_type: 'assistant', content: 'Mình muốn tìm hiểu dịch vụ nào ạ?' },
      { sender_type: 'user', content: 'Tóc ngang lưng' },
    ];
    const first = await servicePricing.resolveServiceInquiry({
      userMessage: 'Tóc ngang lưng',
      history,
      conversation: {
        chat_context: {
          service_selection_clarification_attempts: 1,
        },
      },
    });
    assert.match(first.content, /Uốn mái \/ phồng mái/u);
    assert.match(first.content, /Phồng chân/u);

    const repeated = await servicePricing.resolveServiceInquiry({
      userMessage: 'Tóc ngang lưng',
      history,
      conversation: {
        chat_context: {
          service_selection_clarification_attempts: 2,
        },
      },
    });
    assert.equal(repeated.handoffRequired, true);
    assert.equal(repeated.handoffReason, 'service_selection_unresolved');
  });

  test('counts failed hair-size clarifications and resets after a recognized size', async t => {
    const conversationRepository = require('../src/repositories/conversationRepository');
    const productRepository = require('../src/repositories/productRepository');
    const conversationContext = require('../src/ai/conversationContext');
    const originals = {
      updateChatContext: conversationRepository.updateChatContext,
      findAll: productRepository.findAll,
    };
    let chatContext = { pricing_inquiry_active: true };

    t.after(() => {
      conversationRepository.updateChatContext = originals.updateChatContext;
      productRepository.findAll = originals.findAll;
    });

    conversationRepository.updateChatContext = async (id, patch) => {
      chatContext = { ...chatContext, ...patch };
      return { id, chat_context: chatContext };
    };
    const services = await getActiveServices();
    productRepository.findAll = async () => ({ rows: services });

    let conversation = { id: 'size-clarification-test', chat_context: chatContext };
    const first = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Tóc tôi cũng khá dài',
      [{ sender_type: 'assistant', content: 'Mình cho em biết tóc dài đến đâu (size S, M hay L) ạ?' }]
    );
    assert.equal(first.chat_context.hair_size, null);
    assert.equal(first.chat_context.hair_size_clarification_attempts, 1);

    conversation = { ...conversation, chat_context: first.chat_context };
    const second = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Tóc cũng khá dài',
      [{ sender_type: 'assistant', content: 'Mình cho em biết size S, M, L hoặc mô tả tóc dài đến đâu nhé?' }]
    );
    assert.equal(second.chat_context.hair_size_clarification_attempts, 2);

    conversation = { ...conversation, chat_context: second.chat_context };
    const recognized = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Tóc ngang lưng',
      [{ sender_type: 'assistant', content: 'Mình mô tả tóc dài đến đâu ạ?' }]
    );
    assert.equal(recognized.chat_context.hair_size, 'L');
    assert.equal(recognized.chat_context.hair_size_clarification_attempts, 0);

    conversation = { ...conversation, chat_context: {} };
    chatContext = {};
    const ambiguousService = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Uốn phồng',
      [{ sender_type: 'assistant', content: 'Nhóm Uốn tóc hiện có các dịch vụ. Mình muốn tìm hiểu dịch vụ nào ạ?' }]
    );
    assert.equal(ambiguousService.chat_context.service_selection_clarification_attempts, 1);

    conversation = { ...conversation, chat_context: ambiguousService.chat_context };
    const unresolvedService = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Tóc ngang lưng',
      [{ sender_type: 'assistant', content: 'Mình muốn tìm hiểu dịch vụ nào ạ?' }]
    );
    assert.equal(unresolvedService.chat_context.service_selection_clarification_attempts, 2);

    conversation = { ...conversation, chat_context: unresolvedService.chat_context };
    const selectedService = await conversationContext.updateConversationContext(
      conversation.id,
      conversation,
      'Phồng chân',
      [{ sender_type: 'assistant', content: 'Mình muốn chọn dịch vụ nào ạ?' }]
    );
    assert.equal(selectedService.chat_context.service_selection_clarification_attempts, 0);
  });

  test('stores current service intent, preserves it for price and length replies, and replaces it on service change', async t => {
    const conversationRepository = require('../src/repositories/conversationRepository');
    const conversationContext = require('../src/ai/conversationContext');
    const originalUpdate = conversationRepository.updateChatContext;
    const services = await getActiveServices();
    const permService = services.find(service => service.name === 'Uốn mái / phồng mái');
    const haircutService = services.find(service => service.name === 'Cắt tạo kiểu');
    let chatContext = {};

    t.after(() => {
      conversationRepository.updateChatContext = originalUpdate;
    });
    conversationRepository.updateChatContext = async (id, patch) => {
      chatContext = { ...chatContext, ...patch };
      return { id, chat_context: { ...chatContext } };
    };

    const update = async (message, history = []) => {
      const result = await conversationContext.updateConversationContext(
        'service-intent-state-test',
        { id: 'service-intent-state-test', chat_context: { ...chatContext } },
        message,
        history
      );
      chatContext = result.chat_context;
      return chatContext;
    };

    let state = await update('Uốn tóc');
    assert.equal(state.service_interest_category, 'Uốn tóc');
    assert.deepEqual(state.selected_service_ids, []);

    state = await update('Uốn mái');
    assert.deepEqual(state.selected_service_ids, [permService.id]);
    assert.equal(state.service_interest_category, 'Uốn tóc');
    await update('Giá bao nhiêu?');
    assert.deepEqual(chatContext.selected_service_ids, [permService.id]);
    assert.equal(chatContext.pricing_inquiry_active, true);

    const firstPrice = await servicePricing.resolvePriceInquiry({
      userMessage: 'Giá bao nhiêu?',
      conversation: { chat_context: chatContext },
      history: [
        { sender_type: 'user', content: 'Giá Uốn mái bao nhiêu?' },
        { sender_type: 'assistant', content: 'Dạ, giá dịch vụ Uốn mái phụ thuộc độ dài tóc. Mình cho em biết tóc dài đến đâu ạ?' },
      ],
    });
    assert.match(firstPrice.content, /độ dài tóc/u);

    state = await update('Tóc ngang lưng', [
      { sender_type: 'user', content: 'Giá bao nhiêu?' },
      { sender_type: 'assistant', content: firstPrice.content },
    ]);
    assert.equal(state.hair_size, 'L');
    const finalPrice = await servicePricing.resolvePriceInquiry({
      userMessage: 'Tóc ngang lưng',
      history: [
        { sender_type: 'user', content: 'Giá Uốn mái bao nhiêu?' },
        { sender_type: 'assistant', content: firstPrice.content },
      ],
      conversation: { chat_context: state },
    });
    assert.match(finalPrice.content, /120\.000 VNĐ/u);
    assert.match(finalPrice.content, /size L/u);

    state = await update('Cắt tóc');
    assert.deepEqual(state.selected_service_ids, [haircutService.id]);
    assert.equal(state.service_interest_category, 'Cắt tóc');

    chatContext = {
      ...chatContext,
      booking_started: true,
      booking_service_confirmed: true,
      appointment_date: '2027-05-20',
      appointment_time: '18:00',
    };
    state = await update('Tôi muốn đổi dịch vụ sang uốn tóc');
    assert.deepEqual(state.selected_service_ids, []);
    assert.equal(state.booking_service_confirmed, false);
    assert.equal(state.booking_requested_category, 'Uốn tóc');
    state = await update('Uốn (sản phẩm ART)');
    assert.deepEqual(state.selected_service_ids, [services.find(service => service.name === 'Uốn (sản phẩm ART)').id]);
    assert.equal(state.booking_service_confirmed, true);
    assert.equal(state.booking_requested_category, null);
    assert.equal(state.appointment_date, '2027-05-20');
    assert.equal(state.appointment_time, '18:00');
    state = await update('Uốn phồng');
    assert.deepEqual(state.selected_service_ids, []);
    assert.equal(state.booking_requested_category, 'Uốn tóc');
  });

  test('asks about unspecified hair-length boundaries instead of assigning a size', () => {
    for (const phrase of ['Tóc qua cằm', 'Tóc khá dài', 'Tóc qua vai nhưng chưa đến ngực']) {
      assert.equal(servicePricing.parseHairSize(phrase)?.size, undefined, phrase);
    }
  });

  test('flags unresolved size and missing catalog tiers for handoff after clarification', async () => {
    const services = await getActiveServices();
    const service = services.find(item => item.name === 'Uốn mái / phồng mái');
    const unresolved = await servicePricing.resolvePriceInquiry({
      userMessage: 'Tóc tôi cũng khá dài',
      conversation: {
        chat_context: {
          pricing_inquiry_active: true,
          hair_size_clarification_attempts: 2,
          selected_service_ids: [service.id],
        },
      },
    });
    assert.equal(unresolved.handoffRequired, true);
    assert.equal(unresolved.handoffReason, 'hair_size_unresolved');

    const originalFindAll = productRepository.findAll;
    try {
      productRepository.findAll = async () => ({
        rows: [{
          ...service,
          prices_by_size: {
            ...service.prices_by_size,
            L: undefined,
          },
        }],
      });
      const missingTier = await servicePricing.resolvePriceInquiry({
        userMessage: 'Giá Uốn mái / phồng mái size L bao nhiêu?',
      });
      assert.equal(missingTier.handoffRequired, true);
      assert.equal(missingTier.handoffReason, 'selected_size_data_missing');
    } finally {
      productRepository.findAll = originalFindAll;
    }
  });

  test('orchestrator requests handoff and reports handoff failures truthfully', async t => {
    const conversationRepository = require('../src/repositories/conversationRepository');
    const messageRepository = require('../src/repositories/messageRepository');
    const appointmentRepository = require('../src/repositories/appointmentRepository');
    const conversationContext = require('../src/ai/conversationContext');
    const conversationService = require('../src/services/conversationService');
    const orchestrator = require('../src/ai/orchestrator');
    const originals = {
      findById: conversationRepository.findById,
      updateContext: conversationContext.updateConversationContext,
      findForAI: messageRepository.findForAI,
      findActiveHoldByConversation: appointmentRepository.findActiveHoldByConversation,
      resolvePriceInquiry: servicePricing.resolvePriceInquiry,
      requestAgentSwitch: conversationService.requestAgentSwitch,
    };

    t.after(() => {
      conversationRepository.findById = originals.findById;
      conversationContext.updateConversationContext = originals.updateContext;
      messageRepository.findForAI = originals.findForAI;
      appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldByConversation;
      servicePricing.resolvePriceInquiry = originals.resolvePriceInquiry;
      conversationService.requestAgentSwitch = originals.requestAgentSwitch;
    });

    conversationRepository.findById = async () => ({
      id: 'test-handoff-conversation',
      mode: 'ai',
      chat_context: {
        pricing_inquiry_active: true,
        selected_service_ids: ['test-service'],
      },
    });
    conversationContext.updateConversationContext = async () => ({
      chat_context: {
        pricing_inquiry_active: true,
        selected_service_ids: ['test-service'],
        hair_size_clarification_attempts: 2,
      },
    });
    messageRepository.findForAI = async () => [];
    appointmentRepository.findActiveHoldByConversation = async () => null;
    servicePricing.resolvePriceInquiry = async () => ({
      handled: true,
      handoffRequired: true,
      handoffReason: 'hair_size_unresolved',
      serviceNames: ['Uốn mái / phồng mái'],
    });

    let handoffCalls = 0;
    conversationService.requestAgentSwitch = async () => {
      handoffCalls++;
      return { status: 'waiting' };
    };
    const io = { to: () => ({ emit() {} }) };
    const first = await orchestrator.chat({
      conversationId: 'test-handoff-conversation',
      guestSessionId: 'test-guest',
      userMessage: 'Tóc tôi cũng khá dài',
      io,
    });
    assert.equal(handoffCalls, 1);
    assert.equal(first.handoffAttempted, true);
    assert.equal(first.handoffStatus, 'waiting');
    assert.match(first.content, /kết nối mình với chuyên viên/u);
    assert.match(first.content, /Uốn mái \/ phồng mái/u);

    conversationService.requestAgentSwitch = async () => {
      throw Object.assign(new Error('queue unavailable'), { code: 'QUEUE_UNAVAILABLE' });
    };
    const failed = await orchestrator.chat({
      conversationId: 'test-handoff-conversation',
      guestSessionId: 'test-guest',
      userMessage: 'Tóc tôi cũng khá dài',
      io,
    });
    assert.equal(failed.handoffAttempted, true);
    assert.equal(failed.handoffStatus, 'failed');
    assert.match(failed.content, /chưa thể kết nối/u);
    assert.doesNotMatch(failed.content, /xin phép kết nối mình với chuyên viên/u);
  });

  test('clarifies ambiguous service names and does not invent an unlisted service price', async () => {
    const ambiguous = await servicePricing.resolvePriceInquiry({
      userMessage: 'Uốn tóc giá bao nhiêu?',
    });
    assert.match(ambiguous.content, /Mình muốn hỏi giá dịch vụ nào/u);
    assert.doesNotMatch(ambiguous.content, /\d[\d.]*\s*(?:VNĐ|đ)/u);

    const unsupported = await servicePricing.resolvePriceInquiry({
      userMessage: 'Uốn setting giá bao nhiêu?',
    });
    assert.match(unsupported.content, /chưa có dịch vụ đúng tên/u);
    assert.doesNotMatch(unsupported.content, /\d[\d.]*\s*(?:VNĐ|đ)/u);
  });

  test('labels per-tép prices and handles service-name clarification follow-ups', async () => {
    const perTap = await servicePricing.resolvePriceInquiry({
      userMessage: 'Giá nối light size M',
    });
    assert.match(perTap.content, /75\.000 VNĐ\/tép/u);

    const first = await servicePricing.resolvePriceInquiry({
      userMessage: 'Giá dịch vụ nào đang có?',
    });
    const followUp = await servicePricing.resolvePriceInquiry({
      userMessage: 'Uốn mái size M',
      history: [
        { sender_type: 'user', content: 'Giá dịch vụ nào đang có?' },
        { sender_type: 'assistant', content: first.content },
      ],
    });
    assert.ok(followUp.content.includes('100.000 VNĐ'));
  });

  test('quotes multiple explicitly named services using the same requested size', async () => {
    const result = await servicePricing.resolvePriceInquiry({
      userMessage: 'Gội đầu và tạo kiểu giá bao nhiêu size M?',
    });

    assert.match(result.content, /Gội đầu: 50\.000 VNĐ/u);
    assert.match(result.content, /Tạo kiểu: 100\.000 VNĐ/u);
  });

  test('leaves non-price booking requests to the existing booking flow', async () => {
    assert.equal(
      await servicePricing.resolvePriceInquiry({ userMessage: 'Đặt lịch ngày mai lúc 10 giờ' }),
      null
    );
  });

  test('orchestrator serves catalog prices before requiring an AI provider', async t => {
    const conversationRepository = require('../src/repositories/conversationRepository');
    const messageRepository = require('../src/repositories/messageRepository');
    const appointmentRepository = require('../src/repositories/appointmentRepository');
    const orchestrator = require('../src/ai/orchestrator');
    const originals = {
      findById: conversationRepository.findById,
      updateChatContext: conversationRepository.updateChatContext,
      findForAI: messageRepository.findForAI,
      findActiveHoldByConversation: appointmentRepository.findActiveHoldByConversation,
    };

    t.after(() => {
      conversationRepository.findById = originals.findById;
      conversationRepository.updateChatContext = originals.updateChatContext;
      messageRepository.findForAI = originals.findForAI;
      appointmentRepository.findActiveHoldByConversation = originals.findActiveHoldByConversation;
    });

    conversationRepository.findById = async () => ({ id: 'test-conversation', mode: 'ai' });
    conversationRepository.updateChatContext = async (id, context) => ({
      id,
      mode: 'ai',
      chat_context: context,
    });
    messageRepository.findForAI = async () => [];
    appointmentRepository.findActiveHoldByConversation = async () => null;

    const result = await orchestrator.chat({
      conversationId: 'test-conversation',
      userMessage: 'Giá cắt tạo kiểu size M',
    });

    assert.match(result.content, /150\.000 VNĐ/u);
  });

  test('orchestrator resolves the follow-up hair length and preserves the selected service', async t => {
    const conversationRepository = require('../src/repositories/conversationRepository');
    const messageRepository = require('../src/repositories/messageRepository');
    const appointmentRepository = require('../src/repositories/appointmentRepository');
    const orchestrator = require('../src/ai/orchestrator');
    const service = (await getActiveServices())
      .find(item => item.name === 'Uốn mái / phồng mái');
    const original = {
      findById: conversationRepository.findById,
      updateChatContext: conversationRepository.updateChatContext,
      findForAI: messageRepository.findForAI,
      findActiveHoldByConversation: appointmentRepository.findActiveHoldByConversation,
    };
    let chatContext = {
      pricing_inquiry_active: true,
      selected_service_ids: [service.id],
      selected_service_source: 'price_inquiry',
    };

    t.after(() => {
      conversationRepository.findById = original.findById;
      conversationRepository.updateChatContext = original.updateChatContext;
      messageRepository.findForAI = original.findForAI;
      appointmentRepository.findActiveHoldByConversation = original.findActiveHoldByConversation;
    });

    conversationRepository.findById = async () => ({
      id: 'hair-length-followup-test',
      mode: 'ai',
      chat_context: { ...chatContext },
    });
    conversationRepository.updateChatContext = async (id, patch) => {
      chatContext = { ...chatContext, ...patch };
      return { id, mode: 'ai', chat_context: { ...chatContext } };
    };
    messageRepository.findForAI = async () => [
      { sender_type: 'user', content: 'Giá Uốn mái / phồng mái bao nhiêu?' },
      { sender_type: 'assistant', content: 'Mình cho em biết tóc dài đến đâu (size S, M hay L) ạ?' },
      { sender_type: 'user', content: 'Tóc tôi ngang lưng' },
    ];
    appointmentRepository.findActiveHoldByConversation = async () => null;

    const result = await orchestrator.chat({
      conversationId: 'hair-length-followup-test',
      guestSessionId: 'test-guest',
      userMessage: 'Tóc tôi ngang lưng',
    });

    assert.match(result.content, /120\.000 VNĐ/u);
    assert.match(result.content, /size L/u);
    assert.match(result.content, /60 phút/u);
    assert.equal(chatContext.hair_size, 'L');
    assert.deepEqual(chatContext.selected_service_ids, [service.id]);
  });
});
