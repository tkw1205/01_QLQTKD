'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../src/ai/provider');
const orchestrator = require('../src/ai/orchestrator');
const { executeTool, getVietnamDate, getNextDate, detectAvailableSlotsQuery, extractTimeFromText } = require('../src/ai/tools');
const conversationService = require('../src/services/conversationService');
const conversationRepo = require('../src/repositories/conversationRepository');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const productRepository = require('../src/repositories/productRepository');
const jsonStore = require('../src/config/jsonStore');

describe('AI Alternate Slots & Booking Flow Test Suite', () => {
  const testGuestId = 'guest-test-alternate-slots';
  const isolatedBookingSessions = [];
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
    await conversationRepo.updateChatContext(testConvId, {
      booking_intent_pending: false,
      booking_started: false,
      booking_requested_category: null,
      selected_service_ids: [],
      booking_confirmation_pending: false,
    });
  });

  async function setAvailabilityContext(date = tomorrow) {
    const service = (await productRepository.findAll({
      status: 'active',
      page: 1,
      limit: 1000,
    })).rows.find(item => item.name === 'Cắt tạo kiểu');
    assert.ok(service);
    await conversationRepo.updateChatContext(testConvId, {
      selected_service_ids: [service.id],
      selected_service_source: 'service_consultation',
      hair_size: 'M',
      appointment_date: date,
      availability_query_pending: false,
      availability_query_date: null,
    });
    return service;
  }

  after(async () => {
    // Clean up test appointments
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a => !a.customer_email?.includes('test-alternate') && a.conversation_id !== testConvId && a.id !== 'mock-occupied-1030');
    jsonStore.saveCollection('appointments', cleaned);
    const isolatedSessionIds = new Set(isolatedBookingSessions.map(item => item.guestSessionId));
    const isolatedConversationIds = new Set(isolatedBookingSessions.map(item => item.conversationId));
    jsonStore.saveCollection(
      'conversations',
      jsonStore.loadCollection('conversations').filter(item => !isolatedSessionIds.has(item.guest_session_id))
    );
    jsonStore.saveCollection(
      'messages',
      jsonStore.loadCollection('messages').filter(item => !isolatedConversationIds.has(item.conversation_id))
    );
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

    const guestSessionId = `guest-test-alternate-conflict-${Date.now()}`;
    const conversation = await conversationService.getOrCreate({ guestSessionId });
    isolatedBookingSessions.push({ guestSessionId, conversationId: conversation.id });
    const res = await orchestrator.chat({
      conversationId: conversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn đặt lịch Uốn mái / phồng mái tóc ngang vai lúc 10:30 ngày mai'
    });

    assert.match(res.content, /10:30|đã có khách đặt|không còn trống|đã kín/i, 'Phải thông báo rõ khung giờ đó đã kín');
    assert.doesNotMatch(res.content, /giữ chỗ tạm thời.*(?:5|10) phút/i, 'KHÔNG được thông báo giữ chỗ khi slot đã kín');
    assert.equal(await appointmentRepo.findActiveHoldByConversation(conversation.id), null);
  });

  test('2. Availability query checks the selected service and returns actual backend slots', async () => {
    await setAvailabilityContext();
    const res = await orchestrator.chat({
      conversationId: testConvId,
      guestSessionId: testGuestId,
      userMessage: 'Còn trống khung giờ khác không?',
    });

    assert.match(res.content, /khung giờ trống|khung giờ còn trống/i);
    assert.match(res.content, /\b\d{2}:\d{2}\b/u, 'Phải chứa khung giờ thực tế từ backend');
    assert.doesNotMatch(res.content, /10:30/, 'Không được chứa giờ 10:30 đã kín');
  });

  test('3. Tình huống 2b: Availability query uses the backend directly without relying on the LLM', async () => {
    await setAvailabilityContext();
    const res = await orchestrator.chat({
      conversationId: testConvId,
      guestSessionId: testGuestId,
      userMessage: 'Có giờ khác không bạn?',
    });

    assert.match(res.content, /khung giờ/i);
    assert.match(res.content, /\b\d{2}:\d{2}\b/u);
  });

  test('4. Khách chọn giờ còn trống -> backend giữ giờ trước khi AI thu thập thông tin', async t => {
    const originalChat = provider.chat;
    const originalIsConfigured = provider.isConfigured;
    t.after(() => {
      provider.chat = originalChat;
      provider.isConfigured = originalIsConfigured;
    });
    provider.isConfigured = () => true;
    provider.chat = async ({ messages }) => {
      const prompt = messages.find(message => message.role === 'system')?.content || '';
      const latestUserMessage = [...messages].reverse()
        .find(message => message.role === 'user')?.content || '';
      const time = latestUserMessage.match(/\b\d{2}:\d{2}\b/u)?.[0] ||
        prompt.match(/^- Giờ khách chọn: (.+)$/m)?.[1];
      const date = prompt.match(/^- Ngày khách chọn: (.+)$/m)?.[1];
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: `Dạ, ${time} ngày ${date} đã được hệ thống giữ. Anh/chị vui lòng cung cấp họ tên và số điện thoại ạ.`,
          },
        }],
      };
    };

    const guestSessionId = `guest-test-alternate-selection-${Date.now()}`;
    const conversation = await conversationService.getOrCreate({ guestSessionId });
    isolatedBookingSessions.push({ guestSessionId, conversationId: conversation.id });
    const service = (await productRepository.findAll({ status: 'active', page: 1, limit: 1000 }))
      .rows.find(item => item.name === 'Uốn mái / phồng mái');
    assert.ok(service);
    const available = JSON.parse(await executeTool('check_available_slots', {
      date: tomorrow,
      product_ids: [service.id],
      hair_size: 'M',
    }, { conversationId: conversation.id, guestSessionId }));
    assert.ok(available.slots.length > 0);
    const selectedTime = available.slots[0];

    await orchestrator.chat({
      conversationId: conversation.id,
      guestSessionId,
      userMessage: 'Tôi muốn đặt lịch Uốn mái / phồng mái ngày mai'
    });
    await orchestrator.chat({
      conversationId: conversation.id,
      guestSessionId,
      userMessage: 'Tóc ngang vai'
    });
    const res = await orchestrator.chat({
      conversationId: conversation.id,
      guestSessionId,
      userMessage: `Mình chọn ${selectedTime}`
    });

    assert.match(res.content, new RegExp(selectedTime));
    assert.match(res.content, /họ tên|số điện thoại/i, 'Tiếp tục thu thập thông tin cá nhân khách');
    assert.doesNotMatch(res.content, /giữ chỗ tạm thời/i);
    const activeHold = await appointmentRepo.findActiveHoldByConversation(conversation.id);
    assert.equal(activeHold.appointment_time, selectedTime);
  });

  test('5. Tình huống 4: Ngày đó kín toàn bộ lịch -> AI thông báo kín và chủ động đề xuất kiểm tra ngày tiếp theo', async () => {
    const fullDate = '2026-11-20';
    await setAvailabilityContext(fullDate);
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

      assert.match(res.content, /không có khung giờ|không còn/iu, 'Phải thông báo ngày đã kín lịch');
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
    await setAvailabilityContext();
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
