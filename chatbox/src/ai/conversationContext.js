'use strict';

const productRepository = require('../repositories/productRepository');
const conversationRepository = require('../repositories/conversationRepository');
const {
  extractDateFromText,
  isInvalidCalendarDateText,
  extractTimeFromText,
  detectAvailableSlotsQuery,
} = require('./tools');
const {
  isPriceQuestion,
  parseHairSize,
  findDirectMatches,
  findCategoryMatches,
} = require('./servicePricing');

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}:]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function mentionsTime(value) {
  return /\b(?:\d{1,2}\s*(?:h(?:\d{1,2})?|gio(?:\s+\d{1,2}\s*phut?)?(?:\s*(?:sang|chieu|toi))?)|\d{1,2}:\d{2})\b/u
    .test(normalizeText(value));
}

function hasBookingLanguage(value) {
  return /(?:dat lich|dat hen|dat cho|muon dat|giu cho|hen|lam vao|lam ngay|thuc hien vao|dat vao)/u
    .test(normalizeText(value));
}

function getSelectedServiceDetails(services, selectedIds, hairSize) {
  const selectedServices = selectedIds
    .map(id => services.find(service => service.id === id))
    .filter(Boolean);
  if (!selectedServices.length || selectedServices.length !== selectedIds.length) {
    return { price: null, duration: null, staffCount: null };
  }

  const requirements = selectedServices.map(service => {
    const sizeTiers = service.prices_by_size &&
      typeof service.prices_by_size === 'object'
      ? service.prices_by_size
      : null;
    const hasSizeTiers = sizeTiers && Object.keys(sizeTiers).length > 0;
    const tier = hasSizeTiers && hairSize ? sizeTiers[hairSize] : null;
    if (hasSizeTiers && !tier) return null;
    return {
      price: Number(tier?.price ?? service.price),
      duration: Number(tier?.duration ?? service.duration_minutes ?? service.duration),
      staffCount: Number(tier?.staff_count ?? service.staff_count),
    };
  });
  if (requirements.some(item =>
    !item ||
    !Number.isFinite(item.price) ||
    item.price < 0 ||
    !Number.isFinite(item.duration) ||
    item.duration <= 0 ||
    !Number.isInteger(item.staffCount) ||
    item.staffCount <= 0
  )) {
    return { price: null, duration: null, staffCount: null };
  }

  return {
    price: requirements.reduce((total, item) => total + item.price, 0),
    duration: requirements.reduce((total, item) => total + item.duration, 0),
    staffCount: Math.max(...requirements.map(item => item.staffCount)),
  };
}

