'use strict';

const productRepository = require('../repositories/productRepository');
const conversationRepository = require('../repositories/conversationRepository');
const { extractDateFromText, extractTimeFromText } = require('./tools');
const {
  isPriceQuestion,
  parseHairSize,
  findDirectMatches,
  findCategoryMatches,
  isCategoryOnlyInquiry,
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
  context.booking_service_just_selected = false;

  if (isPriceRequest) {
    context.pricing_inquiry_active = true;
    context.hair_size_clarification_attempts = 0;
  } else if (
    hasBookingLanguage(message) ||
    /(?:muốn|cần|định|tư vấn)\s+(?:đi\s*)?(?:đặt lịch|cắt|uốn|nhuộm|làm tóc|thay đổi kiểu tóc|kiểu tóc)/iu
      .test(message)
  ) {
    context.pricing_inquiry_active = false;
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
    categoryMatches[0].category_name === selectedService.category_name &&
    !isCategoryOnlyInquiry(message, selectedService.category_name);
  const pendingCategoryMatches = context.booking_requested_category
    ? findCategoryMatches(context.booking_requested_category, services)
    : [];
  const requestedCategoryMatches = categoryMatches.length ? categoryMatches : pendingCategoryMatches;
  const categoryName = requestedCategoryMatches[0]?.category_name || context.booking_requested_category;
  const categoryService = requestedCategoryMatches.length === 1
    ? requestedCategoryMatches[0]
    : null;
  if (currentServiceMatches.length) {
    context.selected_service_ids = currentServiceMatches.map(service => service.id);
    context.service_interest_category = currentServiceMatches[0].category_name;
    context.booking_requested_category = null;
    context.selected_service_source = serviceWasForPricing
      ? 'price_inquiry'
      : hasBookingLanguage(message) || bookingServiceWasRequested
        ? 'booking_request'
        : 'service_consultation';
    if (!context.booking_started && !hasBookingLanguage(message)) {
      context.booking_service_confirmed = false;
    }
  } else if (categoryService) {
    context.selected_service_ids = [categoryService.id];
    context.service_interest_category = categoryService.category_name;
    context.booking_requested_category = null;
    context.selected_service_source = serviceWasForPricing
      ? 'price_inquiry'
      : hasBookingLanguage(message) || bookingServiceWasRequested
        ? 'booking_request'
        : 'service_consultation';
    if (!context.booking_started && !hasBookingLanguage(message)) {
      context.booking_service_confirmed = false;
    }
  } else if (categoryMatches.length && !preservesSelectedCategoryService) {
    context.service_interest_category = categoryName;
    context.selected_service_ids = [];
    context.selected_service_source = null;
    context.booking_service_confirmed = false;
    if (hasBookingLanguage(message) || bookingServiceWasRequested || context.booking_started) {
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
  const timeMentioned = mentionsTime(message);
  const time = extractTimeFromText(message);
  if (date) context.appointment_date = date;
  if (timeMentioned) {
    context.appointment_time = time;
    context.invalid_appointment_time = !time;
  }

  const hasSelectedService = Array.isArray(context.selected_service_ids) &&
    context.selected_service_ids.length > 0;
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
    if (bookingServiceWasMentioned || (
      identifiedServiceWasForConsultation &&
      Array.isArray(context.selected_service_ids) &&
      context.selected_service_ids.length > 0
    )) {
      context.booking_service_confirmed = true;
      context.selected_service_source = 'booking_request';
    }
    if (
      bookingServiceWasMentioned ||
      (bookingServiceWasConfirmed && hasSelectedService) ||
      (identifiedServiceWasForConsultation && hasSelectedService)
    ) {
      context.booking_started = true;
      context.booking_intent_pending = false;
    } else {
      context.booking_started = false;
      context.booking_intent_pending = true;
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
