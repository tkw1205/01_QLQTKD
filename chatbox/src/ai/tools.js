'use strict';

const appointmentRepo = require('../repositories/appointmentRepository');
const appointmentService = require('../services/appointmentService');
const settingsRepo = require('../repositories/settingsRepository');
const productRepo = require('../repositories/productRepository');
const conversationRepo = require('../repositories/conversationRepository');

// ======================================================
// TOOL DEFINITIONS
// ======================================================

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_business_hours',
      description: 'Lấy thông tin giờ làm việc, ngày nghỉ và thời lượng dịch vụ mặc định của salon.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_available_slots',
      description: 'Kiểm tra các khung giờ còn trống theo ngày và tổng thời lượng của các dịch vụ khách đã chọn.',
      parameters: {
        type: 'object',
        required: ['date'],
        properties: {
          date: {
            type: 'string',
            description: 'Ngày cần kiểm tra (YYYY-MM-DD hoặc ngày mai, hôm nay).',
          },
          product_id: {
            type: 'string',
            description: 'ID dịch vụ được chọn.',
          },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách ID dịch vụ được chọn. Hệ thống cộng tổng thời lượng.',
          },
          duration: {
            type: 'integer',
            description: 'Tổng thời lượng dịch vụ tính bằng phút nếu đã biết.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hold_appointment_slot',
      description: 'Giữ chỗ tạm thời khung giờ khách đã chọn trong 5 phút. Chỉ gọi khi khách đã chọn giờ cụ thể.',
      parameters: {
        type: 'object',
        required: ['appointment_date', 'appointment_time'],
        properties: {
          appointment_date: {
            type: 'string',
            description: 'Ngày hẹn YYYY-MM-DD.',
          },
          appointment_time: {
            type: 'string',
            description: 'Giờ hẹn HH:MM.',
          },
          product_id: {
            type: 'string',
            description: 'ID dịch vụ.',
          },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Danh sách ID các dịch vụ khách đã chọn.',
          },
          notes: {
            type: 'string',
            description: 'Ghi chú thêm.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_appointment',
      description: 'Xác nhận lịch hẹn sau khi khách cung cấp họ tên và số điện thoại hợp lệ.',
      parameters: {
        type: 'object',
        required: ['customer_name', 'customer_phone'],
        properties: {
          holding_token: { type: 'string' },
          customer_name: { type: 'string' },
          customer_phone: { type: 'string' },
          appointment_date: { type: 'string' },
          appointment_time: { type: 'string' },
          product_id: { type: 'string' },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
          },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_appointment',
      description: 'Tạo lịch hẹn trực tiếp khi không sử dụng giữ chỗ.',
      parameters: {
        type: 'object',
        required: [
          'customer_name',
          'customer_phone',
          'appointment_date',
          'appointment_time',
        ],
        properties: {
          customer_name: { type: 'string' },
          customer_phone: { type: 'string' },
          appointment_date: { type: 'string' },
          appointment_time: { type: 'string' },
          product_id: { type: 'string' },
          product_ids: {
            type: 'array',
            items: { type: 'string' },
          },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointment_details',
      description: 'Lấy thông tin chi tiết lịch hẹn bằng mã xác nhận.',
      parameters: {
        type: 'object',
        required: ['confirmation_token'],
        properties: {
          confirmation_token: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Hủy lịch hẹn khi khách hàng yêu cầu.',
      parameters: {
        type: 'object',
        required: ['appointment_id'],
        properties: {
          appointment_id: { type: 'string' },
        },
      },
    },
  },
];

// ======================================================
// HELPER FUNCTIONS
// ======================================================

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

  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + offsetDays)
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getNextDate(dateStr) {
  if (!dateStr) return null;

  const normalized = normalizeDateInput(dateStr);
  if (!normalized) return null;

  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function extractDateFromText(text) {
  if (!text || typeof text !== 'string') return null;

  const str = text.trim();
  const lower = str.toLowerCase();

  const isoMatch = str.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const vnMatch = str.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);

  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, '0')}-${vnMatch[1].padStart(2, '0')}`;
  }

  const vnTextDateMatch = lower.match(
    /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?/
  );

  if (vnTextDateMatch) {
    const day = vnTextDateMatch[1].padStart(2, '0');
    const month = vnTextDateMatch[2].padStart(2, '0');
    const year = vnTextDateMatch[3] || getVietnamDate(0).split('-')[0];

    return `${year}-${month}-${day}`;
  }

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

  if (['hôm nay', 'hom nay', 'today'].includes(lower)) {
    return getVietnamDate(0);
  }

  if (['ngày mai', 'ngay mai', 'mai', 'tomorrow'].includes(lower)) {
    return getVietnamDate(1);
  }

  if (['ngày kia', 'ngay kia', 'mốt', 'mot'].includes(lower)) {
    return getVietnamDate(2);
  }

  const extracted = extractDateFromText(str);
  if (extracted) return extracted;

  const parsed = new Date(str);

  if (!isNaN(parsed.getTime())) {
    return formatDateYYYYMMDD(parsed);
  }

  return null;
}

function extractDateFromUserAndHistory(userMessage, history = [], fallbackOffset = 1) {
  const fromUser = extractDateFromText(userMessage);
  if (fromUser) return fromUser;

  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];

      if (msg && msg.content) {
        const fromHistory = extractDateFromText(msg.content);
        if (fromHistory) return fromHistory;
      }
    }
  }

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
    'rảnh giờ nào',
    'còn chỗ không',
    'còn chỗ nào',
  ];

  if (slotPhrases.some(phrase => lower.includes(phrase))) {
    return true;
  }

  const pattern =
    /(?:còn|có)\s+(?:trống\s+)?(?:khung\s*giờ|giờ|slot|chỗ|lịch)(?:\s+nào)?(?:\s+(?:trống|khác|nữa|rảnh))?/i;

  return pattern.test(lower);
}

function extractTimeFromText(text) {
  if (!text || typeof text !== 'string') return null;

  const str = text.trim();

  const colonMatch = str.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (colonMatch) {
    return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
  }

  const hMatch = str.match(/\b([01]?\d|2[0-3])h([0-5]\d)?\b/i);

  if (hMatch) {
    return `${hMatch[1].padStart(2, '0')}:${(hMatch[2] || '00').padStart(2, '0')}`;
  }

  const gioMatch = str.match(
    /\b([01]?\d|2[0-3])\s*giờ(?:\s*([0-5]?\d)(?:\s*phút)?)?/i
  );

  if (gioMatch) {
    return `${gioMatch[1].padStart(2, '0')}:${(gioMatch[2] || '00').padStart(2, '0')}`;
  }

  return null;
}

// ======================================================
// EXECUTE TOOL
// ======================================================

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
        let rawDate =
          args.date ||
          args.appointment_date ||
          args.day ||
          args.target_date;

        if (!rawDate && context.targetDate) {
          rawDate = context.targetDate;
        }

        if (!rawDate && context.history) {
          rawDate = extractDateFromUserAndHistory('', context.history);
        }

        if (!rawDate) {
          return JSON.stringify({
            success: false,
            error: 'Vui lòng cung cấp ngày cần kiểm tra.',
            slots: [],
          });
        }

        const normalizedDate = normalizeDateInput(rawDate);

        if (!normalizedDate) {
          return JSON.stringify({
            success: false,
            error: `Ngày không hợp lệ: "${rawDate}".`,
            slots: [],
          });
        }

        // Lấy danh sách dịch vụ khách đã chọn
        const productIds = Array.isArray(args.product_ids)
          ? args.product_ids.filter(Boolean)
          : (args.product_id ? [args.product_id] : []);

        // Mặc định 30 phút nếu chưa có dịch vụ
        let duration =
          parseInt(args.duration || args.duration_minutes, 10) || 30;

        // Tính tổng thời lượng tất cả dịch vụ
        if (productIds.length > 0) {
          const selectedProducts = await Promise.all(
            productIds.map(id => productRepo.findById(id))
          );

          if (selectedProducts.some(product => !product)) {
            return JSON.stringify({
              success: false,
              error: 'Không tìm thấy một hoặc nhiều dịch vụ đã chọn.',
              slots: [],
            });
          }

          duration = selectedProducts.reduce(
            (total, product) => total + (Number(product.duration) || 45),
            0
          );
        }

        // Kiểm tra lịch theo tổng thời lượng
        const result = await appointmentService.checkAvailableSlots(
          normalizedDate,
          duration
        );

        const slots = result.slots || [];

        if (slots.length === 0) {
          const nextDate = getNextDate(normalizedDate);

          return JSON.stringify({
            success: true,
            date: normalizedDate,
            slots: [],
            count: 0,
            duration: result.duration || duration,
            next_date: nextDate,
            message: `Ngày ${normalizedDate} hiện không còn khung giờ phù hợp. Hãy thông báo cho khách và hỏi khách có muốn kiểm tra ngày ${nextDate} không.`,
          });
        }

        return JSON.stringify({
          success: true,
          date: normalizedDate,
          slots,
          count: slots.length,
          duration: result.duration || duration,
          message: `Các khung giờ còn trống ngày ${normalizedDate}: ${slots.join(', ')}. Hãy giới thiệu các khung giờ này cho khách.`,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message || 'Không thể kiểm tra lịch trống.',
          slots: [],
        });
      }
    }

    case 'hold_appointment_slot': {
      const apptDate =
        normalizeDateInput(args.appointment_date) ||
        args.appointment_date ||
        context.targetDate;

      const apptTime = args.appointment_time;

      try {
        const productIds = Array.isArray(args.product_ids)
          ? args.product_ids.filter(Boolean)
          : (args.product_id ? [args.product_id] : []);

        const held = await appointmentService.holdSlot({
          conversationId,
          guestSessionId,
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          productId: productIds[0] || null,
          productIds,
          notes: args.notes || null,
        });

        return JSON.stringify({
          success: true,
          holding_token: held.holding_token,
          appointment_date: held.appointment_date,
          appointment_time: held.appointment_time,
          expires_at: held.hold_expires_at,
          message: `Đã giữ chỗ thành công khung giờ ${held.appointment_time} ngày ${held.appointment_date}. Vui lòng cung cấp họ tên và số điện thoại để hoàn tất đặt lịch.`,
        });
      } catch (err) {
        let alternateSlots = [];

        try {
          if (apptDate) {
            const avail = await appointmentService.checkAvailableSlots(apptDate);
            alternateSlots = (avail.slots || []).filter(slot => slot !== apptTime);
          }
        } catch (error) {
          // Không làm gián đoạn phản hồi lỗi giữ chỗ
        }

        return JSON.stringify({
          success: false,
          error: err.message || 'Khung giờ không khả dụng.',
          code: err.code || 'SLOT_UNAVAILABLE',
          appointment_date: apptDate,
          appointment_time: apptTime,
          available_slots: alternateSlots,
          message: alternateSlots.length > 0
            ? `Khung giờ ${apptTime} đã có người đặt. Các khung giờ khác còn trống: ${alternateSlots.slice(0, 6).join(', ')}.`
            : `Khung giờ ${apptTime} không còn khả dụng. Hãy hỏi khách có muốn kiểm tra ngày khác không.`,
        });
      }
    }

    case 'confirm_appointment': {
      try {
        const name = (args.customer_name || args.name || '').trim();
        const rawPhone = (args.customer_phone || args.phone || '').trim();

        if (!name) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_NAME',
            code: 'MISSING_NAME',
            message: 'Vui lòng cung cấp họ và tên khách hàng.',
          });
        }

        if (!rawPhone) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_PHONE',
            code: 'MISSING_PHONE',
            message: 'Vui lòng cung cấp số điện thoại khách hàng.',
          });
        }

        const cleanPhone = appointmentService.cleanPhoneNumber(rawPhone);

        if (!appointmentService.PHONE_REGEX.test(cleanPhone)) {
          return JSON.stringify({
            success: false,
            error: 'INVALID_PHONE',
            code: 'INVALID_PHONE',
            message: 'Số điện thoại không hợp lệ. Vui lòng cung cấp số điện thoại Việt Nam gồm 10 chữ số.',
          });
        }

        // Tìm mã giữ chỗ nếu khách không truyền trực tiếp
        let holdingToken = args.holding_token;

        if (!holdingToken && conversationId) {
          const activeHold =
            await appointmentRepo.findActiveHoldByConversation(conversationId);

          if (activeHold) {
            holdingToken = activeHold.holding_token;
          }
        }

        if (holdingToken) {
          const appt = await appointmentService.confirmHoldingSlot({
            holdingToken,
            customerName: name,
            customerPhone: cleanPhone,
            notes: args.notes || null,
            guestSessionId,
          });

          if (conversationId) {
            await conversationRepo.updateCustomerInfo(conversationId, {
              name: appt.customer_name,
              phone: appt.customer_phone,
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
            status: appt.status,
            appointment: appt,
            message: `Đặt lịch thành công! Mã đặt lịch: ${appt.booking_code}. Khách hàng: ${appt.customer_name}, SĐT: ${appt.customer_phone}, thời gian: ${appt.appointment_time} ngày ${appt.appointment_date}.`,
          });
        }

        const apptDate = normalizeDateInput(
          args.appointment_date || args.date
        );

        const apptTime = args.appointment_time || args.time;

        if (!apptDate || !apptTime) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_DATE_TIME',
            message: 'Thiếu ngày hoặc giờ hẹn. Vui lòng chọn khung giờ trước khi xác nhận.',
          });
        }

        const appointment = await appointmentService.createAppointment({
          conversationId,
          guestSessionId,
          confirmedBySystem: true,
          customerName: name,
          customerPhone: cleanPhone,
          productId: args.product_id || null,
          productIds: args.product_ids || [],
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          notes: args.notes || null,
        });

        if (conversationId) {
          await conversationRepo.updateCustomerInfo(conversationId, {
            name: appointment.customer_name,
            phone: appointment.customer_phone,
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
          status: appointment.status,
          message: `Đặt lịch thành công! Mã đặt lịch: ${appointment.booking_code}.`,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message || 'Lỗi xác nhận lịch hẹn.',
          code: err.code || 'CONFIRM_FAILED',
        });
      }
    }

    case 'create_appointment': {
      try {
        const name = (args.customer_name || args.name || '').trim();
        const rawPhone = (args.customer_phone || args.phone || '').trim();

        if (!name) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_NAME',
            message: 'Vui lòng cung cấp họ và tên khách hàng.',
          });
        }

        if (!rawPhone) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_PHONE',
            message: 'Vui lòng cung cấp số điện thoại khách hàng.',
          });
        }

        const cleanPhone = appointmentService.cleanPhoneNumber(rawPhone);

        if (!appointmentService.PHONE_REGEX.test(cleanPhone)) {
          return JSON.stringify({
            success: false,
            error: 'INVALID_PHONE',
            message: 'Số điện thoại không hợp lệ. Cần số điện thoại Việt Nam gồm 10 chữ số.',
          });
        }

        const apptDate = normalizeDateInput(
          args.appointment_date || args.date
        );

        const apptTime = args.appointment_time || args.time;

        if (!apptDate || !apptTime) {
          return JSON.stringify({
            success: false,
            error: 'MISSING_DATE_TIME',
            message: 'Thiếu ngày hoặc giờ hẹn.',
          });
        }

        const appointment = await appointmentService.createAppointment({
          conversationId,
          guestSessionId,
          confirmedBySystem: true,
          customerName: name,
          customerPhone: cleanPhone,
          productId: args.product_id || null,
          productIds: args.product_ids || [],
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          notes: args.notes || null,
        });

        if (conversationId) {
          await conversationRepo.updateCustomerInfo(conversationId, {
            name: appointment.customer_name,
            phone: appointment.customer_phone,
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
          status: appointment.status,
          message: `Tạo lịch hẹn thành công! Mã đặt lịch: ${appointment.booking_code}.`,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message || 'Không thể tạo lịch hẹn.',
        });
      }
    }

    case 'get_appointment_details': {
      try {
        const appt = await appointmentRepo.findByToken(
          args.confirmation_token
        );

        if (!appt || appt.guest_session_id !== guestSessionId) {
          return JSON.stringify({
            success: false,
            error: 'Không tìm thấy lịch hẹn.',
          });
        }

        return JSON.stringify({
          success: true,
          id: appt.id,
          booking_code: appt.booking_code,
          date: appt.appointment_date,
          time: appt.appointment_time,
          status: appt.status,
          customer_name: appt.customer_name,
          product_name: appt.product_name,
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message,
        });
      }
    }

    case 'cancel_appointment': {
      try {
        const result = await appointmentRepo.updateStatus(
          args.appointment_id,
          'cancelled',
          guestSessionId
        );

        if (!result) {
          return JSON.stringify({
            success: false,
            error: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền hủy lịch này.',
          });
        }

        return JSON.stringify({
          success: true,
          message: 'Lịch hẹn đã được hủy thành công.',
        });
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err.message,
        });
      }
    }

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}`,
      });
  }
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  getVietnamDate,
  getNextDate,
  formatDateYYYYMMDD,
  normalizeDateInput,
  extractDateFromText,
  extractDateFromUserAndHistory,
  detectAvailableSlotsQuery,
  extractTimeFromText,
  normalizeToolArgs,
};