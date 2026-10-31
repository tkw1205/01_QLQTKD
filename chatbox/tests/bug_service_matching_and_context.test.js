'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/app');
const productRepo = require('../src/repositories/productRepository');
const conversationRepo = require('../src/repositories/conversationRepository');
const conversationService = require('../src/services/conversationService');
const messageRepo = require('../src/repositories/messageRepository');
const appointmentService = require('../src/services/appointmentService');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const {
  executeTool,
  extractDateFromText,
  extractDateFromUserAndHistory,
  extractTimeFromText,
  extractTimeFromUserAndHistory,
  extractServiceFromUserAndHistory,
} = require('../src/ai/tools');
const orchestrator = require('../src/ai/orchestrator');
const jsonStore = require('../src/config/jsonStore');
const { signToken } = require('../src/config/jwt');

describe('SUITE: BUG FIX VERIFICATION - SERVICE MATCHING, CONTEXT CONTINUITY & BOOKING WORKFLOW', () => {
  const targetDate = '2026-11-03';
  const targetTime = '17:00';
  const layerServiceId = '22222222-2222-2222-2222-222222222001'; // Cắt & tạo kiểu Layer hiện đại
  const testGuestSession = 'guest-session-test-bug-fix-001';
  let testConv;
  let server;
  let serverUrl;
  let adminToken;
  let originalAppointments = [];

  before(async () => {
    originalAppointments = JSON.parse(JSON.stringify(jsonStore.getCollection('appointments') || []));

    // Dọn dẹp appointment test
    const appts = jsonStore.loadCollection('appointments', []);
    const cleaned = appts.filter(a =>
      !(a.appointment_date === targetDate && a.appointment_time === targetTime) &&
      a.customer_phone !== '0909888999'
    );
    jsonStore.saveCollection('appointments', cleaned);

    // Khởi tạo conversation test
    testConv = await conversationService.getOrCreate(testGuestSession, null);

    // Khởi tạo HTTP Server test
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    serverUrl = `http://127.0.0.1:${port}`;

    adminToken = signToken({ userId: '00000000-0000-0000-0000-000000000001', role: 'admin' });
  });

  after(async () => {
    jsonStore.saveCollection('appointments', originalAppointments);

    if (server) {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // 1. UNIT TESTS: SERVICE MATCHING & ALIASES
  // =========================================================================
  describe('1. Unit Tests - Service Matching & Aliases', () => {
    test('1.1. Nhận diện "Layer" -> khớp "Cắt & tạo kiểu Layer hiện đại" với Service ID chuẩn', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('Layer');
      assert.equal(match.matched, true);
      assert.equal(match.service.id, layerServiceId);
      assert.equal(match.service.name, 'Cắt & tạo kiểu Layer hiện đại');
      assert.equal(match.service.duration, 45);
      assert.equal(match.service.price, 150000);
    });

    test('1.2. Nhận diện "cắt tóc layer ngang vai" -> khớp chính xác dịch vụ Layer', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('cắt tóc layer ngang vai');
      assert.equal(match.matched, true);
      assert.equal(match.service.id, layerServiceId);
      assert.equal(match.service.name, 'Cắt & tạo kiểu Layer hiện đại');
    });

    test('1.3. Nhận diện các biến thể không dấu: "cat toc layer", "layer nu", "cat layer ngang vai"', async () => {
      const variants = ['cat toc layer', 'layer nu', 'cat layer ngang vai', 'layer dai', 'toc layer'];
      for (const v of variants) {
        const match = await productRepo.matchServiceByNameOrAlias(v);
        assert.equal(match.matched, true, `Biến thể "${v}" phải được nhận diện`);
        assert.equal(match.service.id, layerServiceId);
      }
    });

    test('1.4. Nhận diện dịch vụ khác: Bob / Pixie, Gội đầu thảo dược, Uốn sóng lơi', async () => {
      const bobMatch = await productRepo.matchServiceByNameOrAlias('cắt tóc bob');
      assert.equal(bobMatch.matched, true);
      assert.equal(bobMatch.service.name, 'Cắt tóc Bob / Pixie thời thượng');

      const washMatch = await productRepo.matchServiceByNameOrAlias('gội đầu dưỡng sinh');
      assert.equal(washMatch.matched, true);
      assert.equal(washMatch.service.name, 'Gội đầu thảo dược dưỡng sinh');

      const permMatch = await productRepo.matchServiceByNameOrAlias('uốn sóng lơi');
      assert.equal(permMatch.matched, true);
      assert.equal(permMatch.service.name, 'Uốn sóng lơi Hàn Quốc nhẹ nhàng');
    });

    test('1.5. Xử lý dịch vụ không tồn tại -> Trả về not_found và danh sách gợi ý thực tế', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('dịch vụ bay lên sao hỏa không có');
      assert.equal(match.matched, false);
      assert.equal(match.not_found, true);
      assert.ok(Array.isArray(match.candidates));
      assert.ok(match.candidates.length > 0);
    });

    test('1.6. Xử lý từ khóa chung chung (nhiều kết quả tương tự) -> Báo ambiguous', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('nhuộm');
      assert.equal(match.matched, false);
      assert.equal(match.ambiguous, true);
      assert.ok(match.candidates.length >= 2, 'Phải có ít nhất 2 ứng viên nhuộm');
    });

    test('1.7. Trích xuất giờ từ text: "17:00", "17h", "17 giờ"', () => {
      assert.equal(extractTimeFromText('T muốn đặt lịch lúc 17:00'), '17:00');
      assert.equal(extractTimeFromText('tôi chọn 17h chiều'), '17:00');
      assert.equal(extractTimeFromText('đặt lúc 17 giờ nhé'), '17:00');
      assert.equal(extractTimeFromText('09:30 sáng'), '09:30');
    });

    test('1.8. Trích xuất giờ từ lịch sử hội thoại khi câu hiện tại không có giờ', () => {
      const history = [
        { sender_type: 'user', content: 'T muốn đặt lịch ngày 3/11/2026' },
        { sender_type: 'assistant', content: 'Ngày đó còn các giờ: 16:00, 17:00, 18:00' },
        { sender_type: 'user', content: 'T muốn đặt lịch lúc 17:00.' },
        { sender_type: 'assistant', content: 'Khung giờ 17:00 có sẵn.' },
      ];
      const extractedTime = extractTimeFromUserAndHistory('Layer.', history);
      assert.equal(extractedTime, '17:00', 'Phải duy trì được 17:00 từ tin nhắn trước của user');
    });
  });

  // =========================================================================
  // 2. INTEGRATION TESTS: TOOL CALLING & STATE TRACKING
  // =========================================================================
  describe('2. Integration Tests - Tool Calling & State Persistence', () => {
    test('2.1. Tool search_services trả về đúng Service ID, thời lượng và giá tiền', async () => {
      const resStr = await executeTool('search_services', { query: 'cắt tóc layer ngang vai' }, {
        conversationId: testConv.id,
        guestSessionId: testGuestSession,
      });
      const res = JSON.parse(resStr);
      assert.equal(res.success, true);
      assert.equal(res.matched, true);
      assert.equal(res.service.id, layerServiceId);
      assert.equal(res.service.duration, 45);
      assert.equal(res.service.price, 150000);
    });

    test('2.2. Tool check_available_slots tự động phân giải product_name thành Service ID và duration chuẩn từ DB', async () => {
      const resStr = await executeTool('check_available_slots', {
        date: targetDate,
        product_name: 'Layer',
      }, {
        conversationId: testConv.id,
        guestSessionId: testGuestSession,
      });
      const res = JSON.parse(resStr);
      assert.equal(res.success, true);
      assert.equal(res.duration, 45, 'Thời lượng phải tự động lấy là 45 phút từ dịch vụ Layer');
      assert.ok(Array.isArray(res.slots));
      assert.ok(res.slots.includes('17:00'), '17:00 phải có trong danh sách slot còn trống');
    });

    test('2.3. Tool hold_appointment_slot tự động phân giải product_name và giữ chỗ thành công', async () => {
      const resStr = await executeTool('hold_appointment_slot', {
        appointment_date: targetDate,
        appointment_time: targetTime,
        product_name: 'cắt tóc layer ngang vai',
      }, {
        conversationId: testConv.id,
        guestSessionId: testGuestSession,
      });
      const res = JSON.parse(resStr);
      assert.equal(res.success, true);
      assert.ok(res.holding_token);
      assert.equal(res.appointment_date, targetDate);
      assert.equal(res.appointment_time, targetTime);
    });

    test('2.4. Lưu và cập nhật Booking State vào Conversation', async () => {
      await conversationRepo.updateBookingState(testConv.id, {
        date: targetDate,
        time: targetTime,
        service_id: layerServiceId,
        service_name: 'Cắt & tạo kiểu Layer hiện đại',
        duration: 45,
        price: 150000,
      });

      const updatedConv = await conversationRepo.findById(testConv.id);
      assert.ok(updatedConv.booking_state);
      assert.equal(updatedConv.booking_state.date, targetDate);
      assert.equal(updatedConv.booking_state.time, targetTime);
      assert.equal(updatedConv.booking_state.service_name, 'Cắt & tạo kiểu Layer hiện đại');
      assert.equal(updatedConv.booking_state.duration, 45);
    });
  });

  // =========================================================================
  // 3. END-TO-END TESTS (TEST CASES 01 -> 07 THEO ĐỀ BÀI)
  // =========================================================================
  describe('3. End-to-End Tests - Theo đúng 7 Test Case yêu cầu', () => {

    test('TEST CASE 01: Nhận diện tên dịch vụ khác với tên trong Database ("Cắt tóc layer ngang vai")', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('Cắt tóc layer ngang vai');
      assert.equal(match.matched, true);
      assert.equal(match.service.id, layerServiceId);
      assert.equal(match.service.name, 'Cắt & tạo kiểu Layer hiện đại');
      assert.equal(match.service.duration, 45);
    });

    test('TEST CASE 02: Khách hàng trả lời ngắn gọn ("Layer.") -> Giữ nguyên ngày 03/11/2026 và giờ 17:00, không hỏi lại', async () => {
      const history = [
        { sender_type: 'user', content: 'T muốn đặt lịch cắt tóc layer ngày 3/11/2026, hôm đó còn những lịch trống nào?' },
        { sender_type: 'assistant', content: 'Dạ ngày 2026-11-03 salon còn các khung giờ: 16:00, 16:30, 17:00, 17:30...' },
        { sender_type: 'user', content: 'T muốn đặt lịch lúc 17:00.' },
        { sender_type: 'assistant', content: 'Khung giờ 17:00 có sẵn. Bạn có muốn đặt lịch tại khung giờ 17:00 không?' },
        { sender_type: 'user', content: 'Đúng vậy t muốn đặt khung giờ 17:00 với dịch vụ là cắt tóc layer ngang vai.' },
        { sender_type: 'assistant', content: 'Dạ, bạn chọn dịch vụ nào?' },
      ];

      const conv = await conversationService.getOrCreate('guest-testcase-02', null);
      const res = await orchestrator.chat({
        conversationId: conv.id,
        guestSessionId: 'guest-testcase-02',
        userMessage: 'Layer.',
        history,
      });

      // AI KHÔNG ĐƯỢC hỏi lại thời gian
      assert.equal(res.content.includes('Đó là lúc nào bạn muốn đặt lịch?'), false, 'Tuyệt đối không được hỏi lại "Đó là lúc nào bạn muốn đặt lịch?"');
      assert.equal(res.content.includes('mấy giờ bạn muốn'), false);
      // AI KHÔNG ĐƯỢC yêu cầu khách tự tính thời lượng
      assert.equal(res.content.includes('tôi cần xác định tổng thời gian'), false);
      // Phải ghi nhận được ngày 03/11/2026 và giờ 17:00
      assert.ok(res.content.includes('17:00'), 'Phải giữ nguyên giờ 17:00');
      assert.ok(res.content.includes('2026-11-03') || res.content.includes('03/11/2026') || res.content.includes('3/11'), 'Phải giữ nguyên ngày 03/11/2026');
    });

    test('TEST CASE 03: Duy trì ngữ cảnh qua toàn bộ 4 lượt hội thoại', async () => {
      const e2eSession = 'guest-session-e2e-conversation';
      const conv = await conversationService.getOrCreate(e2eSession, null);

      // Lượt 1
      const turn1 = await conversationService.sendMessage(conv.id, {
        guestSessionId: e2eSession,
        content: 'T muốn đặt lịch cắt tóc layer ngày 3/11/2026, hôm đó còn những lịch trống nào?',
      });
      assert.ok(turn1.message.content.includes('17:00'), 'Lượt 1 phải trả về danh sách slot có 17:00');

      // Lượt 2
      const turn2 = await conversationService.sendMessage(conv.id, {
        guestSessionId: e2eSession,
        content: 'T muốn đặt lịch lúc 17:00.',
      });
      assert.ok(turn2.message.content.includes('17:00'));

      // Lượt 3
      const turn3 = await conversationService.sendMessage(conv.id, {
        guestSessionId: e2eSession,
        content: 'Đúng vậy t muốn đặt khung giờ 17:00 với dịch vụ là cắt tóc layer ngang vai.',
      });
      // Lượt 3 không được từ chối dịch vụ
      assert.equal(turn3.message.content.includes('không tìm thấy dịch vụ'), false, 'Lượt 3 không được từ chối dịch vụ Layer ngang vai');

      // Lượt 4
      const turn4 = await conversationService.sendMessage(conv.id, {
        guestSessionId: e2eSession,
        content: 'Layer.',
      });
      assert.equal(turn4.message.content.includes('Đó là lúc nào bạn muốn đặt lịch?'), false, 'Lượt 4 không được hỏi lại thời gian');
      assert.ok(turn4.message.content.includes('17:00'));
    });

    test('TEST CASE 04: Tự lấy thời lượng dịch vụ từ Database (không hỏi khách hàng)', async () => {
      const service = await productRepo.findById(layerServiceId);
      assert.equal(service.duration, 45, 'Database phải lưu duration = 45');

      const toolRes = await executeTool('check_available_slots', {
        date: targetDate,
        product_id: layerServiceId,
      });
      const parsed = JSON.parse(toolRes);
      assert.equal(parsed.duration, 45, 'Hệ thống tự lấy thời lượng 45 phút');
    });

    test('TEST CASE 05: Dịch vụ không tồn tại -> Không tự tạo ID ảo, đề xuất dịch vụ có thật', async () => {
      const match = await productRepo.matchServiceByNameOrAlias('nhuộm tóc phát sáng neon trong đêm tối vũ trụ');
      assert.equal(match.matched, false);
      assert.equal(match.not_found, true);
      assert.ok(match.candidates.length > 0, 'Phải có danh sách dịch vụ thật để gợi ý');
      assert.ok(match.candidates.some(c => c.name.includes('Layer') || c.name.includes('Bob') || c.name.includes('Nhuộm')));
    });

    test('TEST CASE 06: Thay đổi thông tin đã xác nhận -> Cập nhật giờ mới (18:00), giữ nguyên ngày và dịch vụ', async () => {
      const history = [
        { sender_type: 'user', content: 'T muốn đặt lịch cắt tóc layer ngày 3/11/2026' },
        { sender_type: 'user', content: 'T muốn đặt lịch lúc 17:00.' },
        { sender_type: 'user', content: 'Dịch vụ là cắt tóc layer ngang vai.' },
      ];

      const newTime = extractTimeFromText('Tôi muốn đổi sang 18:00.');
      assert.equal(newTime, '18:00');

      const keptDate = extractDateFromUserAndHistory('Tôi muốn đổi sang 18:00.', history);
      assert.equal(keptDate, targetDate, 'Ngày 03/11/2026 phải được giữ nguyên');

      const keptService = await extractServiceFromUserAndHistory('Tôi muốn đổi sang 18:00.', history);
      assert.ok(keptService);
      assert.equal(keptService.id, layerServiceId, 'Dịch vụ Layer phải được giữ nguyên');
    });

    test('TEST CASE 07: Đặt lịch hoàn chỉnh -> Tạo lịch thành công trong Database, Admin nhìn thấy', async () => {
      const bookingGuest = 'guest-testcase-07-final';
      const bookingConv = await conversationService.getOrCreate(bookingGuest, null);

      // 1. Giữ chỗ
      const holdRes = await appointmentService.holdSlot({
        conversationId: bookingConv.id,
        guestSessionId: bookingGuest,
        appointmentDate: targetDate,
        appointmentTime: targetTime,
        productId: layerServiceId,
      });
      assert.ok(holdRes.holding_token);

      // 2. Chốt lịch với tên và SĐT
      const confirmRes = await appointmentService.confirmHoldingSlot({
        holdingToken: holdRes.holding_token,
        customerName: 'Trần Thị Thảo Test',
        customerPhone: '0909888999',
        customerEmail: 'thaotran@example.com',
        guestSessionId: bookingGuest,
      });

      assert.ok(confirmRes.booking_code);
      assert.match(confirmRes.booking_code, /^BK-\d{8}-[A-Z0-9]+$/);
      assert.equal(confirmRes.status, 'confirmed');
      assert.equal(confirmRes.appointment_date, targetDate);
      assert.equal(confirmRes.appointment_time, targetTime);
      assert.equal(confirmRes.customer_name, 'Trần Thị Thảo Test');
      assert.equal(confirmRes.customer_phone, '0909888999');

      // 3. Kiểm tra Admin API nhìn thấy lịch hẹn
      const fetchRes = await fetch(`${serverUrl}/api/appointments?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(fetchRes.status, 200);
      const json = await fetchRes.json();
      assert.equal(json.success, true);
      const found = json.data.rows.find(a => a.booking_code === confirmRes.booking_code);
      assert.ok(found, 'Admin API phải nhìn thấy lịch hẹn vừa tạo');
      assert.equal(found.customer_name, 'Trần Thị Thảo Test');
      assert.equal(found.customer_phone, '0909888999');
      assert.equal(found.appointment_time, '17:00');
    });

  });

  // =========================================================================
  // 4. REGRESSION TESTS: CÁC TÍNH NĂNG KHÁC HOẠT ĐỘNG BÌNH THƯỜNG
  // =========================================================================
  describe('4. Regression Tests', () => {
    test('4.1. Xem danh mục sản phẩm (GET /api/products) vẫn trả về danh sách dịch vụ active', async () => {
      const res = await fetch(`${serverUrl}/api/products`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.length >= 10);
    });

    test('4.2. Xem giờ làm việc salon (get_business_hours) hoạt động bình thường', async () => {
      const resStr = await executeTool('get_business_hours', {});
      const res = JSON.parse(resStr);
      assert.ok(res.open_time);
      assert.ok(res.close_time);
    });

    test('4.3. Huỷ lịch hẹn (cancel_appointment) hoạt động đúng quyền', async () => {
      const cancelResStr = await executeTool('cancel_appointment', { appointment_id: 'non-existent-id' }, {
        guestSessionId: testGuestSession,
      });
      const cancelRes = JSON.parse(cancelResStr);
      assert.equal(cancelRes.success, false);
      assert.ok(cancelRes.error);
    });
  });
});
