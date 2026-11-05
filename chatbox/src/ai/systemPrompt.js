'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_AI_SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '../../docs/fixbug/chatbot-system-prompt.md'),
  'utf8'
).trim();

module.exports = {
  DEFAULT_AI_SYSTEM_PROMPT,
};
