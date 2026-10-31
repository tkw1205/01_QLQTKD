'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../src/ai/provider');
const orchestrator = require('../src/ai/orchestrator');
const { executeTool, getVietnamDate, getNextDate, detectAvailableSlotsQuery, extractTimeFromText } = require('../src/ai/tools');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const jsonStore = require('../src/config/jsonStore');

describe('AI Alternate Slots & Booking Flow Test Suite', () => {
  const testGuestId = 'guest-test-alternate-slots';
  let testConvId;
  const tomorrow = getVietnamDate(1);
  const nextDay = getNextDate(tomorrow);

  before(async () => {
    // Clean up test data
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => !a.customer_email?.includes('test-alternate') && !(a.appointment_date === tomorrow && a.status === 'holding'));
    jsonStore.saveCollection('appointments', cleaned);

    const conv = await conversationService.getOrCreate({ guestSessionId: testGuestId });
    testConvId = conv.id;
  });

  after(async () => {
    // Clean up test appointments
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => !a.customer_email?.includes('test-alternate') && a.conversation_id !== testConvId && a.id !== 'mock-occupied-1030');
    jsonStore.saveCollection('appointments', cleaned);
  });

  test('1. Tình huống 1: Khách đặt lúc 10:30 ngày mai nhưng giờ đó đã kín -> AI báo kín, KHÔNG được thông báo giữ chỗ 10 phút', async () => {
    // 1.1 Chiếm chỗ 10:30 ngày mai trong DB
    const appointments = jsonStore.getCollection('appointments');
    appointments.push({
      id: 'mock-occupied-1030',
      appointment_date: tomorrow,
      appointment_time: '10:30',
      duration_minutes: 30,
      status: 'confirmed',
      customer_name: 'Khách Đã Đặt Trước',
      customer_phone: '0909999888',
      customer_email: 'test-alternate-occupant@example.com',
      created_at: new Date().toISOString()
    });
    jsonStore.saveCollection('appointments', appointments);

    // 1.2 Giả lập LLM gọi tool hold_appointment_slot cho 10:30
    const originalChat = provider.chat;
    let turn = 0;
    provider.chat = async ({ messages }) => {
      turn++;
      if (turn === 1) {
        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_hold_1',
                type: 'function',
                function: {
                  name: 'hold_appointment_slot',
                  arguments: JSON.stringify({ appointment_date: tomorrow, appointment_time: '10:30' })
                }
              }]
            }
          }]
        };
      } else {
        // Lần 2: Giả sử LLM nhận kết quả thất bại từ tool
        const toolMsg = messages.find(m => m.role === 'tool');
        const toolData = JSON.parse(toolMsg.content);
        assert.equal(toolData.success, false, 'Tool hold phải trả về false khi trùng');
        assert.ok(toolData.code === 'SLOT_CONFLICT' || toolData.code === 'SLOT_UNAVAILABLE');

        // Thử xem nếu LLM vô tình sinh câu ảo tưởng có bị filter không
        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `Dạ xin lỗi bạn, khung giờ 10:30 ngày mai (${tomorrow}) đã có khách đặt trước rồi ạ. Chúng tôi sẽ giữ chỗ tạm thời cho bạn trong 5 phút. Bạn có muốn đổi sang khung giờ khác không ạ?`
            }
          }]
        };
      }
    };

    try {
      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: 'Tôi muốn đặt lịch lúc 10:30 ngày mai'
      });

      assert.equal(res.aiConfigured, true);
      // Kiểm tra tuyệt đối KHÔNG có câu giữ chỗ 5 phút khi slot bị kín
      assert.doesNotMatch(res.content, /giữ chỗ tạm thời.*(?:5|10) phút/i, 'KHÔNG được thông báo giữ chỗ khi slot đã kín');
      assert.match(res.content, /10:30|đã có khách đặt|không còn trống|đã kín/i, 'Phải thông báo rõ khung giờ đó đã kín');

      // Lưu tin nhắn vào lịch sử để chuẩn bị cho turn 2
      await messageRepo.create({ conversationId: testConvId, senderType: 'user', content: 'Tôi muốn đặt lịch lúc 10:30 ngày mai' });
      await messageRepo.create({ conversationId: testConvId, senderType: 'assistant', content: res.content });
    } finally {
      provider.chat = originalChat;
    }
  });

  test('2. Tình huống 2: Khách hỏi "Còn trống khung giờ khác không?" -> AI tự gọi check_available_slots và trả về danh sách giờ trống', async () => {
    const originalChat = provider.chat;
    let toolCalledName = null;
    let toolArgs = null;

    // Giả lập LLM phản hồi tự nhiên sau khi nhận kết quả tool
    provider.chat = async ({ messages }) => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'tool') {
        const toolData = JSON.parse(lastMsg.content);
        assert.equal(toolData.success, true);
        assert.ok(toolData.slots.length > 0);
        assert.ok(!toolData.slots.includes('10:30'), 'Giờ 10:30 đã kín không được xuất hiện');

        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `Dạ, trong ngày mai (${toolData.date}), salon còn các khung giờ trống sau ạ:\n\n${toolData.slots.slice(0, 8).join(', ')}\n\nBạn thuận tiện chọn khung giờ nào để em hỗ trợ giữ chỗ cho bạn ạ?`
            }
          }]
        };
      }

      // Lần đầu: LLM tự quyết định gọi tool check_available_slots
      return {
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_check_slots_2',
              type: 'function',
              function: {
                name: 'check_available_slots',
                arguments: JSON.stringify({ date: tomorrow })
              }
            }]
          }
        }]
      };
    };

    try {
      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: 'Còn trống khung giờ khác không?'
      });

      assert.equal(res.aiConfigured, true);
      assert.match(res.content, /khung giờ trống|khung giờ còn trống/i);
      assert.ok(res.content.includes('08:30') || res.content.includes('09:00') || res.content.includes('11:00'), 'Phải chứa giờ trống thực tế');
      assert.doesNotMatch(res.content, /10:30/, 'Không được chứa giờ 10:30 đã kín');

      await messageRepo.create({ conversationId: testConvId, senderType: 'user', content: 'Còn trống khung giờ khác không?' });
      await messageRepo.create({ conversationId: testConvId, senderType: 'assistant', content: res.content });
    } finally {
      provider.chat = originalChat;
    }
  });

  test('3. Tình huống 2b (Chặn lỗi LLM lười): LLM trả lời chay mà KHÔNG gọi tool -> Orchestrator tự động bắt và ép gọi check_available_slots', async () => {
    const originalChat = provider.chat;
    let callCount = 0;

    provider.chat = async ({ messages }) => {
      callCount++;
      if (callCount === 1) {
        // LLM lười: chỉ trả lời bằng text mà không gọi tool
        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Dạ bạn muốn đặt vào khung giờ nào ạ?'
            }
          }]
        };
      } else {
        // Lần 2: Sau khi orchestrator ép gọi tool check_available_slots, LLM nhận dữ liệu slots thật
        const toolMsg = messages.find(m => m.role === 'tool');
        assert.ok(toolMsg, 'Phải có tool message được chèn bởi interceptor');
        const toolData = JSON.parse(toolMsg.content);
        assert.equal(toolData.success, true);

        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `Dạ, salon đã kiểm tra lịch ngày mai (${toolData.date}), hiện còn các khung giờ: ${toolData.slots.slice(0, 5).join(', ')}. Bạn chọn khung giờ nào ạ?`
            }
          }]
        };
      }
    };

    try {
      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: 'Có giờ khác không bạn?'
      });

      assert.equal(res.aiConfigured, true);
      assert.ok(callCount >= 2, 'Orchestrator phải ép gọi thêm turn với tool result');
      assert.match(res.content, /khung giờ/i);
      assert.doesNotMatch(res.content, /^Dạ bạn muốn đặt vào khung giờ nào ạ\?$/, 'Không được để nguyên câu hỏi chay của AI');
    } finally {
      provider.chat = originalChat;
    }
  });

  test('4. Tình huống 3: Khách chọn một giờ trong danh sách ("Mình chọn 11:00") -> AI gọi hold_appointment_slot và tiếp tục đặt lịch', async () => {
    // Đảm bảo khung giờ 11:00 ngày mai và conversation chưa có hold nào trước khi test
    const appts = jsonStore.getCollection('appointments');
    const cleaned = appts.filter(a => {
      if (a.conversation_id === testConvId) return false;
      if (a.appointment_date === tomorrow) {
        if (!a.appointment_time) return false;
        const [h, m] = a.appointment_time.split(':').map(Number);
        const start = h * 60 + m;
        const end = start + (a.duration_minutes || 30);
        // Overlaps with 11:00-11:30 (660 - 690) if start < 690 && end > 660
        if (start < 690 && end > 660) return false;
      }
      return true;
    });
    jsonStore.saveCollection('appointments', cleaned);

    const originalChat = provider.chat;

    provider.chat = async ({ messages }) => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'tool') {
        const toolData = JSON.parse(lastMsg.content);
        assert.equal(toolData.success, true);
        assert.equal(toolData.appointment_time, '11:00');
        assert.ok(toolData.holding_token);

        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: `Dạ em đã giữ chỗ tạm thời khung giờ 11:00 ngày mai (${tomorrow}) cho bạn trong 5 phút rồi ạ. Bạn vui lòng cho em xin Họ tên và Số điện thoại (Email không bắt buộc) để salon xác nhận lịch hẹn nhé!`
            }
          }]
        };
      }

      // LLM nhận ra khách chọn 11:00 -> gọi hold_appointment_slot
      return {
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_hold_1100',
              type: 'function',
              function: {
                name: 'hold_appointment_slot',
                arguments: JSON.stringify({ appointment_date: tomorrow, appointment_time: '11:00' })
              }
            }]
          }
        }]
      };
    };

    try {
      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: 'Mình chọn 11:00'
      });

      assert.equal(res.aiConfigured, true);
      assert.match(res.content, /11:00/);
      assert.match(res.content, /giữ chỗ tạm thời.*5 phút/i, 'Khi giữ chỗ thành công thì được thông báo 5 phút');
      assert.match(res.content, /họ tên|số điện thoại/i, 'Tiếp tục thu thập thông tin cá nhân khách');

      // Kiểm tra trong DB xem đã có bản ghi holding chưa
      const activeHold = await appointmentRepo.findActiveHoldByConversation(testConvId);
      assert.ok(activeHold, 'Phải có active hold trong database');
      assert.equal(activeHold.appointment_time, '11:00');
      assert.equal(activeHold.appointment_date, tomorrow);
    } finally {
      provider.chat = originalChat;
    }
  });

  test('5. Tình huống 4: Ngày đó kín toàn bộ lịch -> AI thông báo kín và chủ động đề xuất kiểm tra ngày tiếp theo', async () => {
    const fullDate = '2026-11-20';
    // Lấy tất cả ca mở cửa của fullDate và chiếm chỗ toàn bộ
    const allSlots = await appointmentRepo.findAvailableSlots(fullDate, 30);
    assert.ok(allSlots.length > 0);

    const appointments = jsonStore.getCollection('appointments');
    const mockFull = allSlots.map(time => ({
      id: 'mock-full-' + time.replace(':', ''),
      appointment_date: fullDate,
      appointment_time: time,
      duration_minutes: 30,
      status: 'confirmed',
      customer_name: 'Khách Đặt Hết',
      customer_phone: '0901112233',
      customer_email: 'test-alternate-full@example.com',
      created_at: new Date().toISOString()
    }));
    appointments.push(...mockFull);
    jsonStore.saveCollection('appointments', appointments);

    const originalChat = provider.chat;
    try {
      // 5.1 Kiểm tra tool execute trực tiếp
      const toolResStr = await executeTool('check_available_slots', { date: fullDate }, { conversationId: testConvId, guestSessionId: testGuestId });
      const toolRes = JSON.parse(toolResStr);
      assert.equal(toolRes.success, true);
      assert.equal(toolRes.slots.length, 0, 'Số slot trống phải bằng 0');
      assert.ok(toolRes.next_date, 'Phải gợi ý next_date');
      assert.match(toolRes.message, /kín toàn bộ|không còn giờ trống/i);

      // 5.2 Kiểm tra AI trả lời
      provider.chat = async ({ messages }) => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'tool') {
          const toolData = JSON.parse(lastMsg.content);
          assert.equal(toolData.slots.length, 0);

          return {
            choices: [{
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: `Dạ, ngày ${toolData.date} salon hiện đã kín toàn bộ lịch rồi ạ. Bạn có muốn em kiểm tra lịch của ngày tiếp theo (${toolData.next_date}) không ạ?`
              }
            }]
          };
        }

        return {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_check_full',
                type: 'function',
                function: {
                  name: 'check_available_slots',
                  arguments: JSON.stringify({ date: fullDate })
                }
              }]
            }
          }]
        };
      };

      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: `Còn trống khung giờ nào vào ngày ${fullDate} không?`
      });

      assert.match(res.content, /kín/i, 'Phải thông báo ngày đã kín lịch');
      assert.match(res.content, /ngày tiếp theo|ngày mai|ngày khác|kiểm tra/i, 'Phải chủ động đề xuất kiểm tra ngày khác');
    } finally {
      provider.chat = originalChat;
      // Dọn dẹp mock
      const current = jsonStore.getCollection('appointments');
      const cleaned = current.filter(a => !a.id.startsWith('mock-full-'));
      jsonStore.saveCollection('appointments', cleaned);
    }
  });

  test('6. Tình huống 5: Công cụ gặp lỗi hoặc không có dữ liệu -> AI thông báo rõ và đề xuất phương án tiếp theo', async () => {
    // Gọi tool với ngày không hợp lệ hoặc giả lập lỗi
    const errorToolRes = await executeTool('check_available_slots', { date: 'invalid-date-format' }, { conversationId: testConvId, guestSessionId: testGuestId });
    const parsed = JSON.parse(errorToolRes);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('không hợp lệ') || parsed.message.includes('Lỗi'));

    // Giả lập provider offline hoặc lỗi kết nối khi khách hỏi giờ trống -> Fallback an toàn kích hoạt
    const originalChat = provider.chat;
    provider.chat = async () => {
      throw new Error('Connection refused to AI backend');
    };

    try {
      const res = await orchestrator.chat({
        conversationId: testConvId,
        guestSessionId: testGuestId,
        userMessage: 'Còn khung giờ nào trống không bạn?'
      });

      // Kiểm tra khi AI provider lỗi nhưng là câu hỏi giờ trống, Orchestrator vẫn tự tra cứu DB và trả lời danh sách giờ trống!
      assert.ok(res.content.includes('khung giờ trống') || res.content.includes('bận') || res.content.includes('Chat với nhân viên'));
    } finally {
      provider.chat = originalChat;
    }
  });

  test('7. Kiểm tra các biến thể câu hỏi tra cứu lịch trống tiếng Việt', () => {
    const testCases = [
      'Còn trống khung giờ khác không?',
      'Còn giờ nào trống không?',
      'Có giờ khác không?',
      'Có khung giờ nào khác không bạn?',
      'Xem lịch trống ngày mai',
      'Ngày mai còn slot nào không?',
      'Còn chỗ nào khác không?',
      'Cho mình xem danh sách khung giờ trống',
      'Mấy giờ còn trống vậy em?',
    ];

    for (const phrase of testCases) {
      assert.equal(detectAvailableSlotsQuery(phrase), true, `Cụm từ "${phrase}" phải được nhận diện là tra cứu giờ trống`);
    }

    // Những câu không phải tra cứu lịch trống
    assert.equal(detectAvailableSlotsQuery('Cắt tóc giá bao nhiêu?'), false);
    assert.equal(detectAvailableSlotsQuery('Địa chỉ salon ở đâu?'), false);
    assert.equal(detectAvailableSlotsQuery('Tôi tên là Nam'), false);
  });

  test('8. Kiểm tra trích xuất giờ khách chọn', () => {
    assert.equal(extractTimeFromText('Mình chọn 11:00'), '11:00');
    assert.equal(extractTimeFromText('11h nhé'), '11:00');
    assert.equal(extractTimeFromText('Lấy ca 14h30'), '14:30');
    assert.equal(extractTimeFromText('Cho mình đặt lúc 9 giờ'), '09:00');
    assert.equal(extractTimeFromText('08:30 nha bạn'), '08:30');
    assert.equal(extractTimeFromText('Chào bạn'), null);
  });

});
