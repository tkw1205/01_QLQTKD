'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractDateFromText,
  normalizeDateInput,
  extractDateFromUserAndHistory,
  executeTool,
  getVietnamDate,
} = require('../src/ai/tools');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const jsonStore = require('../src/config/jsonStore');

describe('BUG-CHATBOX-SLOT-001: Slot Consistency & Date Parsing Test Suite', () => {
  const currentYear = getVietnamDate(0).split('-')[0];
  const expectedDate = `${currentYear}-11-02`;

  describe('1. Date Extraction & Normalization Tests', () => {
    test('1.1. extractDateFromText trích xuất đúng ngày 2/11 từ câu hỏi tự nhiên', () => {
      const msg1 = 't muốn đặt một lịch làm tóc vào 17:30 ngày 2/11';
      const extracted1 = extractDateFromText(msg1);
      assert.equal(extracted1, expectedDate, 'Phải trích xuất được 2/11 thành YYYY-11-02');

      const msg2 = 'ngày 2/11 còn những lịch trống nào';
      const extracted2 = extractDateFromText(msg2);
      assert.equal(extracted2, expectedDate, 'Phải trích xuất được ngày 2/11 thành YYYY-11-02');

      const msg3 = '02/11';
      assert.equal(extractDateFromText(msg3), expectedDate);

      const msg4 = '2-11';
      assert.equal(extractDateFromText(msg4), expectedDate);

      const msg5 = 'ngày 2 tháng 11';
      assert.equal(extractDateFromText(msg5), expectedDate);
    });

    test('1.2. normalizeDateInput không bị parse nhầm theo chuẩn US (MM/DD)', () => {
      // Trước đây "2/11" bị new Date("2/11") biến thành tháng 2 ngày 11 (2001-02-11)
      const normalized = normalizeDateInput('2/11');
      assert.equal(normalized, expectedDate, '2/11 phải là ngày 2 tháng 11, KHÔNG ĐƯỢC là tháng 2 ngày 11');

      const normalizedWithText = normalizeDateInput('ngày 2/11');
      assert.equal(normalizedWithText, expectedDate);
    });

    test('1.3. extractDateFromUserAndHistory lấy đúng ngày 2/11 từ ngữ cảnh hội thoại', () => {
      // Khi user hỏi "ngày đó còn những lịch trống nào nữa"
      const historyWithUserDate = [
        { sender_type: 'user', content: 't muốn đặt một lịch làm tóc vào 17:30 ngày 2/11' },
        { sender_type: 'assistant', content: 'Rất tiếc, nhưng hiện tại không có lịch trống vào ngày 2/11/2026 vào khung giờ 17:30.' }
      ];

      const targetDate = extractDateFromUserAndHistory('ngày đó còn những lịch trống nào nữa', historyWithUserDate);
      assert.equal(targetDate, expectedDate, 'Phải kế thừa chính xác ngày 2/11 (YYYY-11-02) từ lịch sử chat');
    });
  });

  describe('2. Slot Consistency Between Inquiries', () => {
    let originalAppointments = [];

    before(async () => {
      // Lưu lại danh sách appointments ban đầu
      originalAppointments = JSON.parse(JSON.stringify(jsonStore.getCollection('appointments')));

      // Đảm bảo có lịch hẹn lúc 17:30 ngày 2026-11-02 (duration 45 phút)
      const appointments = jsonStore.getCollection('appointments');
      const existing = appointments.find(a => a.appointment_date === expectedDate && a.appointment_time === '17:30');
      if (!existing) {
        appointments.push({
          id: 'test-booked-appt-1730',
          booking_code: `BK-${expectedDate.replace(/-/g, '')}-TEST`,
          customer_name: 'Nguyễn Thị Thu Hà',
          customer_phone: '0846166245',
          appointment_date: expectedDate,
          appointment_time: '17:30',
          duration_minutes: 45,
          status: 'confirmed',
          created_at: new Date().toISOString()
        });
        jsonStore.saveCollection('appointments', appointments);
      }
    });

    after(async () => {
      // Khôi phục lại appointments ban đầu sau khi test xong
      jsonStore.saveCollection('appointments', originalAppointments);
    });

    test('2.1. Lần hỏi 1: Giữ chỗ/đặt lịch vào 17:30 ngày 2/11 phải báo KHÔNG KHẢ DỤNG do đã có lịch', async () => {
      const holdResStr = await executeTool('hold_appointment_slot', {
        appointment_date: '2/11',
        appointment_time: '17:30',
        duration: 45
      }, { conversationId: 'test-conv-001', guestSessionId: 'test-guest-001' });

      const holdRes = JSON.parse(holdResStr);
      assert.equal(holdRes.success, false, 'Không được phép giữ chỗ khung giờ 17:30 đã có lịch');
      assert.ok(
        holdRes.code === 'SLOT_CONFLICT' || holdRes.code === 'SLOT_UNAVAILABLE',
        `Mã lỗi phải là SLOT_CONFLICT hoặc SLOT_UNAVAILABLE (nhận được: ${holdRes.code})`
      );
      assert.ok(
        !holdRes.available_slots.includes('17:30'),
        'Danh sách gợi ý alternate slots không được phép chứa 17:30'
      );
    });

    test('2.2. Lần hỏi 2: Kiểm tra lịch trống của ngày 2/11 TUYỆT ĐỐI KHÔNG ĐƯỢC chứa 17:30', async () => {
      const slotsResStr = await executeTool('check_available_slots', {
        date: '2/11',
        duration: 45
      }, {});

      const slotsRes = JSON.parse(slotsResStr);
      assert.equal(slotsRes.success, true);
      assert.equal(slotsRes.date, expectedDate);
      assert.ok(Array.isArray(slotsRes.slots), 'slots phải là một mảng');
      assert.ok(slotsRes.slots.length > 0, 'Phải có các khung giờ trống khác trong ngày');

      // Kiểm tra tính nhất quán: 17:30 đã có lịch thì KHÔNG ĐƯỢC có trong slots
      assert.equal(
        slotsRes.slots.includes('17:30'),
        false,
        'LỖI NGHIÊM TRỌNG: Khung giờ 17:30 đã có lịch nhưng vẫn xuất hiện trong danh sách lịch trống!'
      );

      // Do thời lượng 45 phút, khung giờ 17:00 (17:00 - 17:45) và 18:00 (17:30 - 18:15) cũng bị ảnh hưởng
      assert.equal(
        slotsRes.slots.includes('17:00'),
        false,
        'Khung giờ 17:00 bị trùng dịch vụ 45 phút với ca 17:30 nên không được trống'
      );
      assert.equal(
        slotsRes.slots.includes('18:00'),
        false,
        'Khung giờ 18:00 bị trùng dịch vụ 45 phút với ca 17:30 nên không được trống'
      );

      // Các khung giờ khác vẫn phải còn trống bình thường
      assert.ok(slotsRes.slots.includes('08:30'), 'Ca 08:30 sáng phải còn trống');
      assert.ok(slotsRes.slots.includes('14:00'), 'Ca 14:00 chiều phải còn trống');
      assert.ok(slotsRes.slots.includes('18:30'), 'Ca 18:30 tối phải còn trống');
    });

    test('2.3. Lần hỏi 2 với câu tự nhiên "ngày đó còn những lịch trống nào nữa" kế thừa context', async () => {
      const history = [
        { sender_type: 'user', content: 't muốn đặt một lịch làm tóc vào 17:30 ngày 2/11' },
        { sender_type: 'assistant', content: 'Rất tiếc, khung giờ 17:30 ngày 02/11 đã có người đặt.' }
      ];

      const slotsResStr = await executeTool('check_available_slots', {}, { history, targetDate: expectedDate });
      const slotsRes = JSON.parse(slotsResStr);

      assert.equal(slotsRes.success, true);
      assert.equal(slotsRes.date, expectedDate);
      assert.equal(slotsRes.slots.includes('17:30'), false, '17:30 vẫn phải không có trong danh sách');
    });
  });
});
