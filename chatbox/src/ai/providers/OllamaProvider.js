'use strict';
const BaseProvider = require('./BaseProvider');

class OllamaProvider extends BaseProvider {
  constructor(options = {}) {
    super('ollama', options);
    const providedBase = options.baseUrl !== undefined ? options.baseUrl : 'http://localhost:11434';
    this.rawBaseUrl = (providedBase || '').trim().replace(/\/+$/, '');
    this.model = options.model || 'qwen2.5:3b';
    this.apiKey = options.apiKey || '';
    this.temperature = options.temperature ?? 0.7;
    this.timeout = options.timeout || 120000;
    this.maxRetries = options.maxRetries ?? 2;

    // Build endpoint: Ollama OpenAI-compatible chat completions endpoint
    if (this.rawBaseUrl) {
      const baseClean = this.rawBaseUrl.replace(/\/v1\/?$/, '');
      this.apiUrl = `${baseClean}/v1/chat/completions`;
    } else {
      this.apiUrl = '';
    }
  }

  validateConfig() {
    if (!this.rawBaseUrl) {
      return {
        valid: false,
        error: 'OllamaProvider: Thiếu cấu hình OLLAMA_BASE_URL (hoặc AI_BASE_URL).',
      };
    }
    if (!this.model) {
      return {
        valid: false,
        error: 'OllamaProvider: Thiếu cấu hình OLLAMA_MODEL (hoặc AI_MODEL).',
      };
    }
    return { valid: true };
  }

  formatMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      content: m.content !== undefined && m.content !== null ? String(m.content) : '',
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    }));
  }

  standardizeResponse(data) {
    if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
      if (data && data.error) {
        throw Object.assign(
          new Error(`Ollama Error: ${data.error.message || JSON.stringify(data.error)}`),
          { status: 502, code: 'AI_PROVIDER_ERROR_RESPONSE' }
        );
      }
      throw Object.assign(new Error('Ollama returned an empty or invalid response'), {
        status: 502,
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    }

    const choice = data.choices[0];
    if (!choice || !choice.message || typeof choice.message !== 'object') {
      throw Object.assign(new Error('Ollama returned an invalid choice message'), {
        status: 502,
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    }
    const message = choice.message;
    if (
      (message.content !== null && message.content !== undefined && typeof message.content !== 'string') ||
      (message.content == null && (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0))
    ) {
      throw Object.assign(new Error('Ollama returned an invalid choice message'), {
        status: 502,
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    }

    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: message.content ?? '',
            tool_calls: message.tool_calls && message.tool_calls.length > 0 ? message.tool_calls : undefined,
          },
          finish_reason: choice.finish_reason || (message.tool_calls?.length ? 'tool_calls' : 'stop'),
        },
      ],
    };
  }

  async chat({ messages, tools, toolChoice, stream = false }) {
    const validation = this.validateConfig();
    if (!validation.valid) {
      throw Object.assign(new Error(validation.error), { status: 503 });
    }

    let lastError;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const formattedMessages = this.formatMessages(messages);
    const requestBody = {
      model: this.model,
      messages: formattedMessages,
      temperature: this.temperature,
      stream: false,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      if (toolChoice) {
        requestBody.tool_choice = toolChoice;
      }
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw Object.assign(
            new Error(`Ollama API responded with ${res.status}: ${errText.substring(0, 300)}`),
            {
              status: 502,
              upstreamStatus: res.status,
              code: 'AI_PROVIDER_HTTP_ERROR',
            }
          );
        }

        const data = await res.json();
        return this.standardizeResponse(data);
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = Object.assign(
            new Error(`Ollama request timed out after ${this.timeout}ms`),
            { status: 504, code: 'AI_PROVIDER_TIMEOUT' }
          );
        } else if (err.name === 'SyntaxError') {
          lastError = Object.assign(new Error('Ollama API returned invalid JSON'), {
            status: 502,
            code: 'AI_PROVIDER_INVALID_JSON',
            cause: err,
          });
        } else if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('fetch failed'))) {
          lastError = Object.assign(
            new Error(`Không thể kết nối tới máy chủ Ollama tại ${this.apiUrl}. Vui lòng kiểm tra Ollama đã được khởi động chưa.`),
            { status: 503, code: 'AI_PROVIDER_CONNECTION_ERROR' }
          );
        } else if (!err.code) {
          lastError = Object.assign(err, { code: 'AI_PROVIDER_NETWORK_ERROR' });
        }

        lastError.attempts = attempt + 1;
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
    throw lastError;
  }
}

module.exports = OllamaProvider;
