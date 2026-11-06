'use strict';
const appointmentRepo = require('../repositories/appointmentRepository');
const appointmentService = require('../services/appointmentService');
const settingsRepo = require('../repositories/settingsRepository');
const productRepo = require('../repositories/productRepository');
const conversationRepo = require('../repositories/conversationRepository');

// Tool definitions for AI (OpenAI function calling format)
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_business_hours',
      description: 'Lấy giờ hoạt động và ngày nghỉ theo cấu hình hiện tại của salon.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Ngày cần kiểm tra (YYYY-MM-DD, nếu có).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_available_slots',
      description: 'Kiểm tra khung giờ còn trống theo thời lượng, size và dịch vụ thực tế trong danh mục. BẮT BUỘC dùng khi khách hỏi giờ trống hoặc chọn giờ đặt lịch.',
      parameters: {
        type: 'object',
        required: ['date'],
        properties: {
          date: {
            type: 'string',
            description: 'Ngày cần kiểm tra (YYYY-MM-DD hoặc "ngày mai", "hôm nay"). Ưu tiên ngày đang trao đổi trong cuộc hội thoại.',
          },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'ID dịch vụ đã được xác định từ dữ liệu hệ thống.',
          },
          product_sizes: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Size đã xác nhận cho từng ID dịch vụ.',
          },
          hair_size: { type: 'string', enum: ['S', 'M', 'L'], description: 'Size đã được xác định nếu dịch vụ yêu cầu.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_appointment_slot',
      description: 'Bước 6 trong quy trình BPMN: Khóa giữ chỗ tạm thời khung giờ đã chọn. Chỉ gọi công cụ này khi khách đã chọn một khung giờ cụ thể và còn trống. TUYỆT ĐỐI KHÔNG thông báo đã giữ chỗ nếu công cụ trả về lỗi hoặc khung giờ đã kín.',
      parameters: {
        type: 'object',
        required: ['appointment_date', 'appointment_time'],
        properties: {
          appointment_date: { type: 'string', description: 'Ngày hẹn, định dạng YYYY-MM-DD' },
          appointment_time: { type: 'string', description: 'Giờ hẹn, định dạng HH:MM' },
          product_id: { type: 'string', description: 'ID dịch vụ/sản phẩm (nếu có)' },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'ID toàn bộ dịch vụ khách đã chọn (nếu có nhiều dịch vụ)',
          },
          product_sizes: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Lựa chọn size theo từng ID dịch vụ, chỉ gửi sau khi khách xác nhận size.',
          },
          hair_size: { type: 'string', enum: ['S', 'M', 'L'], description: 'Size dùng chung nếu chưa gửi product_sizes.' },
          notes: { type: 'string', description: 'Ghi chú thêm về dịch vụ' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_appointment',
      description: 'Bước 9 trong quy trình BPMN: Xác thực lại slot và chốt lịch chính thức vào sổ lịch hẹn sau khi khách đã gửi đủ Họ tên và Số điện thoại (10 số). Email là không bắt buộc (tuỳ chọn).',
      parameters: {
        type: 'object',
        required: ['customer_name', 'customer_phone'],
        properties: {
          holding_token: { type: 'string', description: 'Token giữ chỗ tạm thời từ bước hold_appointment_slot (nếu không có, backend sẽ tự tìm theo hội thoại)' },
          customer_name: { type: 'string', description: 'Họ và tên khách hàng' },
          customer_phone: { type: 'string', description: 'Số điện thoại khách hàng (10 số)' },
          customer_email: { type: 'string', description: 'Địa chỉ email của khách hàng (không bắt buộc / tuỳ chọn)' },
          appointment_date: { type: 'string', description: 'Ngày hẹn YYYY-MM-DD (nếu không dùng holding_token)' },
          appointment_time: { type: 'string', description: 'Giờ hẹn HH:MM (nếu không dùng holding_token)' },
          product_id: { type: 'string', description: 'ID sản phẩm dịch vụ' },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'ID toàn bộ dịch vụ khách đã chọn (nếu có nhiều dịch vụ)',
          },
          product_sizes: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Lựa chọn size theo từng ID dịch vụ, chỉ gửi sau khi khách xác nhận size.',
          },
          hair_size: { type: 'string', enum: ['S', 'M', 'L'], description: 'Size dùng chung nếu chưa gửi product_sizes.' },
          notes: { type: 'string', description: 'Ghi chú thêm' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Tạo lịch hẹn trực tiếp (chế độ 1 pha dự phòng). Yêu cầu đã xác nhận đầy đủ Họ tên, SĐT (10 số), Ngày và Giờ hẹn. Email là không bắt buộc (tuỳ chọn).',
      parameters: {
        type: 'object',
        required: ['customer_name', 'customer_phone', 'appointment_date', 'appointment_time'],
        properties: {
          customer_name: { type: 'string', description: 'Tên khách hàng' },
          customer_phone: { type: 'string', description: 'Số điện thoại khách hàng (10 số)' },
          customer_email: { type: 'string', description: 'Email của khách hàng (không bắt buộc / tuỳ chọn)' },
          appointment_date: { type: 'string', description: 'Ngày hẹn, định dạng YYYY-MM-DD' },
          appointment_time: { type: 'string', description: 'Giờ hẹn, định dạng HH:MM' },
          product_id: { type: 'string', description: 'ID sản phẩm cần tư vấn (nếu có)' },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'ID toàn bộ dịch vụ khách đã chọn (nếu có nhiều dịch vụ)',
          },
          product_sizes: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Lựa chọn size theo từng ID dịch vụ, chỉ gửi sau khi khách xác nhận size.',
          },
          notes: { type: 'string', description: 'Ghi chú thêm về cuộc tư vấn' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointment_details',
      description: 'Lấy thông tin chi tiết lịch hẹn bằng mã xác nhận hoặc holding token.',
      parameters: {
        type: 'object',
        required: ['confirmation_token'],
        properties: {
          confirmation_token: { type: 'string', description: 'Mã xác nhận (UUID) của lịch hẹn' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Hủy lịch hẹn theo ID hoặc nhả giữ chỗ tạm. Chỉ thực hiện khi khách hàng yêu cầu.',
      parameters: {
        type: 'object',
        required: ['appointment_id'],
        properties: {
          appointment_id: { type: 'string', description: 'ID của lịch hẹn cần hủy' },
        },
      },
    },
  },
];

function normalizeToolArgs(rawArgs) {
  if (!rawArgs || typeof rawArgs !== 'object') return {};
  let args = { ...rawArgs };
  if (args.parameters && typeof args.parameters === 'object' && !Array.isArray(args.parameters)) {
    args = { ...args, ...args.parameters };
  }
  if (args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)) {
    args = { ...args, ...args.arguments };
  }
  if (args.input && typeof args.input === 'object' && !Array.isArray(args.input)) {
    args = { ...args, ...args.input };
  }
  return args;
}

function getVietnamDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + offsetDays));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

function getNextDate(dateStr) {
  if (!dateStr) return null;
  const norm = normalizeDateInput(dateStr);
  if (!norm) return null;
  const [y, m, d] = norm.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function formatDateYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveDateWithoutYear(day, month) {
  const today = getVietnamDate(0);
  const currentYear = Number(today.slice(0, 4));
  for (let year = currentYear; year <= currentYear + 8; year += 1) {
    const candidate = formatCalendarDate(year, month, day);
    if (candidate && candidate >= today) return candidate;
  }
  return null;
}

function isInvalidCalendarDateText(text) {
  if (!text || typeof text !== 'string') return false;
  const isoDate = text.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/u);
  if (isoDate) {
    return !formatCalendarDate(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3]),
    );
  }
  const numericDate = text.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?(?!\d)/u);
  const textualDate = text.toLocaleLowerCase('vi-VN')
    .match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/u);
  const match = numericDate || textualDate;
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const currentYear = Number(getVietnamDate(0).slice(0, 4));
  return match[3]
    ? !formatCalendarDate(Number(match[3]), month, day)
    : !Array.from({ length: 9 }, (_, offset) =>
      formatCalendarDate(currentYear + offset, month, day)
    ).some(Boolean);
}

function extractDateFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const str = text.trim();
  const lower = str.toLowerCase();

  // 1. ISO YYYY-MM-DD
  const isoMatch = str.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return formatCalendarDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  // 2. VN format DD/MM/YYYY or DD-MM-YYYY
  const vnMatch = str.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (vnMatch) {
    return formatCalendarDate(
      Number(vnMatch[3]),
      Number(vnMatch[2]),
      Number(vnMatch[1]),
    );
  }

  // 3. Vietnamese dates with or without a year
  const vnTextDateMatch = lower.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/u);
  if (vnTextDateMatch) {
    const day = Number(vnTextDateMatch[1]);
    const month = Number(vnTextDateMatch[2]);
    return vnTextDateMatch[3]
      ? formatCalendarDate(Number(vnTextDateMatch[3]), month, day)
      : resolveDateWithoutYear(day, month);
  }

  // 4. Numeric Vietnamese dates, including a date-only reply such as "11/11"
  const shortVnMatch = str.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})(?![-/.]\d)(?!\d)/u);
  if (shortVnMatch) {
    const day = Number(shortVnMatch[1]);
    const month = Number(shortVnMatch[2]);
    return resolveDateWithoutYear(day, month);
  }

  // 5. Weekdays within the current Monday-to-Sunday week
  const weekdayNames = [
    { pattern: /(?:thứ\s*2|thứ\s*hai)/u, day: 1 },
    { pattern: /(?:thứ\s*3|thứ\s*ba)/u, day: 2 },
    { pattern: /(?:thứ\s*4|thứ\s*tư)/u, day: 3 },
    { pattern: /(?:thứ\s*5|thứ\s*năm)/u, day: 4 },
    { pattern: /(?:thứ\s*6|thứ\s*sáu)/u, day: 5 },
    { pattern: /(?:thứ\s*7|thứ\s*bảy)/u, day: 6 },
    { pattern: /chủ\s*nhật/u, day: 0 },
  ];
  const weekday = weekdayNames.find(item => item.pattern.test(lower));
  if (weekday && /tuần\s+này/u.test(lower)) {
    const today = getVietnamDate(0);
    const [year, month, day] = today.split('-').map(Number);
    const todayDate = new Date(Date.UTC(year, month - 1, day));
    const currentDay = todayDate.getUTCDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const weekStart = new Date(Date.UTC(year, month - 1, day + mondayOffset));
    const weekdayOffset = weekday.day === 0 ? 6 : weekday.day - 1;
    const target = new Date(weekStart.getTime() + weekdayOffset * 86400000);
    return formatCalendarDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
  }

  // 6. Relative keywords in Vietnamese
  if (/(?:ngày\s+kia|ngày\s+mốt|hôm\s+mốt|ngày\s+kìa|\bmốt\b)/i.test(lower)) {
    return getVietnamDate(2);
  }
  if (/(?:ngày\s+mai|sáng\s+mai|chiều\s+mai|tối\s+mai|\bmai\b)/i.test(lower)) {
    return getVietnamDate(1);
  }
  if (/(?:hôm\s+nay|sáng\s+nay|chiều\s+nay|tối\s+nay|\bnay\b)/i.test(lower)) {
    return getVietnamDate(0);
  }

  return null;
}

