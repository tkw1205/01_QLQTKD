'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../src/ai/provider');
const orchestrator = require('../src/ai/orchestrator');
const conversationService = require('../src/services/conversationService');
const jsonStore = require('../src/config/jsonStore');

const guestSessionId = `guest-test-generic-haircut-${Date.now()}`;
let conversationId;
const originalIsConfigured = provider.isConfigured;
const originalChat = provider.chat;

before(async () => {
  const conversation = await conversationService.getOrCreate(guestSessionId);
  conversationId = conversation.id;
  provider.isConfigured = () => true;
});

after(() => {
  provider.isConfigured = originalIsConfigured;
  provider.chat = originalChat;

  const conversations = jsonStore.getCollection('conversations');
  jsonStore.saveCollection(
    'conversations',
    conversations.filter(conversation => conversation.id !== conversationId)
  );

  const messages = jsonStore.getCollection('messages');
  jsonStore.saveCollection(
    'messages',
    messages.filter(message => message.conversation_id !== conversationId)
  );
});

test('generic haircut consultation is handled by the LLM', async () => {
  let providerCalls = 0;
  provider.chat = async () => {
    providerCalls++;
    return {
      choices: [{ message: { role: 'assistant', content: 'Provider consultation response' } }],
    };
  };

  const result = await orchestrator.chat({
    conversationId,
    guestSessionId,
    userMessage: 'Tôi muốn cắt tóc',
  });

  assert.equal(result.aiConfigured, true);
  assert.equal(result.content, 'Provider consultation response');
  assert.equal(providerCalls, 1);
});

test('generic request wording and polite suffixes use the LLM', async () => {
  let providerCalls = 0;
  provider.chat = async () => {
    providerCalls++;
    return {
      choices: [{ message: { role: 'assistant', content: 'Provider consultation response' } }],
    };
  };

  for (const userMessage of ['Mình muốn cắt tóc ạ.', 'Em cần đi cắt tóc nhé']) {
    const result = await orchestrator.chat({
      conversationId,
      guestSessionId,
      userMessage,
    });

    assert.equal(result.content, 'Provider consultation response');
  }

  assert.equal(providerCalls, 2);
});

test('price inquiries are deterministic while generic style consultations remain on the LLM path', async () => {
  const providerResponse = 'Đây là phản hồi thử từ provider.';
  let providerCalls = 0;
  provider.chat = async () => {
    providerCalls++;
    return {
      choices: [{
        message: { role: 'assistant', content: providerResponse },
      }],
    };
  };

  const priceResult = await orchestrator.chat({
    conversationId,
    guestSessionId,
    userMessage: 'Tôi muốn cắt tóc giá bao nhiêu?',
  });
  assert.match(priceResult.content, /size S, M hay L/i);
  assert.equal(providerCalls, 0);

  const llmRequests = [
    'Tôi muốn cắt tóc layer',
    'Tôi muốn uốn tóc',
    'Tôi muốn nhuộm tóc',
  ];
  for (const userMessage of llmRequests) {
    const result = await orchestrator.chat({
      conversationId,
      guestSessionId,
      userMessage,
    });

    assert.equal(result.content, providerResponse, userMessage);
  }

  assert.equal(providerCalls, llmRequests.length);
});
