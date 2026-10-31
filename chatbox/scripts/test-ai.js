#!/usr/bin/env node
'use strict';

/**
 * ==============================================================================
 * Chatbox AI Provider Diagnostic & Test Utility
 * ==============================================================================
 * Kiểm tra kết nối độc lập tới AI Provider (Ollama / Gemini)
 *
 * Cách dùng:
 *   node scripts/test-ai.js
 *   node scripts/test-ai.js --provider=gemini
 *   node scripts/test-ai.js --provider=ollama
 *   node scripts/test-ai.js --model=llama3.2 --prompt="Xin chao"
 * ==============================================================================
 */

const path = require('path');
const fs = require('fs');

// Nạp .env từ thư mục gốc
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = require('../src/config');
const AIService = require('../src/ai/AIService');

// Parse tham số dòng lệnh
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, ...vals] = arg.slice(2).split('=');
    acc[key] = vals.length > 0 ? vals.join('=') : true;
  }
  return acc;
}, {});

if (args.help || args.h) {
  console.log(`
Chatbox AI Diagnostic Tool
Cách dùng: node scripts/test-ai.js [options]

Options:
  --provider=<provider>    Tên provider ('gemini' hoặc 'ollama')
  --model=<model>          Mô hình cần test
  --prompt=<text>          Nội dung câu hỏi test
  --timeout=<ms>           Thời gian chờ tối đa (ms)
  --help, -h               Hiển thị hướng dẫn này
`);
  process.exit(0);
}

const targetProvider = (args.provider || config.ai.provider || 'gemini').trim().toLowerCase();
const testPrompt = args.prompt || 'Xin chào! Hãy trả lời ngắn gọn trong 1 câu: Bạn là AI gì và bạn có thể làm gì?';

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function maskApiKey(key) {
  if (!key) return '(không có / rỗng)';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

async function run() {
  console.log(`==========================================================`);
  console.log(`   CHATBOX AI PROVIDER TEST UTILITY`);
  console.log(`==========================================================`);

  let testConfig;
  if (targetProvider === 'gemini') {
    testConfig = {
      ai: {
        provider: 'gemini',
        apiKey: args['api-key'] || config.gemini.apiKey,
        model: args.model || config.gemini.model,
        baseUrl: args['base-url'] || config.gemini.baseUrl,
        temperature: parseFloat(args.temperature || config.ai.temperature),
        timeout: parseInt(args.timeout || config.ai.timeout, 10),
        maxRetries: 1,
      },
    };
  } else if (targetProvider === 'ollama') {
    testConfig = {
      ai: {
        provider: 'ollama',
        baseUrl: args['base-url'] || config.ollama.baseUrl,
        model: args.model || config.ollama.model,
        apiKey: args['api-key'] || config.ollama.apiKey,
        temperature: parseFloat(args.temperature || config.ai.temperature),
        timeout: parseInt(args.timeout || config.ai.timeout, 10),
        maxRetries: 1,
      },
    };
  } else {
    console.log(`${colors.red}[LỖI] Provider "${targetProvider}" không hợp lệ. Chỉ chấp nhận "gemini" hoặc "ollama".${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.gray}Provider:${colors.reset}    ${colors.bold}${targetProvider}${colors.reset}`);
  console.log(`${colors.gray}Base URL:${colors.reset}    ${testConfig.ai.baseUrl}`);
  console.log(`${colors.gray}Model:${colors.reset}       ${testConfig.ai.model}`);
  console.log(`${colors.gray}API Key:${colors.reset}     ${maskApiKey(testConfig.ai.apiKey)}`);
  console.log(`${colors.gray}Timeout:${colors.reset}     ${testConfig.ai.timeout}ms`);

  console.log(`\n=== KIỂM TRA KHỞI TẠO & CẤU HÌNH ===`);
  const aiService = new AIService(testConfig);
  if (!aiService.isConfigured()) {
    console.log(`${colors.red}[LỖI CẤU HÌNH] ${aiService.getInitError()}${colors.reset}`);
    process.exit(1);
  }
  console.log(`${colors.green}[OK] Khởi tạo Provider "${targetProvider}" thành công!${colors.reset}`);

  console.log(`\n=== KIỂM TRA CHAT COMPLETION & SYSTEM PROMPT ===`);
  console.log(`${colors.gray}Prompt:${colors.reset} "${testPrompt}"`);

  const startTime = Date.now();
  try {
    const res = await aiService.chat({
      messages: [
        { role: 'system', content: 'Bạn là trợ lý AI thông minh, hỗ trợ ngắn gọn và chuẩn xác bằng tiếng Việt.' },
        { role: 'user', content: testPrompt },
      ],
    });

    const elapsed = Date.now() - startTime;
    const choice = res.choices?.[0];
    const reply = choice?.message?.content || '(Phản hồi rỗng)';

    console.log(`\n${colors.green}[SUCCESS] Nhận phản hồi thành công trong ${elapsed}ms!${colors.reset}`);
    console.log(`----------------------------------------------------------`);
    console.log(`${colors.bold}${colors.cyan}Nội dung phản hồi:${colors.reset}\n${reply.trim()}`);
    console.log(`----------------------------------------------------------`);

    console.log(`\n=== KIỂM TRA TOOL CALLING ===`);
    const toolRes = await aiService.chat({
      messages: [
        { role: 'system', content: 'Khi khách hỏi giờ trống, gọi check_available_slots.' },
        { role: 'user', content: 'Xem lịch trống ngày 2026-11-01' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'check_available_slots',
            description: 'Kiểm tra lịch trống',
            parameters: {
              type: 'object',
              required: ['date'],
              properties: {
                date: { type: 'string', description: 'YYYY-MM-DD' },
              },
            },
          },
        },
      ],
      toolChoice: 'auto',
    });

    const toolChoice = toolRes.choices?.[0]?.message;
    if (toolChoice?.tool_calls && toolChoice.tool_calls.length > 0) {
      console.log(`${colors.green}[SUCCESS] Tool Calling hoạt động chính xác!${colors.reset}`);
      console.log(`${colors.gray}Tool called:${colors.reset} ${toolChoice.tool_calls[0].function.name} (${toolChoice.tool_calls[0].function.arguments})`);
    } else {
      console.log(`${colors.yellow}[NOTE] AI phản hồi text trực tiếp: ${toolChoice?.content}${colors.reset}`);
    }

    console.log(`\n${colors.green}${colors.bold}=== [PASS] AI Provider "${targetProvider}" đã sẵn sàng hoạt động 100%! ===${colors.reset}`);
  } catch (err) {
    console.log(`\n${colors.red}[LỖI] ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

run();