function normalizeDateInput(input) {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const lower = str.toLowerCase();

  // Handle relative dates in Vietnamese
  if (lower === 'hôm nay' || lower === 'hom nay' || lower === 'today') {
    return getVietnamDate(0);
  }
  if (lower === 'ngày mai' || lower === 'ngay mai' || lower === 'mai' || lower === 'tomorrow') {
    return getVietnamDate(1);
  }
  if (lower === 'ngày kia' || lower === 'ngay kia' || lower === 'mốt' || lower === 'mot') {
    return getVietnamDate(2);
  }

  // Try extracting from text
  const extracted = extractDateFromText(str);
  if (extracted) return extracted;

  // Fallback to JS Date parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatDateYYYYMMDD(parsed);
  }

  return null;
}

function extractDateFromUserAndHistory(userMessage, history = [], fallbackOffset = 1) {
  // 1. Try current user message
  const fromUser = extractDateFromText(userMessage);
  if (fromUser) return fromUser;

  // 2. Try history from newest to oldest
  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg && msg.content) {
        const fromHistory = extractDateFromText(msg.content);
        if (fromHistory) return fromHistory;
      }
    }
  }

  // 3. Fallback to Vietnam tomorrow
  return getVietnamDate(fallbackOffset);
}

function detectAvailableSlotsQuery(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const lower = userMessage.toLowerCase().trim();

  const slotPhrases = [
    'khung giờ khác',
    'giờ khác',
    'giờ nào khác',
    'khung giờ nào khác',
    'slot khác',
    'còn trống',
    'còn giờ nào trống',
    'còn khung giờ nào trống',
    'còn khung giờ nào',
    'còn giờ nào',
    'còn slot nào',
    'có giờ nào',
    'có slot nào',
    'có khung giờ nào',
    'giờ còn trống',
    'lịch còn trống',
    'lịch trống',
    'xem lịch trống',
    'xem giờ trống',
    'danh sách giờ',
    'danh sách khung giờ',
    'mấy giờ còn trống',
    'thời gian nào trống',
    'trống lúc nào',
    'trống giờ nào',
    'trống từ mấy giờ',
    'từ mấy giờ đến mấy giờ',
    'khung giờ nào trống',
    'rảnh giờ nào',
    'còn chỗ không',
    'còn chỗ nào',
    'có giờ nào khác',
    'giờ nào khác',
  ];

  if (slotPhrases.some(phrase => lower.includes(phrase))) {
    return true;
  }

  const pattern = /(?:còn|có)\s+(?:trống\s+)?(?:khung\s*giờ|giờ|slot|chỗ|lịch)(?:\s+nào)?(?:\s+(?:trống|khác|nữa|rảnh))?/i;
  if (pattern.test(lower)) {
    return true;
  }

  return /(?:trống|rảnh)\s+từ\s+(?:mấy\s+)?giờ|từ\s+(?:mấy\s+)?giờ\s+đến\s+(?:mấy\s+)?giờ/i
    .test(lower);
}

