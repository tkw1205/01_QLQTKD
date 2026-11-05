'use strict';
const provider = require('./provider');
const {
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
} = require('./tools');
const messageRepo = require('../repositories/messageRepository');
const conversationRepo = require('../repositories/conversationRepository');
const appointmentRepo = require('../repositories/appointmentRepository');
const appointmentService = require('../services/appointmentService');
const settingsRepo = require('../repositories/settingsRepository');
const productRepo = require('../repositories/productRepository');
const servicePricing = require('./servicePricing');
const conversationContextService = require('./conversationContext');

const MAX_TOOL_CALLS = 5;
const CONFIRMATION_KEYWORDS = [
  'xác nhận', 'đồng ý', 'ok', 'okay', 'yes', 'có', 'đặt lịch', 'xác nhận đặt',
  'confirm', 'chắc chắn', 'đúng vậy', 'đúng rồi', 'vâng', 'ừ', 'oke'
];

function detectConfirmation(userMessage) {
  const lower = userMessage.toLowerCase().trim();
  return CONFIRMATION_KEYWORDS.some(kw => lower.includes(kw));
}

function isGreetingOnly(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return false;
  const normalized = userMessage
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ');
  return /^(?:(?:xin\s+)?chào|hello|hi|hey)(?:\s+(?:bạn|em|anh|chị|mọi người|salon|shop|ạ|nhé))*$/iu.test(normalized);
}

function isServiceChangeRequest(userMessage) {
  return /(?:đổi|thay đổi|thay)\s+(?:sang\s+)?(?:dịch vụ|kiểu tóc)/iu
    .test(userMessage || '');
}

function formatInvalidPhoneReply(phone) {
  const digits = appointmentService.cleanPhoneNumber(phone).replace(/\D/gu, '');
  return `Dạ, số điện thoại ${phone} chưa hợp lệ${digits ? ` (hiện có ${digits.length} chữ số)` : ''}. Anh/chị vui lòng nhập số di động Việt Nam đủ 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09 nhé ạ.`;
}

function isPriceInquiry(userMessage) {
  return /(?:\bgiá\b|bao nhiêu|chi phí|tổng tiền|tổng cộng)/iu.test(userMessage || '');
}

function isBookingIntent(userMessage, history = []) {
  if (detectAvailableSlotsQuery(userMessage)) return true;
  if (/(?:đặt lịch|đặt hẹn|đặt chỗ|đặt lúc|muốn đặt|chốt lịch|giữ chỗ|lịch trống|giờ trống|hủy lịch|hủy hẹn|tra cứu lịch|xem lịch hẹn)/iu.test(userMessage || '')) {
    return true;
  }

  if (isPriceInquiry(userMessage) || !extractTimeFromText(userMessage)) {
    return false;
  }

  const recentContext = history.slice(-6).map(message => message.content || '').join('\n');
  return /(?:đặt lịch|đặt hẹn|đặt chỗ|giữ chỗ|khung giờ|giờ nào|ngày hẹn)/iu.test(recentContext);
}

function isExplicitBookingConfirmation(userMessage) {
  return !/(?:không|chưa)/iu.test(userMessage || '') &&
    /(?:xác nhận(?: đặt lịch| lịch hẹn)?|đồng ý|chính xác|đúng rồi|đúng vậy|chốt lịch)/iu.test(userMessage || '');
}

function getAllowedTools(userMessage, history = []) {
  const bookingIntent = isBookingIntent(userMessage, history);
  const appointmentLookup = /(?:tra cứu lịch|xem lịch hẹn|lịch của tôi|lịch đã đặt|đặt chưa)/iu.test(userMessage || '');
  const cancellation = /(?:hủy lịch|hủy hẹn|hủy đặt)/iu.test(userMessage || '');
  const businessHours = /(?:giờ làm việc|mấy giờ mở cửa|mấy giờ đóng cửa)/iu.test(userMessage || '');

  return TOOL_DEFINITIONS.filter(({ function: tool }) => {
    if (['check_available_slots', 'hold_appointment_slot', 'confirm_appointment', 'create_appointment'].includes(tool.name)) {
      if (tool.name !== 'check_available_slots') return false;
      return bookingIntent;
    }
    if (tool.name === 'get_appointment_details') return appointmentLookup;
    if (tool.name === 'cancel_appointment') return cancellation;
    if (tool.name === 'get_business_hours') return businessHours;
    return true;
  });
}

function extractBookingContact(messages, conversation) {
  const contact = {
    customer_name: conversation?.customer_name || '',
    customer_phone: conversation?.customer_phone || '',
    customer_email: conversation?.customer_email || '',
  };
  const phonePattern = /(?:\+?84|0)(?:[\s().-]*\d){7,13}(?![\s().-]*\d)/u;
  const namePattern = /(?:họ\s*và\s*tên|họ\s*tên|tên(?:\s+khách\s+hàng)?|(?:tôi|mình)\s+tên(?:\s+là)?)\s*[:：]?\s*(.+?)(?=\s*(?:[,;|]\s*)?(?:số\s*điện\s*thoại|sđt|sdt|điện\s*thoại|phone|email)\s*[:：]?|$)/iu;
  const standaloneNamePattern = /^[\p{L}][\p{L}.'’-]*(?:\s+[\p{L}][\p{L}.'’-]*){1,5}$/iu;
  const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
  const assistantAskedForName = [...messages]
    .reverse()
    .find(message => message.sender_type === 'assistant')
    ?.content
    ?.match(/(?:họ\s*và\s*tên|họ\s*tên|cho em xin.*\btên\b|cung cấp.*\btên\b)/iu);

  for (const message of messages) {
    if (message.sender_type !== 'user' || !message.content) continue;
    const content = message.content.trim();
    const phone = content.match(phonePattern)?.[0]?.trim();
    const email = content.match(emailPattern)?.[0]?.trim();
    let name = content.match(namePattern)?.[1]?.trim();
    if (!name && phone) {
      const remainder = content
        .replace(phone, ' ')
        .replace(email || '', ' ')
        .replace(/^(?:họ\s*và\s*tên|họ\s*tên|tên(?:\s+khách\s+hàng)?|(?:tôi|mình)\s+tên(?:\s+là)?)\s*[:：]?\s*/iu, '')
        .replace(/(?:số\s*điện\s*thoại|sđt|sdt|điện\s*thoại|phone|email)\s*[:：]?/giu, ' ')
        .replace(/[,:;|()[\]-]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
      if (
        standaloneNamePattern.test(remainder) &&
        !/^(?:tôi|mình|em|anh|chị|muốn|cần|đặt|cắt|nhuộm|tóc|dạ|vâng|ừ|ok|okay|oke|chào|xin chào|được|đúng|chính xác|mai|hôm|ngày|làm|lúc|chiều|sáng|tối)\b/iu.test(remainder)
      ) {
        name = remainder;
      }
    }
    if (
      !name &&
      assistantAskedForName &&
      !/[0-9?]/u.test(content) &&
      !isExplicitBookingConfirmation(content)
    ) {
      const standaloneName = content
        .replace(/^(?:họ\s*và\s*tên|họ\s*tên|tên(?:\s+khách\s+hàng)?|(?:tôi|mình)\s+tên(?:\s+là)?|(?:tôi|mình)\s+là)\s*[:：]?\s*/iu, '')
        .trim();
      if (standaloneNamePattern.test(standaloneName) &&
          !/^(?:tôi|mình|em|anh|chị|muốn|cần|đặt|cắt|nhuộm|tóc|dạ|vâng|ừ|ok|okay|oke|chào|xin chào|được|đúng|chính xác|mai|hôm|ngày|làm|lúc|chiều|sáng|tối)\b/iu.test(standaloneName)) {
        name = standaloneName;
      }
    }
    if (name) contact.customer_name = name;
    if (phone) contact.customer_phone = phone;
    if (email) contact.customer_email = email;
  }

  return contact;
}

function formatBookingToolReply(result) {
  if (!result.success) {
    if (result.code === 'INVALID_PHONE' || result.code === 'INVALID_EMAIL') {
      return `Dạ, thông tin liên hệ chưa hợp lệ nên lịch chưa được xác nhận. ${result.message || result.error} Mình vui lòng kiểm tra và gửi lại thông tin chính xác nhé.`;
    }
    if (result.code === 'MISSING_NAME' || result.code === 'MISSING_PHONE') {
      return `Dạ, lịch chưa được xác nhận vì còn thiếu thông tin. ${result.message || result.error}`;
    }
    if (result.code === 'SLOT_CONFLICT' || result.code === 'SLOT_CAPACITY_EXCEEDED') {
      const alternatives = result.available_slots || [];
      return `Dạ, rất tiếc khung giờ ${result.appointment_time || ''} ngày ${result.appointment_date || ''} vừa không còn khả dụng.${alternatives.length ? ` Mình có thể chọn một trong các khung giờ còn trống: ${alternatives.slice(0, 6).join(', ')}.` : ' Mình vui lòng chọn ngày giờ khác để em kiểm tra lại ạ.'}`;
    }
    if (result.code === 'HOLD_EXPIRED') {
      return 'Dạ, thời gian giữ chỗ đã hết nên lịch chưa được xác nhận. Mình vui lòng chọn ngày giờ khác để em kiểm tra lại ạ.';
    }
    return `Dạ, hệ thống chưa xác nhận được lịch hẹn. ${result.message || result.error || 'Mình vui lòng thử lại sau hoặc chat với nhân viên để được hỗ trợ.'}`;
  }

  return `Dạ, hệ thống đã xác nhận lịch hẹn thành công.\n\n- Mã lịch hẹn: ${result.booking_code}\n- Thời gian: ${result.time} ngày ${result.date}\n- Trạng thái: Đã xác nhận\n\nMình vui lòng lưu lại mã lịch để tiện tra cứu ạ.`;
}

