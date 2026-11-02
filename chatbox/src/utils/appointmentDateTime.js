'use strict';

const config = require('../config');

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function invalidDateTime(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_APPOINTMENT_DATETIME' });
}

function parseDate(date) {
  if (typeof date !== 'string') {
    throw invalidDateTime('Invalid date. Appointment date must use YYYY-MM-DD.');
  }

  const match = DATE_PATTERN.exec(date);
  if (!match) {
    throw invalidDateTime('Invalid date. Appointment date must use YYYY-MM-DD.');
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(0, 0, 0, 0);

  if (
    year < 1 ||
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw invalidDateTime('Invalid date. Appointment date must use YYYY-MM-DD.');
  }

  return { year, month, day };
}

function parseTime(time) {
  if (typeof time !== 'string') {
    throw invalidDateTime('Invalid appointment time. Use HH:mm.');
  }

  const match = TIME_PATTERN.exec(time);
  if (!match) {
    throw invalidDateTime('Invalid appointment time. Use HH:mm.');
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] || 0),
  };
}

function getZonedParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));

  return Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
}

function getTimeZoneOffset(timestamp, timeZone) {
  const parts = getZonedParts(timestamp, timeZone);
  const wallTime = new Date(0);
  wallTime.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  wallTime.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return wallTime.getTime() - Math.floor(timestamp / 1000) * 1000;
}

function parseAppointmentDateTime(date, time, timeZone = config.timezone) {
  const dateParts = parseDate(date);
  const timeParts = parseTime(time);
  const wallTime = new Date(0);
  wallTime.setUTCFullYear(dateParts.year, dateParts.month - 1, dateParts.day);
  wallTime.setUTCHours(timeParts.hour, timeParts.minute, timeParts.second, 0);

  const wallTimestamp = wallTime.getTime();
  let timestamp = wallTimestamp;
  for (let attempt = 0; attempt < 3; attempt++) {
    timestamp = wallTimestamp - getTimeZoneOffset(timestamp, timeZone);
  }

  const resolved = getZonedParts(timestamp, timeZone);
  if (
    resolved.year !== dateParts.year ||
    resolved.month !== dateParts.month ||
    resolved.day !== dateParts.day ||
    resolved.hour !== timeParts.hour ||
    resolved.minute !== timeParts.minute ||
    resolved.second !== timeParts.second
  ) {
    throw invalidDateTime('The appointment date and time are invalid in the configured timezone.');
  }

  return new Date(timestamp);
}

function getLocalDateTimeParts(timestamp = Date.now(), timeZone = config.timezone) {
  return getZonedParts(timestamp, timeZone);
}

function assertAppointmentIsFuture(date, time, now = Date.now(), timeZone = config.timezone) {
  const appointmentDateTime = parseAppointmentDateTime(date, time, timeZone);
  if (appointmentDateTime.getTime() <= now) {
    throw Object.assign(new Error('Thời gian đặt lịch đã qua. Vui lòng chọn thời gian khác.'), {
      status: 400,
      code: 'APPOINTMENT_IN_PAST',
    });
  }
  return appointmentDateTime;
}

function getDayOfWeek(date) {
  const { year, month, day } = parseDate(date);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(0, 0, 0, 0);
  return value.getUTCDay();
}

module.exports = {
  assertAppointmentIsFuture,
  getDayOfWeek,
  getLocalDateTimeParts,
  parseAppointmentDateTime,
  parseDate,
};