function formatTime(hour, minute, originalText) {
  const period = originalText.match(/(?:\b(sáng|trưa|chiều|tối)\b)/iu)?.[1]?.toLocaleLowerCase('vi-VN');
  let normalizedHour = Number(hour);
  if (['trưa', 'chiều', 'tối'].includes(period) && normalizedHour < 12) {
    normalizedHour += 12;
  } else if (period === 'sáng' && normalizedHour === 12) {
    normalizedHour = 0;
  }
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
}

function extractTimeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const str = text.trim();
  // Match HH:MM (e.g. 10:30, 09:00, 9:00)
  const colonMatch = str.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (colonMatch) {
    return formatTime(colonMatch[1], colonMatch[2], str);
  }
  // Match HHhMM or HHh (e.g. 10h30, 11h, 8h30, 9h)
  const hMatch = str.match(/\b([01]?\d|2[0-3])h([0-5]\d)?\b/i);
  if (hMatch) {
    return formatTime(hMatch[1], hMatch[2], str);
  }
  // Match "X giờ" or "X giờ Y phút"
  const gioMatch = str.match(/\b([01]?\d|2[0-3])\s*giờ(?:\s*([0-5]?\d)(?:\s*phút)?)?/i);
  if (gioMatch) {
    return formatTime(gioMatch[1], gioMatch[2], str);
  }
  return null;
}

