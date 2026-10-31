'use strict';

/**
 * Base abstract class for AI Providers (Ollama, Gemini, etc.)
 * Chuẩn hóa giao tiếp và đảm bảo mọi Provider tuân thủ cùng một interface.
 */
class BaseProvider {
  /**
   * @param {string} name - Tên định danh của Provider ('gemini' | 'ollama')
   * @param {object} options - Cấu hình khởi tạo của Provider
   */
  constructor(name, options = {}) {
    if (new.target === BaseProvider) {
      throw new TypeError('Cannot construct BaseProvider instances directly');
    }
    this.name = name;
    this.options = options;
  }

  /**
   * Trả về tên provider
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Kiểm tra xem cấu hình của Provider có hợp lệ không
   * @returns {{ valid: boolean, error?: string }}
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Kiểm tra Provider đã sẵn sàng được cấu hình chưa
   * @returns {boolean}
   */
  isConfigured() {
    return this.validateConfig().valid;
  }

  /**
   * Phương thức chat chính
   * @param {object} params
   * @param {Array<object>} params.messages - Danh sách tin nhắn ({ role, content, tool_calls, tool_call_id })
   * @param {Array<object>} [params.tools] - Danh sách tool theo chuẩn function calling
   * @param {string|object} [params.toolChoice] - 'auto' | 'none'
   * @param {boolean} [params.stream] - Chế độ stream
   * @returns {Promise<{ choices: Array<{ message: { role: string, content: string|null, tool_calls?: Array<object> }, finish_reason: string }> }>}
   */
  async chat({ messages, tools, toolChoice, stream = false }) {
    throw new Error('chat() must be implemented by subclass');
  }
}

module.exports = BaseProvider;

