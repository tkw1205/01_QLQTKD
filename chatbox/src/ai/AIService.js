'use strict';
const config = require('../config');
const GeminiProvider = require('./providers/GeminiProvider');
const OllamaProvider = require('./providers/OllamaProvider');

class AIService {
  constructor(customConfig = null) {
    this.cfg = customConfig || config;
    this.activeProvider = null;
    this.initError = null;
    this.init();
  }

  init() {
    const providerName = (this.cfg.ai.provider || '').trim().toLowerCase();

    if (!['gemini', 'ollama'].includes(providerName)) {
      this.initError = `AI Provider "${providerName}" không hợp lệ. Hệ thống chỉ hỗ trợ "ollama" hoặc "gemini".`;
      this.activeProvider = null;
      return;
    }

    try {
      if (providerName === 'gemini') {
        this.activeProvider = new GeminiProvider(this.cfg.ai);
      } else if (providerName === 'ollama') {
        this.activeProvider = new OllamaProvider(this.cfg.ai);
      }

      const validation = this.activeProvider.validateConfig();
      if (!validation.valid) {
        this.initError = validation.error;
        this.activeProvider = null;
      } else {
        this.initError = null;
      }
    } catch (err) {
      this.initError = `Lỗi khởi tạo AI Provider: ${err.message}`;
      this.activeProvider = null;
    }
  }

  isConfigured() {
    return this.activeProvider !== null && this.activeProvider.isConfigured();
  }

  getProviderName() {
    return this.activeProvider ? this.activeProvider.getName() : (this.cfg.ai.provider || 'none');
  }

  getActiveProvider() {
    return this.activeProvider;
  }

  getInitError() {
    return this.initError;
  }

  async chat({ messages, tools, toolChoice, stream = false }) {
    if (!this.isConfigured()) {
      const msg = this.initError || 'AI Provider chưa được cấu hình hợp lệ.';
      throw Object.assign(new Error(msg), { status: 503 });
    }

    // Luôn sử dụng duy nhất Provider đã được chọn qua AI_PROVIDER
    return this.activeProvider.chat({ messages, tools, toolChoice, stream });
  }
}

module.exports = AIService;