async function executeTool(toolName, rawArgs, context = {}) {
  const { conversationId, guestSessionId } = context;
  const args = normalizeToolArgs(rawArgs);

  switch (toolName) {
    case 'get_business_hours': {
      const result = await appointmentService.getBusinessHours();
      return JSON.stringify(result);
    }

    case 'check_available_slots': {
      try {
        let rawDate = args.date || args.appointment_date || args.day || args.target_date;
        if (!rawDate && context.targetDate) {
          rawDate = context.targetDate;
        }
        if (!rawDate && context.history) {
          rawDate = extractDateFromUserAndHistory('', context.history);
        }
        if (!rawDate) {
          return JSON.stringify({
            success: false,
            error: 'date is required. Vui lòng cung cấp ngày cần kiểm tra (định dạng YYYY-MM-DD)',
            slots: []
          });
        }

        const normalizedDate = normalizeDateInput(rawDate);
        if (!normalizedDate) {
          return JSON.stringify({
            success: false,
            error: `Ngày không hợp lệ: "${rawDate}". Định dạng chuẩn là YYYY-MM-DD (ví dụ: 2026-10-29)`,
            slots: []
          });
        }

        const productIds = Array.isArray(args.product_ids) && args.product_ids.length
          ? args.product_ids
          : args.product_id
            ? [args.product_id]
            : context.chatContext?.selected_service_ids ||
              context.conversation?.chat_context?.selected_service_ids ||
              [];
        const hairSize = args.hair_size || args.size ||
          context.chatContext?.hair_size ||
          context.conversation?.chat_context?.hair_size ||
          null;
        const requestedDuration = args.duration || args.duration_minutes;
        const result = await appointmentService.checkAvailableSlots(
          normalizedDate,
          requestedDuration ? Number.parseInt(requestedDuration, 10) : undefined,
          {
            productIds,
            hairSize,
            productSizes: args.product_sizes || args.productSizes || {},
          }
        );
        const slots = result.slots || [];

        if (slots.length === 0) {
          const nextDate = getNextDate(normalizedDate);
          return JSON.stringify({
            success: true,
            date: normalizedDate,
            slots: [],
            free_intervals: result.freeIntervals || [],
            count: 0,
            duration: result.duration || requestedDuration || null,
            next_date: nextDate,
            message: `Ngày ${normalizedDate} hiện salon đã kín toàn bộ các khung giờ (không còn giờ trống). BẮT BUỘC thông báo ngày ${normalizedDate} đã kín lịch, và CHỦ ĐỘNG đề xuất kiểm tra ngày tiếp theo (${nextDate || 'ngày khác'}), hỏi khách hàng có muốn xem lịch của ngày đó không.`
          });
        }

        return JSON.stringify({
          success: true,
          date: normalizedDate,
          slots,
          free_intervals: result.freeIntervals || [],
          count: slots.length,
          duration: result.duration || requestedDuration || null,
          message: `Các khoảng trống đủ thời lượng trong ngày ${normalizedDate}: ${(result.freeIntervals || []).map(interval => `${interval.start}-${interval.end}`).join(', ')}. Các giờ bắt đầu hợp lệ được liệt kê trong slots: ${slots.join(', ')}. Hãy giới thiệu khoảng trống và hỏi khách chọn giờ bắt đầu phù hợp.`
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message || 'Không thể kiểm tra lịch trống',
          errorCode: err.code || 'AVAILABILITY_CHECK_FAILED',
          code: err.code || 'AVAILABILITY_CHECK_FAILED',
          errorName: err.name || 'Error',
          status: Number.isInteger(err.status) ? err.status : null,
          slots: [],
          message: 'Hiện chưa thể xác nhận lịch trống từ hệ thống. Hãy thông báo trung thực và đề nghị khách thử lại hoặc kết nối với nhân viên.'
        });
      }
    }

    case 'hold_appointment_slot': {
      const apptDate = normalizeDateInput(args.appointment_date) || args.appointment_date || context.targetDate;
      const apptTime = args.appointment_time;
      try {
        const held = await appointmentService.holdSlot({
          conversationId,
          guestSessionId,
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          productId: args.product_id || null,
          productIds: args.product_ids || null,
          productSizes: args.product_sizes || args.productSizes || {},
          hairSize: args.hair_size || args.size || null,
          notes: args.notes || null,
        });
        return JSON.stringify({
          success: true,
          holding_token: held.holding_token,
          appointment_date: held.appointment_date,
          appointment_time: held.appointment_time,
          message: `ĐÃ GHI NHẬN TẠM THỜI khung giờ ${held.appointment_time} ngày ${held.appointment_date}. Hãy xin Họ tên, SĐT (10 số) để hoàn tất đăng ký (email là tuỳ chọn).`,
        });
      } catch (err) {
        let alternateSlots = [];
        let alternateFreeIntervals = [];
        try {
          if (apptDate) {
            const avail = await appointmentService.checkAvailableSlots(apptDate, undefined, {
              productIds: args.product_ids || (args.product_id ? [args.product_id] : []),
              hairSize: args.hair_size || args.size || null,
              productSizes: args.product_sizes || args.productSizes || {},
            });
            alternateSlots = (avail.slots || []).filter(s => s !== apptTime);
            alternateFreeIntervals = avail.freeIntervals || [];
          }
        } catch (availabilityError) {
          console.error('[AI] Could not load alternate appointment slots', {
            conversationId,
            errorName: availabilityError.name || 'Error',
            errorCode: availabilityError.code || 'AVAILABILITY_CHECK_FAILED',
          });
        }

        return JSON.stringify({
          success: false,
          error: `Khung giờ ${apptTime} ngày ${apptDate} hiện đã kín hoặc đã có người đặt.`,
          code: err.code || 'SLOT_UNAVAILABLE',
          errorName: err.name || 'Error',
          status: Number.isInteger(err.status) ? err.status : null,
          appointment_date: apptDate,
          appointment_time: apptTime,
          available_slots: alternateSlots,
          available_free_intervals: alternateFreeIntervals,
          message: `GIỮ CHỖ THẤT BẠI. Khung giờ ${apptTime} ngày ${apptDate} ĐÃ KÍN hoặc không khả dụng. TUYỆT ĐỐI KHÔNG thông báo đã giữ chỗ cho khách. Hãy thông báo khung giờ này đã kín, và ${alternateSlots.length > 0 ? `gợi ý các khung giờ còn trống khác trong ngày: ${alternateSlots.slice(0, 6).join(', ')}` : 'hỏi khách có muốn xem lịch ngày khác không'}.`
        });
      }
    }

    case 'confirm_appointment': {
      try {
        const name = (args.customer_name || args.name || '').trim();
        const rawPhone = (args.customer_phone || args.phone || '').trim();
        const rawEmail = (args.customer_email || args.email || '').trim();

        if (!name) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_NAME',
            code: 'MISSING_NAME',
            message: 'Thiếu họ và tên khách hàng. Vui lòng hỏi họ tên của khách hàng trước khi chốt lịch.'
          });
        }

        if (!rawPhone) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_PHONE',
            code: 'MISSING_PHONE',
            message: 'Thiếu số điện thoại khách hàng. Vui lòng xin số điện thoại liên hệ (10 số tại Việt Nam) của khách hàng.'
          });
        }

        const cleanPhone = appointmentService.cleanPhoneNumber(rawPhone);
        if (!appointmentService.PHONE_REGEX.test(cleanPhone)) {
          return JSON.stringify({
            success: false,
            error: 'INVALID_PHONE',
            code: 'INVALID_PHONE',
            message: `Số điện thoại "${rawPhone}" không hợp lệ. Vui lòng yêu cầu khách hàng cung cấp số điện thoại 10 số tại Việt Nam (ví dụ: 0901234567).`
          });
        }

        let customerEmail = null;
        if (rawEmail) {
          if (!appointmentService.isValidEmail(rawEmail)) {
            return JSON.stringify({
              success: false,
              error: 'INVALID_EMAIL',
              code: 'INVALID_EMAIL',
              message: `Địa chỉ email "${rawEmail}" không hợp lệ. Vui lòng yêu cầu khách hàng cung cấp email chính xác (ví dụ: ten@gmail.com).`
            });
          }
          customerEmail = rawEmail.toLowerCase();
        }

        // Auto-detect holding token if not provided directly
        let holdingToken = args.holding_token;
        if (!holdingToken && conversationId) {
          const activeHold = await appointmentRepo.findActiveHoldByConversation(conversationId);
          if (activeHold) {
            holdingToken = activeHold.holding_token;
          }
        }

        if (holdingToken) {
          const appt = await appointmentService.confirmHoldingSlot({
            holdingToken,
            customerName: name,
            customerPhone: cleanPhone,
            customerEmail: customerEmail,
            notes: args.notes || null,
            guestSessionId,
          });

          // Sync customer info back to conversation
          if (conversationId) {
            await conversationRepo.updateCustomerInfo(conversationId, {
              name: appt.customer_name,
              phone: appt.customer_phone,
              email: appt.customer_email,
            });
            await conversationRepo.updateChatContext(conversationId, {
              booking_confirmation_pending: false,
              booking_started: false,
              booking_intent_pending: false,
            });
          }

          return JSON.stringify({
            success: true,
            booking_code: appt.booking_code,
            appointment_id: appt.id,
            confirmation_token: appt.confirmation_token,
            date: appt.appointment_date,
            time: appt.appointment_time,
            customer_name: appt.customer_name,
            customer_phone: appt.customer_phone,
            customer_email: appt.customer_email,
            status: appt.status,
            appointment: appt,
            message: `ĐÃ ĐẶT LỊCH THÀNH CÔNG VÀO HỆ THỐNG! Mã đặt lịch chính thức là ${appt.booking_code}. Khách hàng: ${appt.customer_name}, SĐT: ${appt.customer_phone}${appt.customer_email ? `, Email: ${appt.customer_email}` : ''}, Thời gian: ${appt.appointment_time} ngày ${appt.appointment_date}. Hãy thông báo mã booking này và gửi lời cảm ơn đến khách hàng!`
          });
        }

        // Direct create fallback if no hold slot found
        const apptDate = normalizeDateInput(args.appointment_date || args.date);
        const apptTime = args.appointment_time || args.time;

        if (!apptDate || !apptTime) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_DATE_TIME',
            message: 'Thiếu ngày hoặc giờ hẹn. Vui lòng chọn khung giờ hẹn trước khi xác nhận đặt lịch.'
          });
        }

        if (conversationId) {
          await conversationRepo.updateCustomerInfo(conversationId, {
            name,
            phone: cleanPhone,
            email: customerEmail,
          });
        }

        const appointment = await appointmentService.createAppointment({
          conversationId,
          guestSessionId,
          confirmedBySystem: true,
          customerName: name,
          customerPhone: cleanPhone,
          customerEmail: customerEmail,
          productId: args.product_id || null,
          productIds: args.product_ids || null,
          productSizes: args.product_sizes || args.productSizes || {},
          hairSize: args.hair_size || args.size || null,
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          notes: args.notes || null,
          status: 'confirmed',
        });

        if (conversationId) {
          await conversationRepo.updateCustomerInfo(conversationId, {
            name: appointment.customer_name,
            phone: appointment.customer_phone,
            email: appointment.customer_email,
          });
          await conversationRepo.updateChatContext(conversationId, {
            booking_confirmation_pending: false,
            booking_started: false,
            booking_intent_pending: false,
          });
        }

        return JSON.stringify({
          success: true,
          booking_code: appointment.booking_code,
          appointment_id: appointment.id,
          confirmation_token: appointment.confirmation_token,
          date: appointment.appointment_date,
          time: appointment.appointment_time,
          customer_name: appointment.customer_name,
          customer_phone: appointment.customer_phone,
          customer_email: appointment.customer_email,
          status: appointment.status,
          message: `ĐÃ ĐẶT LỊCH THÀNH CÔNG VÀO HỆ THỐNG! Mã đặt lịch chính thức là ${appointment.booking_code}. Khách hàng: ${appointment.customer_name}, SĐT: ${appointment.customer_phone}${appointment.customer_email ? `, Email: ${appointment.customer_email}` : ''}, Thời gian: ${appointment.appointment_time} ngày ${appointment.appointment_date}. Hãy thông báo mã booking này và gửi lời cảm ơn đến khách hàng!`
        });
      } catch (err) {
        let conflictDetails = {};
        if (['SLOT_CONFLICT', 'SLOT_CAPACITY_EXCEEDED'].includes(err.code) && conversationId) {
          const date = normalizeDateInput(args.appointment_date || args.date);
          const time = args.appointment_time || args.time;
          if (date) {
            const availability = JSON.parse(await executeTool('check_available_slots', {
              date,
              product_ids: args.product_ids,
            }, context));
            conflictDetails = {
              appointment_date: date,
              appointment_time: time,
              available_slots: (availability.slots || []).filter(slot => slot !== time),
            };
          }
          await conversationRepo.updateChatContext(conversationId, {
            booking_confirmation_pending: false,
          });
        }
        return JSON.stringify({
          success: false,
          error: err.message || 'Lỗi xác nhận lịch hẹn',
          code: err.code || 'CONFIRM_FAILED',
          ...conflictDetails,
        });
      }
    }

    case 'create_appointment': {
      try {
        const name = (args.customer_name || args.name || '').trim();
        const rawPhone = (args.customer_phone || args.phone || '').trim();
        const rawEmail = (args.customer_email || args.email || '').trim();

        if (!name) {
          return JSON.stringify({ success: false, error: 'MISSING_NAME', code: 'MISSING_NAME', message: 'Thiếu họ và tên khách hàng.' });
        }
        if (!rawPhone) {
          return JSON.stringify({ success: false, error: 'MISSING_PHONE', code: 'MISSING_PHONE', message: 'Thiếu số điện thoại khách hàng.' });
        }
        const cleanPhone = appointmentService.cleanPhoneNumber(rawPhone);
        if (!appointmentService.PHONE_REGEX.test(cleanPhone)) {
          return JSON.stringify({ success: false, error: 'INVALID_PHONE', code: 'INVALID_PHONE', message: 'Số điện thoại không hợp lệ (cần 10 số).' });
        }
        let customerEmail = null;
        if (rawEmail) {
          if (!appointmentService.isValidEmail(rawEmail)) {
            return JSON.stringify({ success: false, error: 'INVALID_EMAIL', code: 'INVALID_EMAIL', message: 'Email không hợp lệ.' });
          }
          customerEmail = rawEmail.toLowerCase();
        }

        const apptDate = normalizeDateInput(args.appointment_date || args.date);
        const apptTime = args.appointment_time || args.time;
        if (!apptDate || !apptTime) {
          return JSON.stringify({ success: false, error: 'MISSING_DATE_TIME', code: 'MISSING_DATE_TIME', message: 'Thiếu ngày hoặc giờ hẹn.' });
        }

        const appointment = await appointmentService.createAppointment({
          conversationId,
          guestSessionId,
          confirmedBySystem: true,
          customerName: name,
          customerPhone: cleanPhone,
          customerEmail: customerEmail,
          productId: args.product_id || null,
          productIds: args.product_ids || null,
          productSizes: args.product_sizes || args.productSizes || {},
          hairSize: args.hair_size || args.size || null,
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          notes: args.notes || null,
        });

        if (conversationId) {
          await conversationRepo.updateCustomerInfo(conversationId, {
            name: appointment.customer_name,
            phone: appointment.customer_phone,
            email: appointment.customer_email,
          });
        }

        return JSON.stringify({
          success: true,
          booking_code: appointment.booking_code,
          appointment_id: appointment.id,
          confirmation_token: appointment.confirmation_token,
          date: appointment.appointment_date,
          time: appointment.appointment_time,
          customer_name: appointment.customer_name,
          customer_phone: appointment.customer_phone,
          customer_email: appointment.customer_email,
          status: appointment.status,
          message: `ĐÃ TẠO LỊCH HẸN THÀNH CÔNG! Mã đặt lịch là ${appointment.booking_code}. Hãy thông báo mã này cho khách hàng.`
        });
      } catch (err) {
        return JSON.stringify({ success: false, error: err.message });
      }
    }

    case 'get_appointment_details': {
      try {
        const appt = await appointmentRepo.findByToken(args.confirmation_token);
        if (!appt || appt.guest_session_id !== guestSessionId) {
          return JSON.stringify({ error: 'Không tìm thấy lịch hẹn' });
        }
        return JSON.stringify({
          id: appt.id,
          booking_code: appt.booking_code,
          date: appt.appointment_date,
          time: appt.appointment_time,
          status: appt.status,
          customer_name: appt.customer_name,
          product_name: appt.product_name,
        });
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    }

    case 'cancel_appointment': {
      try {
        const result = await appointmentRepo.updateStatus(args.appointment_id, 'cancelled', guestSessionId);
        if (!result) return JSON.stringify({ error: 'Không tìm thấy hoặc không có quyền hủy lịch này' });
        return JSON.stringify({ success: true, message: 'Lịch hẹn đã được hủy thành công' });
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  getVietnamDate,
  getNextDate,
  formatDateYYYYMMDD,
  normalizeDateInput,
  extractDateFromText,
  isInvalidCalendarDateText,
  extractDateFromUserAndHistory,
  detectAvailableSlotsQuery,
  extractTimeFromText,
  normalizeToolArgs,
};
