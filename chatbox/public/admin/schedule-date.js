'use strict';

const scheduleDate = (() => {
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  function parseDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString || '');
    if (!match) {
      throw new RangeError('Ngày phải có định dạng YYYY-MM-DD');
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new RangeError('Ngày không hợp lệ');
    }

    return date;
  }

  function shiftDate(dateString, days) {
    if (!Number.isInteger(days)) {
      throw new TypeError('Số ngày cần dịch chuyển phải là số nguyên');
    }

    const date = parseDate(dateString);
    date.setUTCDate(date.getUTCDate() + days);

    return [
      String(date.getUTCFullYear()).padStart(4, '0'),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  function localDateString(now = new Date()) {
    return [
      String(now.getFullYear()).padStart(4, '0'),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function formatDayLabel(dateString) {
    const date = parseDate(dateString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();

    return `${dayNames[date.getUTCDay()]}, ${day}/${month}/${year}`;
  }

  return { shiftDate, localDateString, formatDayLabel };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = scheduleDate;
}

if (typeof window !== 'undefined') {
  window.ScheduleDate = scheduleDate;
}