async function updateConversationContext(conversationId, conversation, userMessage, history) {
  const context = { ...(conversation.chat_context || {}) };
  const message = String(userMessage || '');
  const normalizedMessage = normalizeText(message);
  const isPriceRequest = isPriceQuestion(message);
  const serviceWasForPricing = isPriceRequest || context.pricing_inquiry_active === true;
  const bookingServiceWasRequested = context.booking_intent_pending === true;
  const bookingServiceWasConfirmed = context.booking_service_confirmed === true;
  const identifiedServiceWasForConsultation =
    context.selected_service_source === 'service_consultation';
  const availabilityQueryActive = context.availability_query_pending === true ||
    (Array.isArray(context.availability_query_service_ids) &&
      context.availability_query_service_ids.length > 0);
  const isAvailabilityRequest = detectAvailableSlotsQuery(message);
  const isServiceFollowup = /(?:tìm hiểu thêm|tư vấn thêm|nói rõ hơn|chi tiết hơn|cho tôi biết thêm|dịch vụ này như thế nào|làm như thế nào|có gì đặc biệt|phù hợp với tóc nào|nên chọn loại nào|tôi muốn biết thêm|giải thích thêm|mất bao lâu|bao lâu|giá sao|bao nhiêu tiền|có những loại nào)/iu
    .test(message);
  context.booking_service_just_selected = false;

  if (isPriceRequest) {
    context.pricing_inquiry_active = true;
    context.hair_size_clarification_attempts = 0;
    context.current_intent = 'ASK_PRICE';
  } else if (
    hasBookingLanguage(message) ||
    /(?:muốn|cần|định|tư vấn)\s+(?:đi\s*)?(?:đặt lịch|cắt|uốn|nhuộm|làm tóc|thay đổi kiểu tóc|kiểu tóc)/iu
      .test(message)
  ) {
    context.pricing_inquiry_active = false;
    context.current_intent = hasBookingLanguage(message)
      ? 'BOOK_APPOINTMENT'
      : 'CONSULT_SERVICE';
  } else if (isAvailabilityRequest || availabilityQueryActive) {
    context.current_intent = 'CHECK_AVAILABILITY';
  } else if (isServiceFollowup && context.selected_service_ids?.length) {
    context.current_intent = 'CONSULT_SERVICE';
  }

  const { rows: services } = await productRepository.findAll({ status: 'active', page: 1, limit: 1000 });
  const currentServiceMatches = findDirectMatches(message, services);
  const categoryMatches = currentServiceMatches.length ? [] : findCategoryMatches(message, services);
  const selectedIds = Array.isArray(context.selected_service_ids)
    ? context.selected_service_ids
    : [];
  const selectedService = services.find(service => selectedIds.includes(service.id));
  const preservesSelectedCategoryService =
    selectedService &&
    categoryMatches.length &&
    categoryMatches.some(service => service.id === selectedService.id);
  const pendingCategoryMatches = context.booking_requested_category
    ? findCategoryMatches(context.booking_requested_category, services)
    : [];
  const requestedCategoryMatches = categoryMatches.length ? categoryMatches : pendingCategoryMatches;
  const categoryName = requestedCategoryMatches[0]?.category_name || context.booking_requested_category;
  const categoryService = requestedCategoryMatches.length === 1
    ? requestedCategoryMatches[0]
    : null;
  if (currentServiceMatches.length) {
    const matchedIds = currentServiceMatches.map(service => service.id);
    const selectionChanged = selectedIds.length > 0 &&
      (selectedIds.length !== matchedIds.length ||
        selectedIds.some(id => !matchedIds.includes(id)));
    if (selectionChanged) {
      context.hair_size = null;
      context.hair_length_text = null;
      context.booking_service_notes = null;
    }
    context.selected_service_ids = matchedIds;
    context.service_interest_category = currentServiceMatches[0].category_name;
    context.consultation_topic = currentServiceMatches.length === 1
      ? currentServiceMatches[0].name
      : currentServiceMatches[0].category_name;
    context.booking_requested_category = null;
    context.selected_service_source = serviceWasForPricing
      ? 'price_inquiry'
      : hasBookingLanguage(message) || bookingServiceWasRequested || availabilityQueryActive
        ? 'booking_request'
        : 'service_consultation';
    if (!isPriceRequest) {
      context.pricing_inquiry_active = false;
      context.current_intent = hasBookingLanguage(message) || bookingServiceWasRequested
        ? 'BOOK_APPOINTMENT'
        : availabilityQueryActive
          ? 'CHECK_AVAILABILITY'
          : 'CONSULT_SERVICE';
    }
    if (!context.booking_started && !hasBookingLanguage(message) && !availabilityQueryActive) {
      context.booking_service_confirmed = false;
    }
  } else if (categoryService) {
    const selectionChanged = selectedIds.length > 0 &&
      (selectedIds.length !== 1 || selectedIds[0] !== categoryService.id);
    if (selectionChanged) {
      context.hair_size = null;
      context.hair_length_text = null;
      context.booking_service_notes = null;
    }
    context.selected_service_ids = [categoryService.id];
    context.service_interest_category = categoryService.category_name;
    context.consultation_topic = categoryService.name;
    context.booking_requested_category = null;
    context.selected_service_source = serviceWasForPricing
      ? 'price_inquiry'
      : hasBookingLanguage(message) || bookingServiceWasRequested || availabilityQueryActive
        ? 'booking_request'
        : 'service_consultation';
    if (!isPriceRequest) {
      context.pricing_inquiry_active = false;
      context.current_intent = hasBookingLanguage(message) || bookingServiceWasRequested
        ? 'BOOK_APPOINTMENT'
        : availabilityQueryActive
          ? 'CHECK_AVAILABILITY'
          : 'CONSULT_SERVICE';
    }
    if (!context.booking_started && !hasBookingLanguage(message) && !availabilityQueryActive) {
      context.booking_service_confirmed = false;
    }
  } else if (categoryMatches.length && !preservesSelectedCategoryService) {
    context.service_interest_category = categoryName;
    context.selected_service_ids = [];
    context.service_id = null;
    context.service_name = null;
    context.consultation_topic = categoryName;
    context.selected_service_source = null;
    context.booking_service_confirmed = false;
    context.hair_size = null;
    context.hair_length_text = null;
    context.booking_service_notes = null;
    if (
      hasBookingLanguage(message) ||
      bookingServiceWasRequested ||
      context.booking_started ||
      availabilityQueryActive
    ) {
      context.booking_requested_category = categoryName;
    }
  }

  const currentSize = parseHairSize(message);
  const previousAssistantMessage = [...history]
    .reverse()
    .find(item => item.sender_type === 'assistant');
  const assistantAskedForHairSize =
    /(?:size\s+s|độ dài tóc|tóc dài đến đâu)/iu.test(previousAssistantMessage?.content || '');
  const assistantAskedForService =
    /(?:dịch vụ nào|chọn dịch vụ|dịch vụ cụ thể|tên dịch vụ)/iu
      .test(previousAssistantMessage?.content || '');
  if (currentServiceMatches.length || categoryService) {
    context.service_selection_clarification_attempts = 0;
  } else if (assistantAskedForService) {
    context.service_selection_clarification_attempts =
      Number(context.service_selection_clarification_attempts || 0) + 1;
  }
  if (currentSize?.size) {
    context.hair_size = currentSize.size;
    context.hair_length_text = message;
    context.hair_size_clarification_attempts = 0;
  } else if (
    currentSize?.ambiguous ||
    (context.pricing_inquiry_active && assistantAskedForHairSize)
  ) {
    context.hair_size = null;
    context.hair_length_text = message;
    if (context.pricing_inquiry_active && assistantAskedForHairSize) {
      context.hair_size_clarification_attempts =
        Number(context.hair_size_clarification_attempts || 0) + 1;
    }
  }

  const date = extractDateFromText(message);
  const invalidDate = isInvalidCalendarDateText(message);
  const timeMentioned = mentionsTime(message);
  const time = extractTimeFromText(message);
  const dateChanged = Boolean(date && date !== context.appointment_date);
  const timeChanged = Boolean(time && time !== context.appointment_time);
  if (date) {
    context.appointment_date = date;
    context.invalid_appointment_date = false;
  } else if (invalidDate) {
    context.invalid_appointment_date = true;
  }
  if (timeMentioned) {
    context.appointment_time = time;
    context.invalid_appointment_time = !time;
  }
  if (dateChanged || timeChanged) {
    context.booking_confirmation_pending = false;
    if (context.booking_started) {
      context.booking_status = 'COLLECTING_BOOKING_DETAILS';
    }
    if (context.availability_query_pending && date) {
      context.availability_query_date = date;
    }
  }

  const hasSelectedService = Array.isArray(context.selected_service_ids) &&
    context.selected_service_ids.length > 0;
  if (hasSelectedService) {
    const selectedServiceNames = context.selected_service_ids
      .map(id => services.find(service => service.id === id)?.name)
      .filter(Boolean);
    context.service_id = context.selected_service_ids.length === 1
      ? context.selected_service_ids[0]
      : null;
    context.service_name = selectedServiceNames.length === 1
      ? selectedServiceNames[0]
      : selectedServiceNames.join(' + ') || null;
    const details = getSelectedServiceDetails(
      services,
      context.selected_service_ids,
      context.hair_size,
    );
    context.service_price = details.price;
    context.service_duration = details.duration;
    context.service_staff_count = details.staffCount;
  } else {
    context.service_id = null;
    context.service_name = null;
    context.service_price = null;
    context.service_duration = null;
    context.service_staff_count = null;
  }
  const serviceWasMentioned = currentServiceMatches.length > 0 || Boolean(categoryService);
  const bookingServiceWasMentioned = serviceWasMentioned && !isPriceRequest;
  const mentionsContact = /(?:\+?84|0)\d(?:[\s().-]?\d){8,10}|[^\s@]+@[^\s@]+\.[^\s@]+/u.test(message);
  if (
    hasSelectedService &&
    context.booking_started &&
    !date &&
    !timeMentioned &&
    !mentionsContact &&
    !isPriceRequest &&
    !hasBookingLanguage(message)
  ) {
    context.booking_service_notes = [context.booking_service_notes, message]
      .filter(Boolean)
      .filter((note, index, notes) => notes.indexOf(note) === index)
      .join(' | ');
  }
  if (
    (bookingServiceWasRequested || hasBookingLanguage(message)) &&
    bookingServiceWasMentioned
  ) {
    context.booking_started = true;
    context.booking_intent_pending = false;
    context.booking_service_confirmed = true;
    context.selected_service_source = 'booking_request';
    context.booking_service_just_selected = true;
    context.booking_requested_category = null;
    context.booking_service_notes = message;
    context.pricing_inquiry_active = false;
  } else if (context.booking_started && bookingServiceWasMentioned) {
    context.booking_service_confirmed = true;
    context.booking_service_just_selected = true;
    context.booking_service_notes = message;
    context.booking_confirmation_pending = false;
    context.booking_service_confirmation_pending = false;
  }
  if (hasBookingLanguage(message)) {
    if (bookingServiceWasMentioned || hasSelectedService) {
      context.booking_service_confirmed = true;
      context.selected_service_source = 'booking_request';
    }
    if (
      bookingServiceWasMentioned || hasSelectedService ||
      (bookingServiceWasConfirmed && hasSelectedService) ||
      (identifiedServiceWasForConsultation && hasSelectedService)
    ) {
      context.booking_started = true;
      context.booking_intent_pending = false;
      context.booking_status = 'COLLECTING_BOOKING_DETAILS';
      context.current_intent = 'BOOK_APPOINTMENT';
    } else {
      context.booking_started = false;
      context.booking_intent_pending = true;
      context.booking_status = 'SELECTING_SERVICE';
      context.current_intent = 'BOOK_APPOINTMENT';
    }
  }
  const priorAssistantAskedBookingDetails = [...history]
    .reverse()
    .find(item => item.sender_type === 'assistant');
  const assistantAskedBookingDetails = /(?:ngày|giờ|khung giờ|đặt lịch)/iu
    .test(priorAssistantAskedBookingDetails?.content || '');
  if (context.booking_service_confirmed && hasSelectedService && (
    hasBookingLanguage(message) ||
    (context.booking_started && (date || timeMentioned)) ||
    (assistantAskedBookingDetails && (date || timeMentioned))
  )) {
    context.booking_started = true;
    context.pricing_inquiry_active = false;
  }
  if (
    context.current_intent === 'BOOK_APPOINTMENT' &&
    hasSelectedService &&
    (date || timeMentioned)
  ) {
    context.booking_started = true;
    context.booking_intent_pending = false;
    context.booking_service_confirmed = true;
    context.selected_service_source = 'booking_request';
    context.pricing_inquiry_active = false;
  }

  if (isPriceRequest && !hasBookingLanguage(normalizedMessage)) {
    context.pricing_inquiry_active = true;
  }

  const updated = await conversationRepository.updateChatContext(conversationId, context);
  if (!updated) throw Object.assign(new Error('Conversation not found while updating chat context'), { status: 404 });
  return updated;
}

module.exports = {
  mentionsTime,
  updateConversationContext,
};
