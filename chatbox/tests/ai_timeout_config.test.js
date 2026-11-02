'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AIService = require('../src/ai/AIService');

test('Ollama sample timeout allows slow local inference', () => {
  const envExample = fs.readFileSync(
    path.join(__dirname, '..', '.env.example'),
    'utf8'
  );
  const timeoutSetting = envExample.match(/^AI_TIMEOUT=(\d+)$/m);

  assert.ok(timeoutSetting, '.env.example must define AI_TIMEOUT in milliseconds');
  const timeout = Number(timeoutSetting[1]);
  assert.ok(timeout >= 120000, 'AI_TIMEOUT should allow at least 120 seconds for local inference');

  const service = new AIService({
    ai: {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      timeout,
    },
  });

  assert.equal(service.isConfigured(), true);
  assert.equal(service.getActiveProvider().timeout, timeout);
});
