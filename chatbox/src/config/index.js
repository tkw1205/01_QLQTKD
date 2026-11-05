
'use strict';

require('dotenv').config();

const rawProvider = (
  process.env.AI_PROVIDER || 'gemini'
).trim().toLowerCase();

// Gemini configuration
const geminiConfig = {
  apiKey:
    process.env.GEMINI_API_KEY ||
    process.env.AI_API_KEY ||
    '',

  model:
    process.env.GEMINI_MODEL ||
    process.env.AI_MODEL ||
    'gemini-3.1-flash-lite',

  baseUrl: (
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, ''),
};

// Ollama configuration
const ollamaConfig = {
  baseUrl: (
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434'
  ).replace(/\/+$/, ''),

  model:
    process.env.OLLAMA_MODEL || 'qwen2.5:3b',

  apiKey: process.env.OLLAMA_API_KEY || '',
};

// Common parameters
const commonConfig = {
  temperature: Number(
    process.env.AI_TEMPERATURE ?? 0.7
  ),

  timeout: Math.max(
    30000,
    Number(process.env.AI_TIMEOUT ?? 120000)
  ),

  maxRetries: Math.max(
    0,
    Number(process.env.AI_MAX_RETRIES ?? 2)
  ),
};

// Resolve active AI configuration
let activeConfig = {};

if (rawProvider === 'gemini') {
  activeConfig = {
    provider: 'gemini',
    ...geminiConfig,
    ...commonConfig,
  };

} else if (rawProvider === 'ollama') {
  activeConfig = {
    provider: 'ollama',
    ...ollamaConfig,
    ...commonConfig,
  };

} else {
  activeConfig = {
    provider: rawProvider,
    baseUrl: '',
    apiKey: '',
    model: '',
    ...commonConfig,
  };
}

module.exports = {
  env: process.env.NODE_ENV || 'development',

  port: Number(process.env.PORT) || 3000,

  timezone: process.env.TZ || 'Asia/Ho_Chi_Minh',

  ai: activeConfig,

  gemini: geminiConfig,

  ollama: ollamaConfig,

  validateAIConfig() {
    const provider = this.ai.provider;

    if (!['ollama', 'gemini'].includes(provider)) {
      return {
        valid: false,
        provider,
        error: `AI_PROVIDER="${provider}" không hợp lệ.`,
      };
    }

    if (!this.ai.baseUrl || !this.ai.model) {
      return {
        valid: false,
        provider,
        error: 'Thiếu Base URL hoặc Model.',
      };
    }

    if (provider === 'gemini' && !this.ai.apiKey) {
      return {
        valid: false,
        provider,
        error: 'Thiếu GEMINI_API_KEY.',
      };
    }

    return {
      valid: true,
      provider,
      error: null,
    };
  },

  isAIConfigured() {
    return this.validateAIConfig().valid;
  },
};
