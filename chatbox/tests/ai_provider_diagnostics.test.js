'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const GeminiProvider = require('../src/ai/providers/GeminiProvider');
const OllamaProvider = require('../src/ai/providers/OllamaProvider');

const providers = [
  ['Gemini', () => new GeminiProvider({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1beta',
    model: 'test-model',
    maxRetries: 0,
    timeout: 20,
  })],
  ['Ollama', () => new OllamaProvider({
    baseUrl: 'http://localhost:11434',
    model: 'test-model',
    maxRetries: 0,
    timeout: 20,
  })],
];

const request = {
  messages: [{ role: 'user', content: 'hello' }],
};

async function assertFailure(provider, fetchMock, expected) {
  const originalFetch = global.fetch;
  global.fetch = fetchMock;
  try {
    await assert.rejects(provider.chat(request), error => {
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(error[key], value, `${key} should describe the provider failure`);
      }
      assert.equal(error.attempts, 1);
      return true;
    });
  } finally {
    global.fetch = originalFetch;
  }
}

for (const [providerName, createProvider] of providers) {
  test(`${providerName} diagnostics retain upstream HTTP status`, async () => {
    await assertFailure(createProvider(), async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }), {
      code: 'AI_PROVIDER_HTTP_ERROR',
      upstreamStatus: 429,
    });
  });

  test(`${providerName} diagnostics distinguish invalid JSON`, async () => {
    await assertFailure(createProvider(), async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('invalid JSON');
      },
    }), {
      code: 'AI_PROVIDER_INVALID_JSON',
      status: 502,
    });
  });

  test(`${providerName} diagnostics reject malformed response shapes`, async () => {
    const body = providerName === 'Gemini'
      ? { candidates: [{ content: { parts: [] } }] }
      : { choices: [{ message: {} }] };
    await assertFailure(createProvider(), async () => ({
      ok: true,
      json: async () => body,
    }), {
      code: 'AI_PROVIDER_INVALID_RESPONSE',
      status: 502,
    });
  });

  test(`${providerName} diagnostics distinguish timeout`, async () => {
    await assertFailure(createProvider(), (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }), {
      code: 'AI_PROVIDER_TIMEOUT',
      status: 504,
    });
  });
}
