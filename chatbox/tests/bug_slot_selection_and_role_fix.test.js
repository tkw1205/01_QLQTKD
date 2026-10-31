'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const conversationRepo = require('../src/repositories/conversationRepository');
const conversationService = require('../src/services/conversationService');
const messageRepo = require('../src/repositories/messageRepository');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const productRepo = require('../src/repositories/productRepository');
const {
  detectIntent,
  extractTimeFromText,
  extractTimeFromUserAndHistory,
  extractDateFromText,
  extractDateFromUserAndHistory,
  detectAvailableSlotsQuery,
  executeTool,
  formatSlotsReply,
} = require('../src/ai/tools');
const orchestrator = require('../src/ai/orchestrator');
const jsonStore = require('../src/config/jsonStore');

describe('SUITE: BUG FIX VERIFICATION - TIME SLOT SELECTION, CONTEXT CONTINUITY & ROLE COMPLIANCE', () => {
  const targetDate = '2026-11-03';
  const targetTime = '14:00';
  const alternateTime = '15:00';
  const layerServiceId = '22222222-2222-2222-2222-222222222001'; // Cắt & tạo kiểu Layer hiện đại
  let originalAppointments = [];

  const cleanupTestAppointments = () => {
    const appts = jsonStore.getCollection('appointments') || [];
    const cleaned = appts.filter(a =>
      !(a.appointment_date === targetDate && (a.appointment_time === targetTime || a.appointment_time === alternateTime)) &&
      a.customer_phone !== '0901234567' &&
      a.customer_phone !== '0909888999'
    );
    jsonStore.saveCollection('appointments', cleaned);
  };

  before(async () => {
    originalAppointments = JSON.parse(JSON.stringify(jsonStore.getCollection('appointments') || []));
    cleanupTestAppointments();
  });

  beforeEach(() => {
    cleanupTestAppointments();
  });

  after(() => {
    // Khôi phục dữ liệu ban đầu
    if (originalAppointments.length > 0) {
      jsonStore.saveCollection('appointments', originalAppointments);
    }
  });

  // =========================================================================
  // 1. UNIT TESTS
  // =========================================================================
  describe('1. Unit Tests - Intent Recognition & Time Extraction', () => {
    test('1.1. Nhận diện các biến thể chọn giờ: "Cho t lịch 14:00" -> Intent: SELECT_TIME_SLOT', () => {
      const intent = detectIntent('Cho t lịch 14:00.');
      assert.equal(intent, 'SELECT_TIME_SLOT');
      const time = extractTimeFromText('Cho t lịch 14:00.');
      assert.equal(time, '14:00');
    });

    test('1.2. Nhận diện: "T muốn lịch lúc 14:00." -> Intent: SELECT_TIME_SLOT', () => {
      const intent = detectIntent('T muốn lịch lúc 14:00.');
      assert.equal(intent, 'SELECT_TIME_SLOT');
      const time = extractTimeFromText('T muốn lịch lúc 14:00.');
      assert.equal(time, '14:00');
    });

    test('1.3. Nhận diện các dạng viết tắt và tự nhiên: "14h", "14 giờ", "2 giờ chiều"', () => {
      assert.equal(extractTimeFromText('14h'), '14:00');
      assert.equal(extractTimeFromText('Tôi chọn 14 giờ'), '14:00');
      assert.equal(extractTimeFromText('Lấy cho tôi giờ 2 giờ chiều.'), '14:00');
      assert.equal(extractTimeFromText('2 rưỡi chiều'), '14:30');
      assert.equal(extractTimeFromText('8 giờ sáng'), '08:00');
    });

    test('1.4. Phân biệt rõ CHECK_AVAILABILITY vs SELECT_TIME_SLOT', () => {
      const askSlots = 'T muốn đặt lịch làm tóc ngày 3/11, ngày đó còn những lịch trống nào?';
      assert.equal(detectIntent(askSlots), 'CHECK_AVAILABILITY');
      assert.equal(detectAvailableSlotsQuery(askSlots), true);

      const pickSlot = 'Cho t lịch 14:00.';
      assert.equal(detectIntent(pickSlot), 'SELECT_TIME_SLOT');
      assert.equal(detectAvailableSlotsQuery(pickSlot), false, 'Chọn giờ không được xem là query hỏi toàn bộ giờ trống');
    });

    test('1.5. Nhận diện chọn giờ theo vị trí: "Tôi chọn giờ đầu tiên"', () => {
      const intent = detectIntent('Tôi chọn giờ đầu tiên');
      assert.equal(intent, 'SELECT_TIME_SLOT');
    });

    test('1.6. Nhận diện đổi khung giờ: "Đổi sang 15:00" -> Intent: CHANGE_TIME_SLOT', () => {
      const intent = detectIntent('Đổi sang 15:00');
      assert.equal(intent, 'CHANGE_TIME_SLOT');
      assert.equal(extractTimeFromText('Đổi sang 15:00'), '15:00');
    });

    test('1.7. Booking State lưu trữ và đồng bộ đầy đủ các trường', async () => {
      const sid = 'test-unit-booking-state-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      await conversationRepo.updateBookingState(conv.id, {
        date: targetDate,
        time: targetTime,
        available_slots: ['08:30', '09:00', '14:00', '15:00'],
        time_selection_status: 'pending_confirmation',
        booking_status: 'slot_selected',
      });

      const updated = await conversationRepo.findById(conv.id);
      assert.equal(updated.booking_state.booking_date, targetDate);
      assert.equal(updated.booking_state.date, targetDate);
      assert.equal(updated.booking_state.selected_time, targetTime);
      assert.equal(updated.booking_state.time, targetTime);
      assert.equal(updated.booking_state.time_selection_status, 'pending_confirmation');
      assert.ok(Array.isArray(updated.booking_state.available_slots));
      assert.ok(updated.booking_state.available_slots.includes('14:00'));
    });

    test('1.8. Kiểm tra tính khả dụng của slot bằng validateSlotAvailability', async () => {
      const check = await appointmentService.validateSlotAvailability(targetDate, '14:00', 45);
      assert.equal(check.available, true);
      assert.equal(check.date, targetDate);
      assert.equal(check.time, '14:00');
    });
  });

  // =========================================================================
  // 2. INTEGRATION TESTS
  // =========================================================================
  describe('2. Integration Tests - Tool Execution & State Persistence', () => {
    test('2.1. Tool check_available_slots không chứa câu văn sai vai trò trong output message', async () => {
      const toolRes = await executeTool('check_available_slots', { date: targetDate });
      const parsed = JSON.parse(toolRes);
      assert.equal(parsed.success, true);
      assert.ok(Array.isArray(parsed.slots));
      // Không được chứa các câu chỉ dẫn ngôi thứ 3
      assert.equal(parsed.message.includes('khách hàng của bạn'), false);
      assert.equal(parsed.message.includes('Hãy giới thiệu các khung giờ này cho khách'), false);
      assert.equal(parsed.message.includes('Hãy hỏi khách'), false);
    });

    test('2.2. Tool search_services không chứa câu văn sai vai trò', async () => {
      const toolRes = await executeTool('search_services', { query: 'cắt layer' });
      const parsed = JSON.parse(toolRes);
      assert.equal(parsed.success, true);
      assert.equal(parsed.message.includes('khách hàng của bạn'), false);
    });

    test('2.3. Tool hold_appointment_slot không chứa câu văn sai vai trò', async () => {
      const toolRes = await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: '14:00',
      });
      const parsed = JSON.parse(toolRes);
      assert.equal(String(parsed.message).includes('khách hàng của bạn'), false);
    });

    test('2.4. Trích xuất giờ từ lịch sử hội thoại khi tin nhắn hiện tại không nhắc lại giờ', () => {
      const history = [
        { sender_type: 'user', content: 'Cho t lịch 14:00.' },
        { sender_type: 'assistant', content: 'Dạ, khung giờ 14:00 ngày 2026-11-03 hiện đang còn trống.' },
      ];
      const extractedTime = extractTimeFromUserAndHistory('Đúng rồi bạn nhé', history);
      assert.equal(extractedTime, '14:00');
    });
  });

  // =========================================================================
  // 3. END-TO-END TESTS (7 TEST CASES THEO ĐÚNG YÊU CẦU ĐỀ BÀI)
  // =========================================================================
  describe('3. End-to-End Tests - Theo 7 Test Cases bắt buộc', () => {
    test('TEST CASE 01: Chọn giờ có sẵn -> AI xác nhận 14:00 còn trống, không trả lại danh sách giờ', async () => {
      const sid = 'session-testcase-01-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      // Bước 1: Khách hỏi lịch trống
      const turn1 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn đặt lịch làm tóc ngày 3/11/2026.',
      });
      assert.ok(turn1.message.content.includes('14:00'), 'Lượt 1 phải có 14:00 trong danh sách');
      assert.ok(turn1.message.content.includes('08:30'), 'Lượt 1 phải liệt kê các khung giờ');

      // Bước 2: Khách chọn giờ 14:00
      const turn2 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Cho t lịch 14:00.',
      });

      const reply = turn2.message.content;
      // 1. Phải xác nhận 14:00 còn trống
      assert.ok(reply.includes('14:00'), 'Phải đề cập giờ 14:00');
      assert.ok(reply.includes('còn trống'), 'Phải xác nhận 14:00 hiện đang còn trống');
      // 2. Không được trả lại toàn bộ danh sách giờ
      assert.equal(reply.includes('08:30, 09:00, 09:30'), false, 'Tuyệt đối không được trả lại toàn bộ danh sách giờ');
      // 3. Không yêu cầu khách chọn lại
      assert.equal(reply.includes('chọn một khung giờ phù hợp với lịch làm việc của khách hàng'), false);
      // 4. Booking State phải lưu selected_time = 14:00
      const updatedConv = await conversationRepo.findById(conv.id);
      assert.equal(updatedConv.booking_state.selected_time, '14:00');
      assert.equal(updatedConv.booking_state.time_selection_status, 'pending_confirmation');
    });

    test('TEST CASE 02: Khách hàng nhắc lại giờ đã chọn -> Duy trì ngày, không lặp lại truy vấn toàn bộ slot', async () => {
      const sid = 'session-testcase-02-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      // 1. "T muốn lịch ngày 3/11."
      await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn lịch ngày 3/11/2026.',
      });

      // 2. "Cho t lịch 14:00."
      await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Cho t lịch 14:00.',
      });

      // 3. "T muốn lịch lúc 14:00." (Nhắc lại)
      const turn3 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn lịch lúc 14:00.',
      });

      const reply = turn3.message.content;
      assert.ok(reply.includes('14:00'), 'Lượt 3 phải ghi nhận 14:00');
      assert.ok(reply.includes('2026-11-03') || reply.includes('03/11/2026') || reply.includes('3/11'), 'Phải duy trì đúng ngày');
      assert.equal(reply.includes('08:30, 09:00, 09:30'), false, 'Không được lặp lại việc truy vấn toàn bộ lịch trống');
      assert.equal(reply.includes('giới thiệu cho khách hàng của bạn'), false, 'Không xuất hiện câu sai vai trò');

      const updatedConv = await conversationRepo.findById(conv.id);
      assert.equal(updatedConv.booking_state.selected_time, '14:00');
    });

    test('TEST CASE 03: Chọn giờ không còn trống -> Không xác nhận, đề xuất giờ khác có thật', async () => {
      const sid = 'session-testcase-03-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      // Chiếm trước giờ 14:00 ngày 2026-11-03
      const holdAppt = await appointmentService.holdSlot({
        conversationId: 'temp-other-conv',
        guestSessionId: 'temp-other-guest',
        appointmentDate: targetDate,
        appointmentTime: '14:00',
      });

      try {
        // Thiết lập ngày hẹn trong state
        await conversationRepo.updateBookingState(conv.id, {
          date: targetDate,
          booking_date: targetDate,
        });

        // Khách yêu cầu chọn giờ 14:00 (lúc này đã bị chiếm)
        const turn = await conversationService.sendMessage(conv.id, {
          guestSessionId: sid,
          content: 'Cho tôi lịch 14:00.',
        });

        const reply = turn.message.content;
        assert.ok(reply.includes('không còn khả dụng') || reply.includes('đã có khách đặt') || reply.includes('đã có người đặt'));
        assert.ok(reply.includes('khung giờ trống') || reply.includes('khung giờ khác'));
        assert.ok(reply.includes('2026-11-03') || reply.includes('03/11/2026') || reply.includes('ngày'), 'Phải giữ nguyên ngày đã chọn');
      } finally {
        // Giải phóng slot giữ chỗ tạm
        if (holdAppt && holdAppt.holding_token) {
          await appointmentService.releaseHoldSlot({ holdingToken: holdAppt.holding_token });
        }
      }
    });

    test('TEST CASE 04: Chọn giờ khác sau khi đã chọn giờ trước (Đổi sang 15:00)', async () => {
      const sid = 'session-testcase-04-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      // Bước 1: Khởi tạo ngày và chọn 14:00
      await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn đặt lịch ngày 3/11/2026.',
      });
      await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Cho t lịch 14:00.',
      });

      // Bước 2: Yêu cầu đổi thành 15:00
      const turnChange = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Đổi sang 15:00 nhé.',
      });

      const reply = turnChange.message.content;
      assert.ok(reply.includes('15:00'), 'Phải xác nhận giờ mới 15:00');
      assert.ok(reply.includes('2026-11-03') || reply.includes('03/11/2026') || reply.includes('3/11'), 'Phải giữ nguyên ngày');

      const updatedConv = await conversationRepo.findById(conv.id);
      assert.equal(updatedConv.booking_state.selected_time, '15:00', 'Chỉ giữ giờ mới 15:00');
      assert.notEqual(updatedConv.booking_state.selected_time, '14:00', 'Không giữ đồng thời giờ cũ');
    });

    test('TEST CASE 05: Chọn giờ bằng cách diễn đạt tự nhiên', async () => {
      const testCases = [
        { text: 'Lấy cho tôi giờ 2 giờ chiều.', expected: '14:00' },
        { text: 'Tôi chọn 14h nhé.', expected: '14:00' },
        { text: 'Cho mình khung giờ 14 giờ.', expected: '14:00' },
      ];

      for (const tc of testCases) {
        const sid = 'session-natural-' + Date.now() + Math.random().toString(36).slice(2, 6);
        const conv = await conversationService.getOrCreate(sid, null);

        // Khởi tạo ngày
        await conversationService.sendMessage(conv.id, {
          guestSessionId: sid,
          content: 'Làm tóc ngày 3/11/2026.',
        });

        const turn = await conversationService.sendMessage(conv.id, {
          guestSessionId: sid,
          content: tc.text,
        });

        assert.ok(turn.message.content.includes(tc.expected), `Câu "${tc.text}" phải được hiểu là ${tc.expected}`);
        const updated = await conversationRepo.findById(conv.id);
        assert.equal(updated.booking_state.selected_time, tc.expected);
      }
    });

    test('TEST CASE 06: Phản hồi đúng vai trò 100% (Role Compliance)', async () => {
      const sid = 'session-role-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      const turn1 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn đặt lịch làm tóc ngày 3/11, ngày đó còn những lịch trống nào?',
      });
      const turn2 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Cho t lịch 14:00.',
      });
      const turn3 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn lịch lúc 14:00.',
      });

      const allReplies = [turn1.message.content, turn2.message.content, turn3.message.content].join(' ');
      assert.equal(allReplies.includes('khách hàng của bạn'), false, 'Tuyệt đối không có "khách hàng của bạn"');
      assert.equal(allReplies.includes('tư vấn cho khách hàng của bạn'), false, 'Tuyệt đối không có "tư vấn cho khách hàng của bạn"');
      assert.equal(allReplies.includes('giới thiệu cho khách hàng của bạn'), false, 'Tuyệt đối không có "giới thiệu cho khách hàng của bạn"');
      assert.equal(allReplies.includes('lịch làm việc của khách hàng'), false, 'Tuyệt đối không có "lịch làm việc của khách hàng"');
    });

    test('TEST CASE 07: Kiểm tra toàn bộ quy trình đặt lịch xuyên suốt', async () => {
      const sid = 'session-full-flow-' + Date.now();
      const conv = await conversationService.getOrCreate(sid, null);

      // 1. Chọn ngày & kiểm tra lịch trống
      const t1 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'T muốn đặt lịch làm tóc ngày 3/11/2026, ngày đó còn những lịch trống nào?',
      });
      assert.ok(t1.message.content.includes('14:00'));

      // 2. Chọn giờ
      const t2 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Cho t lịch 14:00.',
      });
      assert.ok(t2.message.content.includes('14:00'));
      assert.ok(t2.message.content.includes('còn trống'));

      // 3. Chọn dịch vụ
      const t3 = await conversationService.sendMessage(conv.id, {
        guestSessionId: sid,
        content: 'Layer.',
      });
      assert.ok(t3.message.content.includes('Cắt & tạo kiểu Layer hiện đại'));
      assert.ok(t3.message.content.includes('14:00'));

      // 4. Giữ chỗ thực tế qua Tool/Backend
      const holdRes = await appointmentService.holdSlot({
        conversationId: conv.id,
        guestSessionId: sid,
        appointmentDate: targetDate,
        appointmentTime: targetTime,
        productId: layerServiceId,
      });
      assert.ok(holdRes.holding_token);
      assert.equal(holdRes.appointment_time, targetTime);
      assert.equal(holdRes.appointment_date, targetDate);

      // 5. Xác nhận chốt đặt lịch với thông tin khách
      const confirmRes = await appointmentService.confirmHoldingSlot({
        holdingToken: holdRes.holding_token,
        customerName: 'Nguyễn Văn Test',
        customerPhone: '0901234567',
        customerEmail: 'test@example.com',
        guestSessionId: sid,
      });

      assert.ok(confirmRes.booking_code, 'Phải có mã đặt lịch thực tế');
      assert.equal(confirmRes.customer_name, 'Nguyễn Văn Test');
      assert.equal(confirmRes.customer_phone, '0901234567');
      assert.equal(confirmRes.status, 'confirmed');

      // 6. Kiểm tra lịch đã lưu trong Database
      const savedInDb = await appointmentRepo.findById(confirmRes.id);
      assert.ok(savedInDb);
      assert.equal(savedInDb.booking_code, confirmRes.booking_code);
    });
  });

  // =========================================================================
  // 4. REGRESSION TESTS
  // =========================================================================
  describe('4. Regression Tests - Các chức năng khác không bị ảnh hưởng', () => {
    test('4.1. Tra cứu danh mục dịch vụ hoạt động bình thường', async () => {
      const prods = await productRepo.findAll({ status: 'active' });
      assert.ok(prods.rows.length > 0);
    });

    test('4.2. get_business_hours trả về giờ mở cửa', async () => {
      const bh = await appointmentService.getBusinessHours();
      assert.ok(bh.workingHours);
      assert.equal(bh.open_time, '08:30');
      assert.equal(bh.close_time, '20:30');
    });

    test('4.3. Hủy lịch hẹn hoạt động đúng quyền', async () => {
      const cancelResStr = await executeTool('cancel_appointment', { appointment_id: 'non-existing-id' }, { guestSessionId: 'guest-1' });
      const parsed = JSON.parse(cancelResStr);
      assert.equal(parsed.success, false);
    });
  });
});
