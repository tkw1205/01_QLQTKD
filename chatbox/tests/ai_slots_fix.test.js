'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { executeTool, getVietnamDate } = require('../src/ai/tools');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const jsonStore = require('../src/config/jsonStore');

describe('AI check_available_slots Bug Fix Test Suite', () => {
  const futureDate = getVietnamDate(5);
  const [fy, fm, fd] = futureDate.split('-');
  const futureDateVN = `${fd}/${fm}/${fy}`;

  test('1. Đúng dữ liệu tái hiện lỗi: args bọc trong parameters { parameters: { date: futureDate } }', async () => {
    const rawArgs = {
      name: 'check_available_slots',
      parameters: {
        date: futureDate
      }
    };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, true, 'Phải thành công khi unwrap parameters');
    assert.equal(res.date, futureDate);
    assert.ok(Array.isArray(res.slots), 'slots phải là một mảng');
    assert.ok(res.slots.length > 0, `Ngày ${futureDate} phải có các khung giờ trống`);
    assert.ok(res.slots.includes('08:30'), 'Phải chứa giờ mở cửa 08:30');
    assert.ok(res.slots.includes('20:00'), 'Phải chứa ca cuối cùng 20:00');
    assert.ok(res.message.includes(futureDate), 'Thông báo phải chứa ngày kiểm tra');
  });

  test('2. Định dạng chuẩn: { date: futureDate }', async () => {
    const rawArgs = { date: futureDate };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, true);
    assert.equal(res.date, futureDate);
    assert.ok(res.slots.length > 0);
  });

  test('3. Định dạng ngày kiểu Việt Nam: DD/MM/YYYY', async () => {
    const rawArgs = { date: futureDateVN };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, true);
    assert.equal(res.date, futureDate, 'Phải tự động chuẩn hóa về YYYY-MM-DD');
    assert.ok(res.slots.length > 0);
  });

  test('4. Định dạng ngày tương đối: "ngày mai"', async () => {
    const rawArgs = { date: 'ngày mai' };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, true);
    assert.match(res.date, /^\d{4}-\d{2}-\d{2}$/, 'Phải chuyển ngày mai thành chuỗi YYYY-MM-DD hợp lệ');
    assert.ok(res.slots.length > 0);
  });

  test('5. Thiếu tham số date', async () => {
    const rawArgs = {};
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, false);
    assert.match(res.error, /required/i);
    assert.deepEqual(res.slots, []);
  });

  test('6. Ngày không hợp lệ: "invalid-date-xyz"', async () => {
    const rawArgs = { date: 'invalid-date-xyz' };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, false);
    assert.match(res.error, /không hợp lệ/i);
    assert.deepEqual(res.slots, []);
  });

  test('7. Ngày trong quá khứ: "2020-01-01"', async () => {
    const rawArgs = { date: '2020-01-01' };
    const context = { conversationId: 'test-conv-1', guestSessionId: 'test-guest-1' };
    const resStr = await executeTool('check_available_slots', rawArgs, context);
    const res = JSON.parse(resStr);

    assert.equal(res.success, false);
    assert.match(res.error, /past/i);
    assert.deepEqual(res.slots, []);
  });

  test('8. Ngày kín lịch: khi tất cả khung giờ đã được đặt', async () => {
    const testDate = '2026-11-15';
    // Lấy danh sách khung giờ mở cửa chuẩn
    const baseSlots = await appointmentRepo.findAvailableSlots(testDate, 30);
    assert.ok(baseSlots.length > 0);

    // Giả lập lấp đầy tất cả khung giờ của testDate vào DB
    const appointments = jsonStore.getCollection('appointments');
    const tempAppts = baseSlots.map(time => ({
      id: 'mock-busy-' + time.replace(':', ''),
      appointment_date: testDate,
      appointment_time: time,
      duration_minutes: 30,
      status: 'confirmed',
      customer_name: 'Khách Đã Đặt',
      customer_phone: '0901234567',
      created_at: new Date().toISOString()
    }));

    appointments.push(...tempAppts);
    jsonStore.saveCollection('appointments', appointments);

    try {
      const resStr = await executeTool('check_available_slots', { date: testDate }, { conversationId: 'c', guestSessionId: 'g' });
      const res = JSON.parse(resStr);

      assert.equal(res.success, true);
      assert.equal(res.date, testDate);
      assert.equal(res.count, 0, 'Số khung giờ trống phải bằng 0');
      assert.deepEqual(res.slots, []);
      assert.match(res.message, /kín lịch|không còn khung giờ/i);
    } finally {
      // Dọn dẹp mock data
      const cleaned = appointments.filter(a => !a.id.startsWith('mock-busy-'));
      jsonStore.saveCollection('appointments', cleaned);
    }
  });

  test('9. Trích xuất tool call khi AI output text JSON (như llama3.2)', () => {
    const orchestratorCode = require('../src/ai/orchestrator');
    // Test parser thông qua tin nhắn thực tế từng bị lỗi:
    const content = '{"name":"check_available_slots","parameters":{"date":"2026-10-29"}}';
    
    // Parse test
    const jsonParsed = JSON.parse(content);
    assert.equal(jsonParsed.name, 'check_available_slots');
    assert.equal(jsonParsed.parameters.date, '2026-10-29');
  });

  test('10. Toàn trình Orchestrator: Tự động bắt text JSON tool call từ LLM và trả về câu trả lời tự nhiên', async () => {
    const provider = require('../src/ai/provider');
    const orchestrator = require('../src/ai/orchestrator');
    const conversationService = require('../src/services/conversationService');

    // Tạo cuộc hội thoại test
    const conv = await conversationService.getOrCreate({ guestSessionId: 'test-ai-session-99' });

    // Mock provider.chat
    const originalChat = provider.chat;
    let callCount = 0;

    provider.chat = async ({ messages }) => {
      callCount++;
      if (callCount === 1) {
        // Lần 1: LLM xuất chuỗi JSON thô vào content (đúng lỗi tái hiện)
        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `{"name":"check_available_slots","parameters":{"date":"${futureDate}"}}`
            }
          }]
        };
      } else {
        // Lần 2: LLM nhận tool result và trả về câu trả lời tự nhiên
        const lastMsg = messages[messages.length - 1];
        assert.equal(lastMsg.role, 'tool', 'Message trước đó phải là tool result');
        const toolData = JSON.parse(lastMsg.content);
        assert.equal(toolData.success, true);
        assert.ok(toolData.slots.length > 0);

        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `Chào bạn, ngày ${futureDateVN} salon có các khung giờ còn trống như sau: ${toolData.slots.slice(0, 5).join(', ')}. Bạn muốn đặt vào giờ nào ạ?`
            }
          }]
        };
      }
    };

    try {
      const result = await orchestrator.chat({
        conversationId: conv.id,
        guestSessionId: 'test-ai-session-99',
        userMessage: 'Kiểm tra lịch trống ngày mai giúp tôi'
      });

      assert.equal(result.aiConfigured, true);
      assert.ok(callCount >= 2, 'Phải thực hiện ít nhất 2 vòng lặp (1 lần bắt tool, 1 lần trả lời)');
      assert.doesNotMatch(result.content, /{"name":/i, 'Câu trả lời KHÔNG ĐƯỢC chứa chuỗi JSON thô');
      assert.match(result.content, new RegExp(`${futureDateVN}|khung giờ`, 'i'), 'Câu trả lời phải chứa thông tin lịch hẹn tự nhiên');
    } finally {
      provider.chat = originalChat;
    }
  });

});
