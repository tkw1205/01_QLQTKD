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
    assert.equal(services.length, 26);

    for (const service of services) {
      for (const size of ['S', 'M', 'L']) {
        const tier = service.prices_by_size[size];
        const result = await servicePricing.resolvePriceInquiry({
          userMessage: `Giá ${service.name} size ${size}`,
        });

        assert.equal(result.handled, true, `${service.name} size ${size} is handled`);
        assert.ok(
          result.content.includes(new Intl.NumberFormat('vi-VN').format(tier.price)),
          `${service.name} size ${size} uses its catalog price`
        );
        assert.ok(result.content.includes(`${tier.duration} phút`));
        assert.ok(result.content.includes(`${tier.staff_count} nhân viên`));
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
    assert.deepEqual(servicePricing.parseHairSize('Tóc tôi dài tới ngang hông'), { size: 'L' });
    assert.deepEqual(servicePricing.parseHairSize('Hơn ngực'), { size: 'L' });
    assert.equal(servicePricing.parseHairSize('Tóc ngang cằm').ambiguous, true);
    assert.equal(servicePricing.parseHairSize('Tóc qua vai nhưng chưa đến ngực').ambiguous, true);
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
    assert.match(unsupported.content, /chưa tìm thấy dịch vụ phù hợp trong danh mục/u);
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
});
