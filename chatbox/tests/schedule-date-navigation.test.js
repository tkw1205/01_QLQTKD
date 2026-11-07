'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ScheduleDate = require('../public/admin/schedule-date');

const staffPage = fs.readFileSync(
  path.join(__dirname, '../public/admin/staff.html'),
  'utf8'
);

describe('Schedule date navigation', () => {
  test('TC01: Sau từ 06/11/2026 sang 07/11/2026', () => {
    assert.equal(ScheduleDate.shiftDate('2026-11-06', 1), '2026-11-07');
  });

  test('TC02: Trước từ 06/11/2026 về 05/11/2026', () => {
    assert.equal(ScheduleDate.shiftDate('2026-11-06', -1), '2026-11-05');
  });

  test('TC03: Sau ngày cuối tháng chuyển đúng sang tháng mới', () => {
    assert.equal(ScheduleDate.shiftDate('2026-11-30', 1), '2026-12-01');
  });

  test('TC04: Sau ngày cuối năm chuyển đúng sang năm mới', () => {
    assert.equal(ScheduleDate.shiftDate('2026-12-31', 1), '2027-01-01');
  });

  test('TC05: Trước ngày đầu năm chuyển đúng về năm trước', () => {
    assert.equal(ScheduleDate.shiftDate('2027-01-01', -1), '2026-12-31');
  });

  test('TC06: Sau 28/02/2027 chuyển sang 01/03/2027', () => {
    assert.equal(ScheduleDate.shiftDate('2027-02-28', 1), '2027-03-01');
  });

  test('TC07: Năm nhuận có ngày 29/02', () => {
    assert.equal(ScheduleDate.shiftDate('2028-02-28', 1), '2028-02-29');
  });

  test('TC08: Sau liên tục ba lần tăng đúng ba ngày', () => {
    const date = ScheduleDate.shiftDate(
      ScheduleDate.shiftDate(ScheduleDate.shiftDate('2026-11-06', 1), 1),
      1
    );
    assert.equal(date, '2026-11-09');
  });

  test('TC09: Trước liên tục ba lần giảm đúng ba ngày', () => {
    const date = ScheduleDate.shiftDate(
      ScheduleDate.shiftDate(ScheduleDate.shiftDate('2026-11-06', -1), -1),
      -1
    );
    assert.equal(date, '2026-11-03');
  });

  test('TC10: Date picker đồng bộ nhãn và tải lại lịch khi thay đổi', () => {
    assert.match(
      staffPage,
      /scheduleDateInput\.addEventListener\('change',\s*\(\)\s*=>\s*\{\s*updateDateLabel\(\);\s*loadScheduleData\(\);/s
    );
  });

  test('TC11: Hôm nay lấy ngày hiện tại theo giờ địa phương', () => {
    const localNow = new Date(2026, 10, 6, 12, 0, 0);
    assert.equal(ScheduleDate.localDateString(localNow), '2026-11-06');
    assert.match(
      staffPage,
      /btn-today'\)\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*scheduleDateInput\.value\s*=\s*ScheduleDate\.localDateString\(\);/
    );
  });

  test('TC12: Chuyển ngày qua ranh giới tháng/năm không phụ thuộc UTC offset', () => {
    assert.equal(ScheduleDate.shiftDate('2026-12-31', 1), '2027-01-01');
    assert.equal(ScheduleDate.shiftDate('2027-01-01', -1), '2026-12-31');
  });

  test('TC13: Điều hướng ngày không xóa bộ lọc tìm kiếm hoặc trạng thái', () => {
    assert.match(staffPage, /const scheduleSearchInput = document\.getElementById\('schedule-search-input'\)/);
    assert.match(staffPage, /const scheduleStatusFilter = document\.getElementById\('schedule-status-filter'\)/);
    assert.match(
      staffPage,
      /btn-next-day'\)\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*scheduleDateInput\.value\s*=\s*ScheduleDate\.shiftDate\(scheduleDateInput\.value,\s*1\);\s*updateDateLabel\(\);\s*loadScheduleData\(\);/s
    );
  });

  test('TC14: Tải lịch theo ngày đã chọn và bỏ qua phản hồi cũ', () => {
    assert.match(staffPage, /Admin\.api\(`\/api\/appointments\?date=\$\{date\}&limit=100`\)/);
    assert.match(staffPage, /requestId !== scheduleLoadRequest \|\| date !== scheduleDateInput\.value/);
  });

  test('Ngày không hợp lệ bị từ chối thay vì âm thầm đổi sang ngày khác', () => {
    assert.throws(() => ScheduleDate.shiftDate('2026-02-29', 1), RangeError);
  });
});