async function markBookingAsCompleted(context) {
  const updated = await conversationRepo.updateChatContext(context.conversationId, {
    booking_completed: true,
  });
  context.conversation.chat_context = updated.chat_context;
  context.chatContext = updated.chat_context;
}

const KNOWN_TOOLS = [
  'check_available_slots',
  'hold_appointment_slot',
  'confirm_appointment',
  'create_appointment',
  'get_business_hours',
  'get_appointment_details',
  'cancel_appointment',
];

function extractToolCallsFromContent(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();

  // 1. Direct or wrapped JSON: e.g. {"name":"check_available_slots","parameters":{"date":"2026-10-29"}}
  let candidate = trimmed;
  const mdMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) candidate = mdMatch[1].trim();

  const tagMatch = candidate.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (tagMatch) candidate = tagMatch[1].trim();

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') {
      const name = parsed.name || parsed.function?.name || parsed.tool;
      if (name && KNOWN_TOOLS.includes(name)) {
        const rawArgs = parsed.parameters || parsed.arguments || parsed.function?.arguments || parsed.args || parsed;
        const argumentsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
        return [{
          id: 'call_' + Math.random().toString(36).substring(2, 10),
          type: 'function',
          function: { name, arguments: argumentsStr }
        }];
      }
    }
  } catch {}

  // 2. Search embedded JSON with known tool name inside arbitrary content
  for (const tool of KNOWN_TOOLS) {
    const regex = new RegExp(`\\{\\s*"(?:name|tool|function)"\\s*:\\s*"${tool}"[\\s\\S]*?\\}(?:\\s*\\})?`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        const name = parsed.name || parsed.tool || parsed.function?.name;
        if (name === tool) {
          const rawArgs = parsed.parameters || parsed.arguments || parsed.function?.arguments || parsed.args || {};
          const argumentsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
          return [{
            id: 'call_' + Math.random().toString(36).substring(2, 10),
            type: 'function',
            function: { name, arguments: argumentsStr }
          }];
        }
      } catch {}
    }
  }

  return null;
}

function formatSlotsReply(date, slots, nextDate) {
  if (!slots || slots.length === 0) {
    const nextStr = nextDate ? `ngày tiếp theo (${nextDate})` : 'ngày hôm sau';
    return `Dạ, ngày ${date} salon hiện đã kín toàn bộ các khung giờ rồi ạ. Bạn có muốn em kiểm tra lịch trống của ${nextStr} không ạ?`;
  }
  return `Dạ, trong ngày ${date}, salon hiện còn các khung giờ trống sau:\n\n${slots.join(', ')}\n\nAnh/chị thuận tiện chọn khung giờ nào để em hỗ trợ đặt lịch ạ?`;
}

function formatBusinessHoursForDate(workingHours, date) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const weekday = date
    ? weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()]
    : null;
  const hours = weekday ? workingHours?.[weekday] : null;
  if (hours) {
    return hours.enabled
      ? `${hours.open}–${hours.close}`
      : 'ngày này salon nghỉ';
  }
  const uniqueHours = [...new Set(Object.values(workingHours || {})
    .filter(item => item?.enabled)
    .map(item => `${item.open}–${item.close}`))];
  return uniqueHours.length ? uniqueHours.join(', ') : 'chưa có giờ hoạt động được cấu hình';
}

async function handleBookingContinuation(userMessage, context) {
  const state = context.chatContext || {};
  if (
    !state.booking_started ||
    state.booking_service_confirmed !== true ||
    servicePricing.isPriceQuestion(userMessage)
  ) return null;
  if (context.activeHoldForConversation) return null;

  const hasSelectedService = Array.isArray(state.selected_service_ids) &&
    state.selected_service_ids.length > 0;
  if (!hasSelectedService) return null;
  if (state.booking_service_consultation_pending) return null;
  if (state.booking_service_just_selected) {
    await conversationRepo.updateChatContext(context.conversationId, {
      booking_service_just_selected: false,
      booking_service_confirmation_pending: Boolean(state.appointment_date && state.appointment_time),
    });
  }
  if (state.booking_service_confirmation_pending) {
    if (!isExplicitBookingConfirmation(userMessage)) {
      if (/(?:không|chưa|để sau|tư vấn thêm)/iu.test(userMessage)) {
        await conversationRepo.updateChatContext(context.conversationId, {
          booking_service_confirmation_pending: false,
          booking_started: false,
        });
        return null;
      }
    } else {
      await conversationRepo.updateChatContext(context.conversationId, {
        booking_service_confirmation_pending: false,
      });
    }
  }
  const selectedServices = await Promise.all(state.selected_service_ids.map(id =>
    productRepo.findById(id)
  ));
  const sizePricedServices = selectedServices.filter(service =>
    service?.prices_by_size && Object.keys(service.prices_by_size).length > 0
  );
  const servicesWithoutSizePrices = selectedServices.filter(service =>
    !service?.prices_by_size || Object.keys(service.prices_by_size).length === 0
  );
  if (servicesWithoutSizePrices.length > 0) {
    const names = servicesWithoutSizePrices.map(service => service?.name || 'dịch vụ đã chọn').join(', ');
    return `Dạ, ${names} chưa được cấu hình giá theo size nên hiện chưa thể kiểm tra lịch hoặc đặt dịch vụ này. Mình vui lòng chọn dịch vụ khác hoặc liên hệ nhân viên để được hỗ trợ ạ.`;
  }
  const parsedHairSize = servicePricing.parseHairSize(state.hair_length_text || '');
  const selectedHairSize = state.hair_size || parsedHairSize?.size;
  if (sizePricedServices.length > 0 && !selectedHairSize) {
    if (parsedHairSize?.ambiguous) {
      return `Dạ, em chưa xác định được size vì ${parsedHairSize.reason} Mình cho em biết size phù hợp trong dịch vụ để em kiểm tra lịch và giá chính xác ạ.`;
    }
    const sizeOptions = sizePricedServices.map(service => {
      const options = Object.entries(service.prices_by_size)
        .map(([size, tier]) => `${size}${tier.description ? ` (${tier.description})` : ''}`)
        .join(', ');
      return `${service.name}: ${options}`;
    }).join('; ');
    return `Dạ, dịch vụ mình chọn tính giá theo size. Mình cho em biết size tóc để em kiểm tra lịch và giá chính xác nhé ạ. Các size hiện có: ${sizeOptions}.`;
  }
  const productSizes = Object.fromEntries(sizePricedServices.map(service => [
    service.id,
    selectedHairSize,
  ]));
  const serviceWithUnavailableSize = sizePricedServices.find(service =>
    !service.prices_by_size[selectedHairSize]
  );
  if (serviceWithUnavailableSize) {
    const availableSizes = Object.entries(serviceWithUnavailableSize.prices_by_size)
      .map(([size, tier]) => `${size}${tier.description ? ` (${tier.description})` : ''}`)
      .join(', ');
    return `Dạ, dịch vụ ${serviceWithUnavailableSize.name} không có size ${selectedHairSize}. Các size hiện có: ${availableSizes}. Mình chọn giúp em một size trong danh sách nhé ạ.`;
  }
  const hasDyeService = selectedServices.some(service =>
    /nhuộm/iu.test(`${service?.name || ''} ${service?.category_name || ''}`)
  );
  if (hasDyeService) {
    const serviceNotes = state.booking_service_notes || '';
    const hasDyeColor = /(?:màu|nâu|vàng|khói|trà\s*sữa|rêu|đỏ|đen|tím|hạt\s*dẻ)/iu
      .test(serviceNotes);
    const hasHairLength = Boolean(
      state.hair_size ||
      state.hair_length_text ||
      servicePricing.parseHairSize(serviceNotes)?.size
    );
    if (!hasDyeColor || !hasHairLength) return null;
  }

  const hoursResult = JSON.parse(await executeTool('get_business_hours', {}, context));
  const businessHours = formatBusinessHoursForDate(
    hoursResult.workingHours,
    state.appointment_date || null
  );
  const currentTimeMentioned = conversationContextService.mentionsTime(userMessage);

  if (currentTimeMentioned && state.invalid_appointment_time) {
    const requested = userMessage.match(/\d{1,2}\s*(?:h|giờ)/iu)?.[0] || 'Giờ vừa cung cấp';
    return `Dạ, ${requested} không phải giờ hẹn hợp lệ. Giờ hoạt động${state.appointment_date ? ' ngày này' : ''} của salon là ${businessHours}. Mình chọn giúp em một giờ trong khung này nhé ạ.`;
  }

  if (state.appointment_time) {
    const [hour, minute] = state.appointment_time.split(':').map(Number);
    const requestedMinutes = hour * 60 + minute;
    const applicableHours = state.appointment_date
      ? (() => {
        const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const day = weekdays[new Date(`${state.appointment_date}T00:00:00Z`).getUTCDay()];
        return hoursResult.workingHours?.[day];
      })()
      : null;
    const isOutsideHours = applicableHours
      ? !applicableHours.enabled ||
        requestedMinutes < Number(applicableHours.open.slice(0, 2)) * 60 + Number(applicableHours.open.slice(3)) ||
        requestedMinutes >= Number(applicableHours.close.slice(0, 2)) * 60 + Number(applicableHours.close.slice(3))
      : Object.values(hoursResult.workingHours || {}).every(day =>
        !day?.enabled ||
        requestedMinutes < Number(day.open.slice(0, 2)) * 60 + Number(day.open.slice(3)) ||
        requestedMinutes >= Number(day.close.slice(0, 2)) * 60 + Number(day.close.slice(3))
      );
    if (isOutsideHours) {
      return `Dạ, salon hoạt động ${businessHours}${state.appointment_date ? ' vào ngày mình chọn' : ''}, nên chưa thể nhận lịch lúc ${state.appointment_time} ạ. Mình chọn giờ khác trong khung hoạt động giúp em nhé.`;
    }
  }

  if (!state.appointment_date || !state.appointment_time) return null;

  const availabilityResult = JSON.parse(await executeTool('check_available_slots', {
    date: state.appointment_date,
    product_ids: state.selected_service_ids,
    product_sizes: productSizes,
  }, context));
  if (!availabilityResult.success) {
    return `Dạ, em chưa thể xác nhận khung giờ này: ${availabilityResult.error || 'hệ thống chưa kiểm tra được lịch'}. Mình thử ngày giờ khác hoặc chat với nhân viên giúp em nhé ạ.`;
  }
  if (!(availabilityResult.slots || []).includes(state.appointment_time)) {
    await conversationRepo.updateChatContext(context.conversationId, {
      booking_confirmation_pending: false,
    });
    const alternatives = availabilityResult.slots || [];
    return alternatives.length
      ? `Dạ, lúc ${state.appointment_time} ngày ${state.appointment_date} hiện chưa còn chỗ. Các giờ salon còn trống là: ${alternatives.join(', ')}. Mình chọn giờ nào ạ?`
      : `Dạ, ngày ${state.appointment_date} hiện không còn giờ trống. Mình muốn em kiểm tra ngày khác không ạ?`;
  }

  const holdResult = JSON.parse(await executeTool('hold_appointment_slot', {
    appointment_date: state.appointment_date,
    appointment_time: state.appointment_time,
    product_ids: state.selected_service_ids,
    product_sizes: productSizes,
    notes: state.booking_service_notes || state.hair_length_text || null,
  }, context));
  if (!holdResult.success) return holdResult.message;

  await conversationRepo.updateChatContext(context.conversationId, {
    booking_confirmation_pending: false,
  });

  const contact = extractBookingContact(
    [...(context.history || []), { sender_type: 'user', content: userMessage }],
    context.conversation
  );
  const cleanPhone = appointmentService.cleanPhoneNumber(contact.customer_phone);
  if (contact.customer_phone && !appointmentService.PHONE_REGEX.test(cleanPhone)) {
    if (contact.customer_name) {
      await conversationRepo.updateCustomerInfo(context.conversationId, {
        name: contact.customer_name,
      });
    }
    return formatInvalidPhoneReply(contact.customer_phone);
  }
  if (cleanPhone) contact.customer_phone = cleanPhone;
  if (contact.customer_name || contact.customer_phone || contact.customer_email) {
    await conversationRepo.updateCustomerInfo(context.conversationId, {
      name: contact.customer_name,
      phone: contact.customer_phone,
      email: contact.customer_email,
    });
  }

  if (state.booking_confirmation_pending && isExplicitBookingConfirmation(userMessage)) {
    const result = JSON.parse(await executeTool('confirm_appointment', {
      customer_name: contact.customer_name,
      customer_phone: contact.customer_phone,
      customer_email: contact.customer_email,
      appointment_date: state.appointment_date,
      appointment_time: state.appointment_time,
      product_ids: state.selected_service_ids,
      product_sizes: productSizes,
      notes: state.booking_service_notes || state.hair_length_text || null,
    }, context));
    if (result.success && result.booking_code) await markBookingAsCompleted(context);
    if (!result.success && ['SLOT_CONFLICT', 'SLOT_CAPACITY_EXCEEDED'].includes(result.code)) {
      await conversationRepo.updateChatContext(context.conversationId, {
        booking_confirmation_pending: false,
      });
    }
    return formatBookingToolReply(result);
  }

  if (state.booking_confirmation_pending && /(?:không|chưa|sai|thay đổi)/iu.test(userMessage)) {
    await conversationRepo.updateChatContext(context.conversationId, {
      booking_confirmation_pending: false,
    });
  }

  if (contact.customer_name && contact.customer_phone) {
    await conversationRepo.updateChatContext(context.conversationId, {
      booking_confirmation_pending: true,
    });
  }
  return null;
}

