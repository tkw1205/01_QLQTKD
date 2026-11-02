'use strict';
const BaseProvider = require('./BaseProvider');

class GeminiProvider extends BaseProvider {
  constructor(options = {}) {
    super('gemini', options);
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gemini-2.5-flash';
    this.baseUrl = (options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
      .replace(/\/openai\/?$/, '')
      .replace(/\/+$/, '');
    this.temperature = options.temperature ?? 0.7;
    this.timeout = options.timeout || 35000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  validateConfig() {
    if (!this.apiKey) {
      return {
        valid: false,
        error: 'GeminiProvider: Thiếu GEMINI_API_KEY (hoặc AI_API_KEY).',
      };
    }
    if (!this.baseUrl) {
      return {
        valid: false,
        error: 'GeminiProvider: Thiếu Base URL.',
      };
    }
    return { valid: true };
  }

  formatGeminiContents(messages) {
    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      let role = 'user';
      let parts = [];

      if (msg.role === 'user') {
        role = 'user';
        parts = [{ text: msg.content || '' }];
      } else if (msg.role === 'assistant') {
        role = 'model';
        if (msg.content) parts.push({ text: msg.content });
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            let args = {};
            try {
              args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function.arguments || {});
            } catch {
              args = {};
            }
            const part = {
              functionCall: {
                name: tc.function.name,
                args,
              },
            };
            if (tc.thoughtSignature) part.thoughtSignature = tc.thoughtSignature;
            if (tc.id) part.functionCall.id = tc.id;
            parts.push(part);
          }
        }
        if (parts.length === 0) parts.push({ text: '' });
      } else if (msg.role === 'tool') {
        role = 'user';
        let responseObj = {};
        try {
          responseObj = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        } catch {
          responseObj = { result: msg.content };
        }
        if (typeof responseObj !== 'object' || responseObj === null || Array.isArray(responseObj)) {
          responseObj = { result: responseObj };
        }

        let fnName = 'tool_function';
        for (let i = messages.indexOf(msg) - 1; i >= 0; i--) {
          const prev = messages[i];
          if (prev.role === 'assistant' && prev.tool_calls) {
            const match = prev.tool_calls.find(tc => tc.id === msg.tool_call_id);
            if (match) {
              fnName = match.function.name;
              break;
            }
            if (prev.tool_calls[0]) {
              fnName = prev.tool_calls[0].function.name;
              break;
            }
          }
        }

        parts = [{
          functionResponse: {
            name: fnName,
            response: responseObj,
          },
        }];
      }

      // Merge consecutive items with the same role to satisfy Gemini's strict turn requirement
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }
    return contents;
  }

  formatGeminiTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return [{
      functionDeclarations: tools.map(t => {
        const fn = t.function || t;
        return {
          name: fn.name,
          description: fn.description || '',
          parameters: fn.parameters || { type: 'OBJECT', properties: {} },
        };
      }),
    }];
  }

  mapGeminiResponseToOpenAI(geminiData) {
    const candidate = geminiData.candidates?.[0];
    if (!candidate) {
      if (geminiData.error) {
        throw Object.assign(
          new Error(`Gemini API Error: ${geminiData.error.message || JSON.stringify(geminiData.error)}`),
          { status: 502, code: 'AI_PROVIDER_ERROR_RESPONSE' }
        );
      }
      throw Object.assign(new Error('No candidate returned from Gemini'), {
        status: 502,
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    }

    const parts = candidate.content?.parts || [];
    if (!Array.isArray(parts) || parts.length === 0) {
      throw Object.assign(new Error('Gemini returned a candidate without content parts'), {
        status: 502,
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    }
    let text = '';
    const toolCalls = [];

    for (const part of parts) {
      if (part.text) {
        text += (text ? '\n' : '') + part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.id || 'call_' + Math.random().toString(36).substring(2, 9),
          type: 'function',
          thoughtSignature: part.thoughtSignature,
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        });
      }
    }

    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: text || (toolCalls.length > 0 ? null : ''),
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
          finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
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
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const headers = {
      'Content-Type': 'application/json',
      'X-goog-api-key': this.apiKey,
    };

    const systemMessages = messages.filter(m => m.role === 'system');
    const contents = this.formatGeminiContents(messages);

    const requestBody = {
      contents,
      generationConfig: {
        temperature: this.temperature,
      },
    };

    if (systemMessages.length > 0) {
      const systemText = systemMessages.map(m => m.content).join('\n\n');
      requestBody.systemInstruction = {
        parts: [{ text: systemText }],
      };
    }

    const geminiTools = this.formatGeminiTools(tools);
    if (geminiTools) {
      requestBody.tools = geminiTools;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw Object.assign(
            new Error(`Gemini API responded with ${res.status}: ${errText.substring(0, 300)}`),
            {
              status: res.status === 401 || res.status === 403 ? 401 : 502,
              upstreamStatus: res.status,
              code: 'AI_PROVIDER_HTTP_ERROR',
            }
          );
        }

        const data = await res.json();
        return this.mapGeminiResponseToOpenAI(data);
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        if (err.name === 'AbortError') {
          lastError = Object.assign(
            new Error(`Gemini API request timed out after ${this.timeout}ms`),
            { status: 504, code: 'AI_PROVIDER_TIMEOUT' }
          );
        } else if (err.name === 'SyntaxError') {
          lastError = Object.assign(new Error('Gemini API returned invalid JSON'), {
            status: 502,
            code: 'AI_PROVIDER_INVALID_JSON',
            cause: err,
          });
        } else if (!err.code) {
          lastError = Object.assign(err, { code: 'AI_PROVIDER_NETWORK_ERROR' });
        }
        lastError.attempts = attempt + 1;
        // Don't retry on client authentication or validation errors (401, 403, 400)
        if (err.status === 401 || err.status === 403 || err.status === 400) {
          throw err;
        }
        if (attempt < this.maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
    throw lastError;
  }
}

module.exports = GeminiProvider;