async function buildSystemPrompt(conversation, targetDate = null) {
  const systemPromptSetting = await settingsRepo.get('ai_system_prompt');
  const siteName = await settingsRepo.get('site_name');
  const { rows: services } = await productRepo.findAll({ status: 'active', limit: 1000 });
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const todayVN = getVietnamDate(0);
  const tomorrowVN = getVietnamDate(1);
  const dayAfterVN = getVietnamDate(2);
  const currentTargetDate = targetDate || tomorrowVN;

  let prompt = systemPromptSetting ||
    'Bạn là trợ lý tư vấn sản phẩm và đặt lịch chuyên nghiệp, thân thiện.';

  const formatPrice = price => price === null || price === undefined
    ? 'chưa có giá được xác nhận'
    : `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
  const serviceCatalog = services.length
    ? services.map(service => {
      const duration = service.duration === null || service.duration === undefined
        ? 'chưa có thời lượng được xác nhận'
        : `${service.duration} phút`;
      const prices = Object.entries(service.prices_by_size || {}).map(([size, tier]) =>
        `${size}: ${formatPrice(tier.price)} (${tier.duration || duration}, ${tier.staff_count || service.staff_count || 'chưa rõ'} nhân viên)`
      ).join('; ') || 'chưa cấu hình giá theo size';
      const unit = service.price_unit === 'per_tap' ? '/tép' : '';
      return `- ID: ${service.id} | Nhóm: ${service.category_name || 'chưa phân loại'} (${service.category_description || 'chưa có mô tả nhóm'}) | ${service.name}: ${service.description || 'chưa có mô tả dịch vụ'} | Giá: ${prices}${unit} | Thời gian: ${duration} | Nhân viên: ${service.staff_count || 'chưa rõ'}`;
    }).join('\n')
    : '- Hiện chưa có dịch vụ nào được xác nhận trong danh sách.';

  prompt += `\n\n[DANH SÁCH DỊCH VỤ ĐANG HOẠT ĐỘNG — DỮ LIỆU ĐƯỢC PHÉP TƯ VẤN]\n${serviceCatalog}`;

  const chatContext = conversation?.chat_context || {};
  const selectedServices = await Promise.all(
    (chatContext.selected_service_ids || []).map(id => productRepo.findById(id))
  );
  const selectedServiceDetails = selectedServices
    .filter(Boolean)
    .map(service => `${service.name} (ID: ${service.id})`);
  prompt += `\n\n[TRẠNG THÁI ĐẶT LỊCH — DỮ LIỆU HỆ THỐNG]\n- Booking đang chờ chọn dịch vụ: ${Boolean(chatContext.booking_intent_pending)}
- Booking đã bắt đầu: ${Boolean(chatContext.booking_started)}
- Nhóm dịch vụ khách yêu cầu: ${chatContext.booking_requested_category || 'chưa xác định'}
- Dịch vụ đã chọn: ${chatContext.booking_service_confirmed && selectedServiceDetails.length ? selectedServiceDetails.join('; ') : 'chưa chọn (dịch vụ tư vấn chưa được khách xác nhận cho lượt đặt lịch)'}
- Ghi chú/kiểu tóc khách yêu cầu: ${chatContext.booking_service_notes || 'chưa có'}
- Ngày khách chọn: ${chatContext.appointment_date || 'chưa cung cấp'}
- Giờ khách chọn: ${chatContext.appointment_time || 'chưa cung cấp'}
- Giờ vừa nhập không hợp lệ: ${Boolean(chatContext.invalid_appointment_time)}
- Đang chờ tư vấn/xác định kiểu tóc: ${Boolean(chatContext.booking_service_consultation_pending)}
- Đang chờ xác nhận lựa chọn dịch vụ: ${Boolean(chatContext.booking_service_confirmation_pending)}
- Đang chờ khách xác nhận thông tin đặt lịch: ${Boolean(chatContext.booking_confirmation_pending)}
- Độ dài tóc đã xác định: ${chatContext.hair_size || chatContext.hair_length_text || 'chưa cung cấp'}
- Thông tin liên hệ đã lưu: họ tên ${conversation?.customer_name || 'chưa có'}, số điện thoại ${conversation?.customer_phone || 'chưa có'}, email ${conversation?.customer_email || 'chưa có'}`;

  prompt += `\n\n[QUY TẮC CHÀO HỎI VÀ MỞ ĐẦU HỘI THOẠI]
- Bạn là AI tư vấn của salon, không tự nhận là nhân viên thật. Lời chào mở đầu cấu hình của salon đã được đưa vào lịch sử hội thoại khi khách bắt đầu phiên.
- Nếu lịch sử đã có lời chào từ trợ lý, không chào lại; trả lời trực tiếp nội dung khách vừa gửi. Nếu khách vừa chào vừa hỏi cụ thể, chào tối đa một câu ngắn rồi ưu tiên giải đáp câu hỏi đó.
- Nếu chưa có lời chào trước đó và khách chỉ chào (ví dụ xin chào, hello, hi bạn, chào em), đáp lại ngắn gọn, tự nhiên và hỏi khách cần tìm hiểu dịch vụ, giá, thời lượng hay đặt lịch; không tự hỏi tên, số điện thoại hoặc email.
- Nếu khách hỏi AI hỗ trợ gì, nêu ngắn gọn các phạm vi đã xác nhận: tìm hiểu dịch vụ, tham khảo giá/thời lượng trong danh sách, và hướng dẫn đặt lịch trực tuyến.
- Nếu khách chỉ chào mà chưa nêu nhu cầu, kết thúc bằng một lời gợi mở phù hợp. Không lặp lại lời chào trong các lượt sau nếu không cần thiết.`;

  const handoffStatus = conversation?.mode === 'waiting_for_agent'
    ? 'Cuộc hội thoại đang chờ nhân viên tiếp nhận.'
    : conversation?.mode === 'human'
      ? `Cuộc hội thoại đang do nhân viên${conversation.agent_name ? ` ${conversation.agent_name}` : ''} tiếp nhận.`
      : 'Cuộc hội thoại hiện đang ở chế độ AI, chưa chuyển sang nhân viên.';
  prompt += `\n\n[TRẠNG THÁI HỖ TRỢ HIỆN TẠI — DỮ LIỆU HỆ THỐNG]\n- ${handoffStatus}
- Chỉ thông báo trạng thái này; không tự khẳng định nhân viên đã tiếp nhận nếu dữ liệu trạng thái không xác nhận.`;

  prompt += `

[TƯ VẤN KIỂU TÓC, NHIỀU DỊCH VỤ VÀ ẢNH THAM KHẢO]
- Khi khách hỏi một kiểu cụ thể (ví dụ layer), trước tiên tìm dịch vụ phù hợp trong danh sách đang hoạt động. Chỉ xác nhận salon có làm khi dịch vụ tương ứng thực sự có trong danh sách; nêu đúng dịch vụ và tư vấn theo mô tả đã xác nhận. Có thể hỏi độ dài tóc, mong muốn tạo kiểu hoặc đặc điểm cần biết, nhưng không khẳng định kiểu chắc chắn hợp với khuôn mặt/chất tóc khi thiếu thông tin.
- Nếu khách hỏi giá, ứng dụng sẽ tra cứu chính xác dịch vụ và giá S/M/L từ danh mục hoạt động. Chỉ nhắc lại giá có trong danh mục; không tự tính hoặc suy đoán giá. Nếu thiếu size, hỏi khách; nếu thiếu dịch vụ/giá hoặc tên dịch vụ mơ hồ, hỏi làm rõ và không báo giá.
- Quy ước size theo dữ liệu salon: S là tóc từ cằm trở lên; M là tóc từ cằm đến ngang vai; L là tóc từ ngang ngực trở xuống. Mốc cằm bị chồng lấn và khoảng từ ngang vai đến ngang ngực chưa được quy định; hỏi khách làm rõ thay vì tự phân loại.
- Dịch vụ nối tóc có giá theo từng tép; luôn ghi rõ đơn vị /tép. Thời lượng và số nhân viên phải theo đúng dòng dịch vụ/size trong danh mục.
- Khi khách chọn nhiều dịch vụ, tra từng dịch vụ và dùng đúng các ID trong danh mục. Chỉ tính tổng giá khi tất cả dịch vụ đều có giá xác nhận; nếu thiếu giá, nêu rõ chưa tính được tổng chính xác. Chỉ cộng thời lượng đã có dữ liệu thành thời lượng dự kiến; không khẳng định các dịch vụ được làm đồng thời. Lưu các dịch vụ đã chọn trong ngữ cảnh và truyền toàn bộ ID vào công cụ đặt lịch.
- Nếu khách thay đổi/bỏ một dịch vụ, cập nhật danh sách lựa chọn theo lời khách, không giữ lại dịch vụ đã bỏ; nhắc ngắn danh sách mới và hỏi ngày/giờ hoặc bước còn thiếu.
- Khi nhận hình tham khảo: chỉ nói đã nhận/xem hình nếu hình ảnh thực sự có trong nội dung đầu vào mà AI truy cập được. Nếu không thấy hình hoặc nền tảng không chuyển ảnh cho AI, nói rõ chưa xem được ảnh và đề nghị mô tả kiểu tóc/tải ảnh theo chức năng website nếu có. Nếu xem được ảnh, chỉ nhận xét các đặc điểm nhìn thấy và hỏi mong muốn/tình trạng tóc; không nhận diện chắc chắn mọi chi tiết, không hứa kết quả giống hệt hình.

[KỊCH BẢN PHẢN HỒI THEO NHU CẦU]
Áp dụng theo ý định của khách, không lặp nguyên văn nếu không tự nhiên. Các quy tắc kiểm tra dữ liệu, công cụ và trạng thái hệ thống ở trên luôn được ưu tiên hơn câu ví dụ:
1. Khách chỉ chào: nếu lời chào mở đầu đã có trong lịch sử, không chào lại dài dòng; đáp ngắn rằng em sẵn sàng hỗ trợ và gợi mở nhu cầu. Nếu chưa có lời chào, giới thiệu rõ là AI tư vấn website/salon, rồi hỏi khách cần hỗ trợ gì.
2. Khách hỏi danh sách dịch vụ/mặt hàng: chỉ giới thiệu mục đang có trong danh sách dịch vụ được cung cấp; có thể hướng dẫn xem mục sản phẩm/dịch vụ trên website. Không nói có mặt hàng/dịch vụ ngoài dữ liệu.
3. Khách muốn tìm mặt hàng/dịch vụ cụ thể: hỏi tên hoặc đặc điểm còn thiếu. Nếu tên/đặc điểm đã có trong hội thoại, dùng thông tin đó để tra cứu, không yêu cầu khách nhắc lại.
4. Khách hỏi chi tiết một mặt hàng/dịch vụ: dùng dịch vụ đang được nhắc đến trong ngữ cảnh nếu xác định được và trả lời theo dữ liệu; chỉ hỏi tên/chọn mục khi chưa xác định được.
5. Khách cần tư vấn lựa chọn: hỏi mục đích, mong muốn hoặc tiêu chí phù hợp; đề xuất lựa chọn trong danh sách, không khẳng định chắc chắn phù hợp khi thiếu thông tin.
6. Khách hỏi giá: xác định dịch vụ/mặt hàng rồi dùng giá từ danh sách. Hỏi tên hoặc size tóc chỉ khi thông tin đó thực sự cần để tìm mức giá; không dùng ví dụ giá làm giá thật.
7. Khách muốn đặt lịch: nếu chưa nêu dịch vụ, hỏi muốn sử dụng dịch vụ nào trước. Khi đã rõ dịch vụ, hỏi ngày và khoảng thời gian mong muốn; không hỏi lại thông tin khách đã cung cấp.
8. Khách hỏi ngày nào còn lịch (kể cả “ngày mai còn lịch trống không?”): gọi check_available_slots ngay cho đúng ngày, sau đó thông báo các khung giờ hệ thống trả về. Không hỏi khách chọn giờ trước khi đưa danh sách giờ trống.
9. Khách nêu một ngày và giờ cụ thể: gọi check_available_slots cho ngày đó với tổng thời lượng của các dịch vụ đã chọn. Không giữ chỗ tạm thời. Chỉ báo giờ còn trống nếu công cụ trả về đúng giờ đó; nếu không, báo không khả dụng và đề xuất các giờ do công cụ trả về.
10. Khi giờ còn trống, báo khách giờ đó có thể đặt và hỏi các thông tin bắt buộc còn thiếu (họ tên, số điện thoại); email tùy chọn. Khi có đủ thông tin, tóm tắt dịch vụ/ngày/giờ/thông tin liên hệ và hỏi xác nhận.
11. Chỉ gọi công cụ tạo lịch sau khi khách xác nhận rõ ràng. Hệ thống phải kiểm tra lại lịch khi tạo; chỉ báo thành công nếu công cụ trả về success: true cùng mã booking thực tế.
12. Khách hỏi lịch đã đặt chưa: chỉ khẳng định thành công khi lịch sử công cụ/hệ thống của phiên hiện tại xác nhận thành công và có mã thực tế. Khi được xác nhận, cung cấp mã, ngày và giờ đúng dữ liệu; nếu chưa xác nhận hoặc không tìm thấy trạng thái, nói rõ và hướng dẫn tra cứu/liên hệ nhân viên.
13. Khách muốn tra cứu lịch: hướng dẫn dùng mục Tra cứu lịch hẹn trên website và làm theo xác minh yêu cầu (mã đặt lịch cùng số điện thoại hoặc phương thức hệ thống hỗ trợ). Không tiết lộ lịch nếu chưa xác minh quyền sở hữu.
14. Khách không tìm thấy lịch: hướng dẫn kiểm tra lại thông tin xác minh và thử chức năng tra cứu trên website; nếu vẫn không được, đề nghị chuyển sang nhân viên.
15. Khách muốn gặp nhân viên: không nói đã chuyển nếu chưa có sự kiện chuyển giao. Hướng dẫn khách bấm nút “Chat với nhân viên” trên cửa sổ chat để gửi yêu cầu.
16. Khách hỏi vì sao chưa được trả lời: chỉ dựa vào trạng thái hỗ trợ hiện tại ở trên; nếu đang chờ tiếp nhận, giải thích đang chờ nhân viên và có thể gửi thêm nhu cầu. Không tự khẳng định thời gian chờ.
17. Khách hỏi nhân viên nào đang hỗ trợ: trả lời đúng trạng thái hệ thống ở trên; chỉ nêu tên khi hệ thống cung cấp, không tự bịa.
18. Khách muốn xem lịch sử chat: hướng dẫn xem các tin nhắn đang hiển thị trong cửa sổ chat/cuộn lên. Không cam kết dữ liệu được lưu nếu hệ thống không cung cấp lịch sử đó.
19. Khách hỏi ưu đãi/chính sách chưa có dữ liệu: nói chưa có thông tin xác nhận và hướng dẫn hỏi nhân viên; không tự tạo khuyến mãi hoặc điều kiện.
20. Khi lỗi/timeout trong lúc đặt lịch: nói hệ thống chưa xác nhận kết quả, xin lỗi ngắn gọn, không khẳng định thành công và không gửi lại yêu cầu tạo lịch một cách mù quáng. Hướng dẫn khách kiểm tra mục tra cứu lịch hẹn nếu đã có mã hoặc chuyển sang nhân viên để xác minh trạng thái trước khi thử lại.
21. Khách hỏi một kiểu tóc cụ thể: tra danh sách dịch vụ, chỉ xác nhận dịch vụ thực tế có trong dữ liệu; hỏi thêm độ dài/mong muốn nếu hữu ích, không đảm bảo kiểu phù hợp hoặc kết quả.
22. Khách gửi ảnh kiểu tóc: chỉ xác nhận đã nhận ảnh nếu ảnh thực sự được AI cung cấp; tư vấn các đặc điểm nhìn thấy khi có thể, hỏi khách muốn giữ nguyên hay điều chỉnh, và không cam kết kết quả giống ảnh. Nếu không thấy ảnh, lịch sự xin khách mô tả hoặc gửi qua chức năng hỗ trợ ảnh.
23. Khách chưa biết chọn kiểu nào: hỏi độ dài tóc và phong cách/mong muốn; đề xuất một vài dịch vụ có trong danh sách, nói rõ cần nhân viên đánh giá thêm nếu phụ thuộc chất tóc/khuôn mặt.
24. Khách hỏi giá cắt/nhuộm: dùng đúng giá và thời lượng trong danh sách. Chỉ yêu cầu size khi bảng giá hệ thống thật sự phân theo size; hiện không có bảng giá size S/M/L nên không bịa mức giá theo size. Với màu/dịch vụ cụ thể không có tên chính xác trong danh sách, không suy đoán đó là dịch vụ nào.
25. Khách hỏi tổng giá nhiều dịch vụ: lấy giá từng dịch vụ đã xác định và chỉ cộng các mức giá đã xác nhận; trình bày rõ tổng này chưa bao gồm khoản phát sinh chưa có dữ liệu. Nếu thiếu dịch vụ/giá, hỏi phần còn thiếu hoặc đề nghị nhân viên xác nhận.
26. Khách đồng ý nhiều dịch vụ hoặc bỏ/thay đổi dịch vụ: cập nhật tập dịch vụ theo lời khách, nhắc lại ngắn để xác nhận hiểu đúng, và dùng toàn bộ ID dịch vụ khi kiểm tra thời lượng/lịch và tạo lịch. Không hỏi lại lựa chọn khách vừa nêu.
27. Khách yêu cầu giờ trống hoặc nêu ngày/giờ: không đề nghị khách đến salon trực tiếp vì hiện chưa có địa điểm tiếp khách; giải thích đây là lịch hẹn trực tuyến. Luôn tra lịch thực tế cho ngày/giờ, tính đến thời lượng tổng đã xác nhận của các dịch vụ nếu có; chỉ báo giờ phù hợp công cụ trả về.
28. Giờ khách chọn đã kín: chỉ nói kín khi kết quả hệ thống xác nhận, rồi gợi ý giờ khác có trong kết quả kiểm tra; không tự đoán giờ thay thế.
29. Trước khi tạo lịch: tóm tắt đúng tập dịch vụ, ngày giờ, họ tên và số điện thoại đã có. Nếu thông tin bắt buộc còn thiếu, hỏi đúng phần thiếu. Thực hiện chốt bằng công cụ chỉ khi khách đã đồng ý rõ ràng và thông tin bắt buộc hợp lệ; sau đó chỉ báo thành công nếu công cụ trả success và booking_code thực tế.
30. Khách muốn nhân viên tư vấn trước khi quyết định: hướng dẫn dùng nút “Chat với nhân viên”; chỉ nói đã chuyển/đã có nhân viên khi trạng thái hệ thống xác nhận.
- Nếu khách vừa chào vừa có yêu cầu cụ thể, chỉ chào ngắn rồi ưu tiên xử lý yêu cầu. Nếu chưa nêu nhu cầu, kết thúc bằng lời gợi mở phù hợp.`;

  prompt += `\n\nThông tin hệ thống và thời gian (Múi giờ Việt Nam Asia/Ho_Chi_Minh, GMT+7):
- Salon / Website: ${siteName || 'Mây Hair Studio'}
- Thời gian hiện tại: ${now}
- Hôm nay là ngày: ${todayVN}
- Ngày mai là ngày: ${tomorrowVN}
- Ngày mốt / ngày kia là ngày: ${dayAfterVN}
- Ngày đang được đề cập trong cuộc hẹn: ${currentTargetDate}
- ID cuộc hội thoại: ${conversation?.id}`;

  if (conversation?.product_name) {
    prompt += `\n- Dịch vụ/Sản phẩm khách đang quan tâm: ${conversation.product_name}`;
  }

  if (conversation?.customer_name) {
    prompt += `\n- Họ tên khách hàng: ${conversation.customer_name}`;
  }

  if (conversation?.customer_phone) {
    prompt += `\n- SĐT khách hàng: ${conversation.customer_phone}`;
  }

  if (conversation?.customer_email) {
    prompt += `\n- Email khách hàng: ${conversation.customer_email}`;
  }

  // Check if there is an active hold slot for this conversation
  if (conversation?.id) {
    try {
      const activeHold = await appointmentRepo.findActiveHoldByConversation(conversation.id);
      if (activeHold) {
        prompt += `\n\n[TRẠNG THÁI GIỮ CHỖ HIỆN TẠI]: Cuộc hội thoại này ĐANG GIỮ CHỖ KHUNG GIỜ: ${activeHold.appointment_time} ngày ${activeHold.appointment_date}. Holding Token: ${activeHold.holding_token}. Hãy thu thập Họ tên và SĐT của khách để gọi công cụ confirm_appointment chốt lịch (Email là không bắt buộc / tuỳ chọn)!`;
      }
    } catch {}
  }

  prompt += `

QUY TẮC BẮT BUỘC ĐẶT LỊCH (BPMN 2.0 & SALON):
1. KIỂM TRA LỊCH TRỐNG & XỬ LÝ KHI KHÁCH HỎI GIỜ TRỐNG / GIỜ KHÁC:
   - TUYỆT ĐỐI KHÔNG tự bịa khung giờ trống. Chỉ hiển thị các khung giờ do công cụ check_available_slots trả về.
   - Khi khách hỏi "Còn trống khung giờ khác không?", "Còn giờ nào trống không?", "Có giờ khác không?", "Có khung giờ nào khác?", hoặc các câu tương tự:
     + BẮT BUỘC hiểu đây là yêu cầu tra cứu lịch trống thực tế từ hệ thống, KHÔNG PHẢI yêu cầu khách tự nhập giờ.
     + TUYỆT ĐỐI KHÔNG hỏi lại "bạn muốn đặt mấy giờ" hoặc yêu cầu khách tự nhập giờ khi chưa cung cấp danh sách giờ trống!
     + BẮT BUỘC gọi công cụ check_available_slots(date: "${currentTargetDate}") ngay lập tức. Nếu khách nói "ngày mai", phải xác định đúng ngày mai theo giờ Việt Nam (${tomorrowVN}).
     + Cung cấp danh sách các khung giờ còn trống trong ngày do công cụ trả về để khách tiện lựa chọn.
   - NẾU NGÀY ĐÓ KHÔNG CÒN KHUNG GIỜ TRỐNG NÀO (công cụ trả về slots: [] / kín lịch):
     + Thông báo rõ ràng và lịch sự rằng ngày đó salon hiện đã kín toàn bộ lịch.
     + CHỦ ĐỘNG đề xuất kiểm tra ngày tiếp theo và hỏi khách hàng có muốn xem lịch của ngày đó không.
   - NẾU CÔNG CỤ BÁO LỖI HOẶC KHÔNG CÓ DỮ LIỆU:
     + Thông báo rõ ràng cho khách về sự cố và đề xuất phương án tiếp theo: hỏi khách khung giờ dự kiến khác để kiểm tra lại hoặc gợi ý bấm "Chat với nhân viên" để được hỗ trợ trực tiếp.
   - Giờ mở cửa hoạt động của Salon là từ 08:30 đến 20:30 hàng ngày.

2. KIỂM TRA KHUNG GIỜ VÀ XỬ LÝ KHI GIỜ ĐÃ KÍN:
   - Chỉ sử dụng kết quả thật từ check_available_slots; không tự bịa giờ trống.
   - NẾU KHUNG GIỜ KHÁCH YÊU CẦU ĐÃ KÍN HOẶC CÔNG CỤ BÁO LỖI/TRANH CHẤP (SLOT_CONFLICT):
     + Thông báo lịch sự khung giờ đó không còn trống / đã kín chỗ.
     + Chủ động gợi ý các khung giờ còn trống khác trong ngày (hoặc gọi check_available_slots) để khách lựa chọn.
   - Khi khách chọn giờ cụ thể, máy chủ phải kiểm tra lại lịch và giữ chỗ tạm thời bằng backend. Chỉ nói đã giữ chỗ nếu thao tác backend thành công; sau đó tiếp tục thu thập thông tin.

3. THU THẬP THÔNG TIN VÀ KHÔNG HỎI LẠI THÔNG TIN ĐÃ CÓ:
   - KHÔNG yêu cầu khách cung cấp lại thông tin (Họ tên, SĐT) đã có trong hội thoại, trừ khi cần xác nhận hoặc thông tin đó không hợp lệ.
   - Khách hàng BẮT BUỘC phải cung cấp 2 thông tin liên hệ chính:
     + Họ và tên
     + Số điện thoại liên hệ (10 chữ số tại VN, ví dụ: 0901234567)
   - Địa chỉ Email là TUỲ CHỌN (KHÔNG BẮT BUỘC): Khách có thể cung cấp hoặc không. TUYỆT ĐỐI KHÔNG ép buộc, đòi hỏi hay từ chối chốt lịch nếu khách không có hoặc không muốn cung cấp email. Nếu khách cung cấp email thì lưu lại, nếu không có email thì bỏ qua và vẫn tiến hành chốt lịch bình thường.
   - Nếu thiếu thông tin, chỉ hỏi đúng phần còn thiếu. Chấp nhận họ tên và SĐT cùng một tin nhắn, kể cả khi khách không gắn nhãn; tách số điện thoại khỏi phần tên và chỉ hỏi lại khi thông tin không rõ.
   - Khi đã có đủ Họ tên và Số điện thoại, tóm tắt thông tin và chờ khách xác nhận trước khi chốt lịch.

4. XÁC NHẬN VÀ CHỐT LỊCH CHÍNH THỨC:
   - Khi đã có đủ Họ tên và SĐT (kèm Email nếu khách có cung cấp), tóm tắt lại thông tin cho khách: Tên, SĐT, Email (nếu có), Dịch vụ, Ngày và Giờ hẹn.
   - Chỉ sau khi khách xác nhận tóm tắt, gọi công cụ confirm_appointment để máy chủ kiểm tra lịch lần cuối và lưu lịch hẹn vào cơ sở dữ liệu.
   - TUYỆT ĐỐI KHÔNG tự bịa "Mã booking của bạn là BK-xxxx" khi chưa gọi công cụ confirm_appointment.
   - CHỈ thông báo thành công và cung cấp mã booking thực tế khi công cụ trả về success: true kèm booking_code.

5. Luôn giao tiếp bằng tiếng Việt lịch sự, thân thiện, chu đáo và chuyên nghiệp.`;

  prompt += `

[ĐIỀU PHỐI HỘI THOẠI ĐẶT LỊCH]
- Bạn là thành phần chính điều phối hội thoại: dùng lịch sử hội thoại và trạng thái đặt lịch ở trên để hiểu yêu cầu, nhận ra thông tin còn thiếu, rồi hỏi từng phần theo thứ tự: dịch vụ/kiểu tóc cần làm, ngày, giờ, họ tên và số điện thoại.
- Không hỏi lại dữ liệu đã có. Không tự kết luận dịch vụ/kiểu tóc khi khách chưa xác định rõ; dùng danh mục và hỏi làm rõ tự nhiên.
- Khi khách đã nêu ngày và giờ, chỉ thông báo khả dụng sau khi hệ thống kiểm tra; nếu backend đã giữ chỗ thành công, hỏi tiếp thông tin liên hệ còn thiếu.
- Khi đã có dịch vụ, ngày giờ và thông tin liên hệ, tóm tắt để khách xác nhận. Backend chỉ chốt lịch sau khi khách xác nhận rõ ràng.
- Không tự tạo giá, khung giờ trống, giữ chỗ, mã lịch hoặc lời xác nhận đặt lịch thành công.`;

  return prompt;
}

async function chat({ conversationId, guestSessionId, userMessage }) {
  // Get conversation context
  const conversation = await conversationRepo.findById(conversationId);
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  if (conversation.mode !== 'ai') {
    throw Object.assign(new Error('Conversation is not in AI mode'), { status: 400 });
  }

  // Build message history
  const history = await messageRepo.findForAI(conversationId, { limit: 20 });
  const explicitBookingRequest = /(?:đặt\s*(?:lịch|hẹn|chỗ)|muốn\s*đặt|giữ\s*chỗ)/iu
    .test(userMessage || '');

  if (conversation.chat_context?.booking_completed && explicitBookingRequest) {
    const updated = await conversationRepo.updateChatContext(conversationId, {
      selected_service_ids: [],
      booking_intent_pending: false,
      booking_started: false,
      booking_service_confirmed: false,
      booking_requested_category: null,
      booking_service_notes: null,
      booking_service_just_selected: false,
      booking_service_consultation_pending: false,
      booking_service_confirmation_pending: false,
      booking_confirmation_pending: false,
      booking_completed: false,
      appointment_date: null,
      appointment_time: null,
      invalid_appointment_time: false,
      hair_size: null,
      hair_length_text: null,
      pricing_inquiry_active: false,
    });
    conversation.chat_context = updated.chat_context;
  }

  if (isGreetingOnly(userMessage)) {
    return {
      content: 'Dạ, em sẵn sàng hỗ trợ mình ạ. Mình cần tư vấn dịch vụ, giá hay đặt lịch ạ?',
      aiConfigured: provider.isConfigured(),
    };
  }

  // Extract context details
  const bookingContextActive = conversation.chat_context?.booking_intent_pending ||
    conversation.chat_context?.booking_started;
  const targetDate = explicitBookingRequest || bookingContextActive
    ? extractDateFromText(userMessage) ||
      conversation.chat_context?.appointment_date ||
      getVietnamDate(1)
    : extractDateFromUserAndHistory(userMessage, history);
  const isAvailableSlotsQuery = detectAvailableSlotsQuery(userMessage);
  let activeHoldForConversation = await appointmentRepo.findActiveHoldByConversation(conversationId);
  const context = {
    conversationId,
    guestSessionId,
    customerConfirmed: detectConfirmation(userMessage),
    targetDate,
    history,
    conversation,
    activeHoldForConversation,
  };

  if (isServiceChangeRequest(userMessage)) {
    if (activeHoldForConversation) {
      const released = await appointmentService.releaseHoldSlot({
        holdingToken: activeHoldForConversation.holding_token,
        guestSessionId,
      });
      if (!released) {
        return {
          content: 'Dạ, em chưa thể thay đổi dịch vụ vì không cập nhật được khung giờ đang giữ. Anh/chị vui lòng thử lại hoặc chat với nhân viên để được hỗ trợ ạ.',
          aiConfigured: provider.isConfigured(),
        };
      }
      activeHoldForConversation = null;
      context.activeHoldForConversation = null;
    }
    const changedServiceRequest = userMessage
      .replace(/^.*?(?:đổi|thay đổi|thay)\s+(?:dịch vụ\s*)?(?:sang\s+)?/iu, '')
      .trim();
    const clearedContext = await conversationRepo.updateChatContext(conversationId, {
      selected_service_ids: [],
      booking_intent_pending: true,
      booking_started: false,
      booking_service_confirmed: false,
      booking_requested_category: null,
      booking_service_notes: null,
      booking_service_just_selected: false,
      booking_service_consultation_pending: false,
      booking_service_confirmation_pending: false,
      booking_confirmation_pending: false,
      hair_size: null,
      hair_length_text: null,
    });
    conversation.chat_context = clearedContext.chat_context;
    context.conversation = conversation;
    context.chatContext = clearedContext.chat_context;
    if (changedServiceRequest) {
      const refreshedConversation = await conversationRepo.findById(conversationId);
      const updatedContext = await conversationContextService.updateConversationContext(
        conversationId,
        refreshedConversation,
        changedServiceRequest,
        history
      );
      conversation.chat_context = updatedContext.chat_context;
      context.conversation = conversation;
      context.chatContext = updatedContext.chat_context;
      context.targetDate = updatedContext.chat_context.appointment_date || targetDate;
    }
  }

  if (activeHoldForConversation) {
    const requestedDate = extractDateFromText(userMessage);
    const requestedTime = extractTimeFromText(userMessage);
    const slotDate = requestedDate || conversation.chat_context?.appointment_date;
    const dateChanged = Boolean(
      slotDate && slotDate !== activeHoldForConversation.appointment_date
    );
    const timeChanged = Boolean(
      requestedTime && requestedTime !== activeHoldForConversation.appointment_time
    );
    if (dateChanged || timeChanged) {
      const released = await appointmentService.releaseHoldSlot({
        holdingToken: activeHoldForConversation.holding_token,
        guestSessionId,
      });
      if (!released) {
        return {
          content: 'Dạ, em chưa thể cập nhật lịch vì chưa giải phóng được khung giờ đang giữ. Anh/chị vui lòng thử lại hoặc chat với nhân viên để được hỗ trợ ạ.',
          aiConfigured: provider.isConfigured(),
        };
      }
      activeHoldForConversation = null;
      context.activeHoldForConversation = null;
    }
  }

  if (activeHoldForConversation) {
    const contact = extractBookingContact(
      [...history, { sender_type: 'user', content: userMessage }],
      conversation
    );
    const confirmationWasPending = conversation.chat_context?.booking_confirmation_pending === true;
    const cleanPhone = appointmentService.cleanPhoneNumber(contact.customer_phone);
    if (contact.customer_phone && !appointmentService.PHONE_REGEX.test(cleanPhone)) {
      if (contact.customer_name) {
        await conversationRepo.updateCustomerInfo(conversationId, {
          name: contact.customer_name,
        });
      }
      return {
        content: formatInvalidPhoneReply(contact.customer_phone),
        aiConfigured: provider.isConfigured(),
      };
    }
    if (cleanPhone) contact.customer_phone = cleanPhone;
    const explicitlyConfirmsBooking = isExplicitBookingConfirmation(userMessage);
    if (contact.customer_name || contact.customer_phone || contact.customer_email) {
      await conversationRepo.updateCustomerInfo(conversationId, {
        name: contact.customer_name,
        phone: contact.customer_phone,
        email: contact.customer_email,
      });
      conversation.customer_name = contact.customer_name || conversation.customer_name;
      conversation.customer_phone = contact.customer_phone || conversation.customer_phone;
      conversation.customer_email = contact.customer_email || conversation.customer_email;
    }
    if (
      confirmationWasPending &&
      contact.customer_name &&
      contact.customer_phone &&
      explicitlyConfirmsBooking
    ) {
      const result = JSON.parse(await executeTool('confirm_appointment', {
        customer_name: contact.customer_name,
        customer_phone: contact.customer_phone,
        customer_email: contact.customer_email,
      }, context));
      if (result.success && result.booking_code) await markBookingAsCompleted(context);
      return {
        content: formatBookingToolReply(result),
        aiConfigured: provider.isConfigured(),
      };
    }
    if (contact.customer_name && contact.customer_phone) {
      const updated = await conversationRepo.updateChatContext(conversationId, {
        booking_confirmation_pending: true,
      });
      conversation.chat_context = updated.chat_context;
    } else if (/(?:không|chưa|sai|thay đổi)/iu.test(userMessage)) {
      const updated = await conversationRepo.updateChatContext(conversationId, {
        booking_confirmation_pending: false,
      });
      conversation.chat_context = updated.chat_context;
    }
  }

  const updatedConversation = await conversationContextService.updateConversationContext(
    conversationId,
    conversation,
    userMessage,
    history
  );
  conversation.chat_context = updatedConversation.chat_context;
  context.conversation = conversation;
  context.chatContext = updatedConversation.chat_context;
  context.targetDate = updatedConversation.chat_context.appointment_date || targetDate;

  const bookingIsInProgress = context.chatContext.booking_intent_pending ||
    context.chatContext.booking_started ||
    context.chatContext.booking_service_confirmation_pending;
  if (/(?:muốn|cần|định)?\s*(?:đi\s*)?(?:làm tóc|làm đẹp tóc|thay đổi kiểu tóc)/iu.test(userMessage || '')) {
    if (bookingIsInProgress) {
      await conversationRepo.updateChatContext(conversationId, {
        selected_service_ids: [],
        booking_intent_pending: true,
        booking_started: false,
        booking_service_confirmed: false,
        booking_requested_category: null,
        booking_service_notes: null,
        booking_service_just_selected: false,
        booking_service_confirmation_pending: false,
        booking_service_consultation_pending: false,
        booking_confirmation_pending: false,
        hair_size: null,
        hair_length_text: null,
      });
      context.chatContext = {
        ...context.chatContext,
        selected_service_ids: [],
        booking_intent_pending: true,
        booking_started: false,
        booking_service_confirmed: false,
        booking_requested_category: null,
        booking_service_notes: null,
        booking_service_just_selected: false,
        booking_service_confirmation_pending: false,
        booking_service_consultation_pending: false,
        booking_confirmation_pending: false,
        hair_size: null,
        hair_length_text: null,
      };
      conversation.chat_context = context.chatContext;
    }
  }
  if (/\bbob\b/iu.test(userMessage || '') && bookingIsInProgress) {
    const services = (await productRepo.findAll({ status: 'active', page: 1, limit: 1000 })).rows;
    const haircutService = services.find(service =>
      service.category_name === 'Cắt tóc' && /cắt tạo kiểu/iu.test(service.name)
    );
    if (haircutService) {
      const updated = await conversationRepo.updateChatContext(conversationId, {
        selected_service_ids: [haircutService.id],
        booking_intent_pending: false,
        booking_started: true,
        booking_service_confirmed: true,
        booking_service_notes: `Cắt tóc bob${userMessage.trim() !== 'Cắt tóc bob' ? ` (${userMessage.trim()})` : ''}`,
        booking_service_just_selected: true,
        booking_service_consultation_pending: /tư vấn/iu.test(userMessage),
        booking_service_confirmation_pending: false,
        booking_confirmation_pending: false,
      });
      context.chatContext = updated.chat_context;
      conversation.chat_context = updated.chat_context;
    }
  }
  const hasSelectedService = Array.isArray(context.chatContext.selected_service_ids) &&
    context.chatContext.selected_service_ids.length > 0;
  const hasConfirmedBookingService =
    context.chatContext.booking_service_confirmed === true && hasSelectedService;
  const bookingFlowPendingService = (
    context.chatContext.booking_intent_pending ||
    context.chatContext.booking_started ||
    explicitBookingRequest
  ) && !hasConfirmedBookingService;
  if (bookingFlowPendingService) {
    if (!context.chatContext.booking_intent_pending || context.chatContext.booking_started) {
      const updated = await conversationRepo.updateChatContext(conversationId, {
        booking_intent_pending: true,
        booking_started: false,
        booking_confirmation_pending: false,
      });
      context.chatContext = updated.chat_context;
      conversation.chat_context = updated.chat_context;
    }
  }

  if (explicitBookingRequest && !hasConfirmedBookingService) {
    const updated = await conversationRepo.updateChatContext(conversationId, {
      selected_service_ids: [],
      booking_intent_pending: true,
      booking_started: false,
      booking_service_confirmed: false,
      booking_confirmation_pending: false,
    });
    conversation.chat_context = updated.chat_context;
    return {
      content: 'Dạ, anh/chị muốn đặt lịch sử dụng dịch vụ gì ạ? Em sẽ kiểm tra lịch sau khi xác định được dịch vụ mình muốn làm.',
      aiConfigured: provider.isConfigured(),
    };
  }

  const knownContact = extractBookingContact(
    [...history, { sender_type: 'user', content: userMessage }],
    conversation
  );
  const cleanKnownPhone = appointmentService.cleanPhoneNumber(knownContact.customer_phone);
  if (knownContact.customer_phone && appointmentService.PHONE_REGEX.test(cleanKnownPhone)) {
    knownContact.customer_phone = cleanKnownPhone;
  } else if (knownContact.customer_phone) {
    knownContact.customer_phone = '';
  }
  if (knownContact.customer_name || knownContact.customer_phone || knownContact.customer_email) {
    await conversationRepo.updateCustomerInfo(conversationId, {
      name: knownContact.customer_name,
      phone: knownContact.customer_phone,
      email: knownContact.customer_email,
    });
    conversation.customer_name = knownContact.customer_name || conversation.customer_name;
    conversation.customer_phone = knownContact.customer_phone || conversation.customer_phone;
    conversation.customer_email = knownContact.customer_email || conversation.customer_email;
  }

  const bookingReply = await handleBookingContinuation(userMessage, context);
  if (bookingReply) {
    return {
      content: bookingReply,
      aiConfigured: provider.isConfigured(),
    };
  }

  const bookingStateActive = context.chatContext.booking_intent_pending ||
    context.chatContext.booking_started;
  const shouldSuppressPendingPriceReply =
    (explicitBookingRequest || bookingStateActive) &&
    !servicePricing.isPriceQuestion(userMessage);
  const pricingResult = shouldSuppressPendingPriceReply
    ? null
    : await servicePricing.resolvePriceInquiry({
      userMessage,
      history,
      conversation,
    });
  if (pricingResult?.handled) {
    return {
      content: pricingResult.content,
      aiConfigured: provider.isConfigured(),
    };
  }

  const serviceInquiryResult = await servicePricing.resolveServiceInquiry({
    userMessage,
    conversation,
  });
  if (serviceInquiryResult?.handled) {
    return {
      content: serviceInquiryResult.content,
      aiConfigured: provider.isConfigured(),
    };
  }

  if (!provider.isConfigured()) {
    return {
      content: 'Xin lỗi, tính năng AI chưa được cấu hình. Bạn có thể bấm "Chat với nhân viên" để được hỗ trợ trực tiếp.',
      aiConfigured: false,
    };
  }

  const systemPrompt = await buildSystemPrompt(conversation, targetDate);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: m.sender_type === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  if (isAvailableSlotsQuery) {
    messages.push({
      role: 'system',
      content: `[CHỈ THỊ BẮT BUỘC]: Khách hàng đang hỏi các khung giờ còn trống hoặc giờ khác ("${userMessage}"). Bạn PHẢI gọi công cụ check_available_slots(date: "${targetDate}") ngay bây giờ để lấy danh sách giờ trống thực tế từ hệ thống. TUYỆT ĐỐI KHÔNG yêu cầu khách tự nhập giờ khi chưa cung cấp danh sách giờ trống!`
    });
  }

  // Agentic loop with tool calling
  let toolCallCount = 0;
  let currentMessages = [...messages];
  let finalContent = null;
  let checkedSlotsResult = null;
  let persistedBookingResult = null;
  const allowedTools = getAllowedTools(userMessage, history);
  const allowedToolNames = new Set(allowedTools.map(tool => tool.function.name));
  const providerRequestStartedAt = Date.now();

  try {
    while (toolCallCount < MAX_TOOL_CALLS) {
      const response = await provider.chat({
        messages: currentMessages,
        tools: allowedTools,
        toolChoice: 'auto',
      });

      const choice = response.choices?.[0];
      if (!choice || !choice.message || typeof choice.message !== 'object') {
        throw Object.assign(new Error('AI provider returned an invalid response shape'), {
          code: 'AI_PROVIDER_INVALID_RESPONSE',
          status: 502,
        });
      }

      const assistantMessage = choice.message;

      // Check if AI wants to call tools (either via native tool_calls or embedded in content)
      let toolCalls = assistantMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const extracted = extractToolCallsFromContent(assistantMessage.content);
        if (extracted && extracted.length > 0) {
          toolCalls = extracted;
          assistantMessage.tool_calls = extracted;
          // Clear raw JSON content from message so it's treated strictly as a tool call
          assistantMessage.content = null;
        }
      }

      // Interceptor: If user is inquiring about available slots but LLM did not make a tool call
      if ((!toolCalls || toolCalls.length === 0) && toolCallCount === 0 && isAvailableSlotsQuery) {
        console.log('[AI] Interceptor: User asked for available slots, executing check_available_slots for date:', targetDate);
        const synthToolCallId = 'call_check_slots_' + Math.random().toString(36).substring(2, 8);
        const toolResult = await executeTool('check_available_slots', { date: targetDate }, context);
        try {
          checkedSlotsResult = JSON.parse(toolResult);
        } catch {}

        currentMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: synthToolCallId,
            type: 'function',
            function: {
              name: 'check_available_slots',
              arguments: JSON.stringify({ date: targetDate })
            }
          }]
        });

        currentMessages.push({
          role: 'tool',
          tool_call_id: synthToolCallId,
          content: toolResult
        });

        toolCallCount++;
        continue;
      }

      if (toolCalls && toolCalls.length > 0) {
        toolCallCount += toolCalls.length;

        // Add assistant message with tool calls to context
        currentMessages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of toolCalls) {
          let args = {};
          try {
            args = typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments || '{}')
              : (toolCall.function.arguments || {});
          } catch (e) {
            console.error('[AI] Failed to parse tool args:', e.message);
          }

          if (!allowedToolNames.has(toolCall.function.name)) {
            console.warn(`[AI] Blocked tool call outside the current request intent: ${toolCall.function.name}`);
            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: false,
                error: 'Công cụ này không phù hợp với yêu cầu hiện tại. Hãy trả lời trực tiếp câu hỏi mới nhất bằng dữ liệu đã có, không suy diễn sang đặt lịch.',
              }),
            });
            continue;
          }

          console.log(`[AI] Calling tool: ${toolCall.function.name}`, args);
          const toolResult = await executeTool(toolCall.function.name, args, context);
          console.log(`[AI] Tool result:`, toolResult.substring(0, 200));

          if (['confirm_appointment', 'create_appointment'].includes(toolCall.function.name)) {
            const bookingResult = JSON.parse(toolResult);
            if (bookingResult.success && bookingResult.booking_code) {
              persistedBookingResult = bookingResult;
              await markBookingAsCompleted(context);
            }
          }

          if (toolCall.function.name === 'check_available_slots') {
            try { checkedSlotsResult = JSON.parse(toolResult); } catch {}
          }

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        // Continue loop to get final response
        continue;
      }

      // Final text response
      finalContent = assistantMessage.content || '';

      // Safety check 1: Intercept leaked tool call in finalContent
      const leakedTool = extractToolCallsFromContent(finalContent);
      if (leakedTool && leakedTool.length > 0) {
        console.log('[AI] Safety handler: Intercepted leaked tool call in finalContent:', leakedTool[0].function.name);
        const leaked = leakedTool[0];
        let args = {};
        try {
          args = typeof leaked.function.arguments === 'string'
            ? JSON.parse(leaked.function.arguments || '{}')
            : (leaked.function.arguments || {});
        } catch {}

        const toolResStr = await executeTool(leaked.function.name, args, context);
        try {
          const resObj = JSON.parse(toolResStr);
          if (
            ['confirm_appointment', 'create_appointment'].includes(leaked.function.name) &&
            resObj.success &&
            resObj.booking_code
          ) {
            persistedBookingResult = resObj;
            await markBookingAsCompleted(context);
          }
          if (leaked.function.name === 'check_available_slots') {
            checkedSlotsResult = resObj;
            finalContent = formatSlotsReply(resObj.date, resObj.slots, resObj.next_date);
          }
        } catch {}
      }

      break;
    }
  } catch (err) {
    console.error('[AI] Provider request failed', {
      provider: provider.getProviderName(),
      conversationId,
      errorName: err.name || 'Error',
      errorCode: err.code || 'AI_PROVIDER_REQUEST_FAILED',
      status: Number.isInteger(err.status) ? err.status : null,
      upstreamStatus: Number.isInteger(err.upstreamStatus) ? err.upstreamStatus : null,
      attempts: Number.isInteger(err.attempts) ? err.attempts : null,
      durationMs: Date.now() - providerRequestStartedAt,
    });
    if (isAvailableSlotsQuery) {
      try {
        const toolResult = await executeTool('check_available_slots', { date: targetDate }, context);
        const resObj = JSON.parse(toolResult);
        finalContent = formatSlotsReply(resObj.date, resObj.slots, resObj.next_date);
        return { content: finalContent, aiConfigured: provider.isConfigured() };
      } catch {}
    }
    finalContent = 'Dạ, hệ thống AI đang tạm thời gặp sự cố nên chưa thể trả lời lúc này. Thông tin đặt lịch hiện tại vẫn được giữ lại; mình vui lòng thử lại sau hoặc bấm “Chat với nhân viên” để được hỗ trợ ạ.';
    return { content: finalContent, aiConfigured: provider.isConfigured() };
  }

  if (finalContent === null) {
    finalContent = 'Xin lỗi, đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại.';
  }

  if (/(?:đã\s+(?:xác nhận|đặt lịch|đặt hẹn)|đặt lịch\s+thành công|đặt hẹn\s+thành công|booking\s*code)/iu.test(finalContent)) {
    const isAppointmentStatusInquiry = /(?:đặt chưa|đã đặt lịch chưa|lịch hẹn.*(?:trạng thái|xác nhận)|kiểm tra.*lịch hẹn)/iu.test(userMessage || '');
    const confirmedAppointment = persistedBookingResult ||
      (isAppointmentStatusInquiry
        ? await appointmentRepo.findConfirmedByConversation(conversationId)
        : null);
    finalContent = confirmedAppointment
      ? formatBookingToolReply({
        success: true,
        booking_code: confirmedAppointment.booking_code,
        date: confirmedAppointment.appointment_date,
        time: confirmedAppointment.appointment_time,
      })
      : 'Dạ, hiện hệ thống chưa xác nhận và lưu thành công lịch hẹn. Mình vui lòng chờ em kiểm tra hoặc chat với nhân viên để được hỗ trợ ạ.';
  }

  // Safety check 2: Prevent false claim "giữ chỗ tạm thời trong 5 phút" if slot hold failed or not held
  const activeHold = await appointmentRepo.findActiveHoldByConversation(conversationId);
  const isHoldActiveNow = activeHold && activeHold.hold_expires_at && new Date(activeHold.hold_expires_at).getTime() > Date.now();
  if (!isHoldActiveNow) {
    const falseHoldRegex = /(?:Chúng tôi|Em|Salon|Tôi)?\s*(?:sẽ\s+)?giữ chỗ tạm thời\s*(?:cho bạn\s*)?(?:trong\s*(?:5|10)\s*phút)?[^.!?\n]*[.!?]?/gi;
    if (falseHoldRegex.test(finalContent)) {
      console.log('[AI] Safety handler: Cleared false hold claim since no active hold exists in DB.');
      finalContent = finalContent.replace(falseHoldRegex, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  // Safety check 3: If user asked for available slots and finalContent STILL asks customer to enter time without listing slots
  if (isAvailableSlotsQuery && checkedSlotsResult) {
    const hasSlotMention = (checkedSlotsResult.slots || []).some(s => finalContent.includes(s));
    if (!hasSlotMention && (!checkedSlotsResult.slots || checkedSlotsResult.slots.length === 0)) {
      if (!finalContent.includes(checkedSlotsResult.next_date || 'ngày khác') && !finalContent.includes('tiếp theo')) {
        finalContent = formatSlotsReply(checkedSlotsResult.date, [], checkedSlotsResult.next_date);
      }
    } else if (!hasSlotMention && checkedSlotsResult.slots && checkedSlotsResult.slots.length > 0) {
      console.log('[AI] Safety handler: AI omitted slots from response. Applying formatSlotsReply.');
      finalContent = formatSlotsReply(checkedSlotsResult.date, checkedSlotsResult.slots, checkedSlotsResult.next_date);
    }
  }

  return { content: finalContent, aiConfigured: true };
}

module.exports = {
  chat,
  detectConfirmation,
  isGreetingOnly,
  extractBookingContact,
  extractToolCallsFromContent,
  formatSlotsReply,
  buildSystemPrompt,
};
