'use strict';

const productRepository = require('../repositories/productRepository');
const conversationRepository = require('../repositories/conversationRepository');
const { extractDateFromText, extractTimeFromText } = require('./tools');
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

async function updateConversationContext(conversationId, conversation, userMessage, history) {
  const context = { ...(conversation.chat_context || {}) };
  const message = String(userMessage || '');
  const normalizedMessage = normalizeText(message);
  const isPriceRequest = isPriceQuestion(message);
  const bookingServiceWasRequested = context.booking_intent_pending === true;
  const bookingServiceWasConfirmed = context.booking_service_confirmed === true;
  context.booking_service_just_selected = false;

  if (isPriceRequest) context.pricing_inquiry_active = true;
  else if (
    hasBookingLanguage(message) ||
    /(?:muốn|cần|định|tư vấn)\s+(?:đi\s*)?(?:đặt lịch|cắt|uốn|nhuộm|làm tóc|thay đổi kiểu tóc|kiểu tóc)/iu
      .test(message)
  ) {
    context.pricing_inquiry_active = false;
  }

  const { rows: services } = await productRepository.findAll({ status: 'active', page: 1, limit: 1000 });
  const currentServiceMatches = findDirectMatches(message, services);
  const categoryMatches = currentServiceMatches.length ? [] : findCategoryMatches(message, services);
  const pendingCategoryMatches = context.booking_requested_category
    ? findCategoryMatches(context.booking_requested_category, services)
    : [];
  const requestedCategoryMatches = categoryMatches.length ? categoryMatches : pendingCategoryMatches;
  const categoryName = requestedCategoryMatches[0]?.category_name || context.booking_requested_category;
  const detailedDyeRequest = categoryName === 'Nhuộm tóc' &&
    /(?:màu|nâu|vàng|khói|trà\s*sữa|rêu|đỏ|đen|tím)/iu.test(message);
  const detailedPermRequest = categoryName === 'Uốn tóc' &&
    /(?:xoăn|sóng|lọn|gợn|ngang vai|ngang ngực|ngực|lưng|ngắn|dài)/iu.test(message);
  const categoryService = requestedCategoryMatches.length === 1
    ? requestedCategoryMatches[0]
    : detailedDyeRequest
      ? requestedCategoryMatches.find(service =>
        /nhuộm/iu.test(service.name) && !/chấm chân/iu.test(service.name)
      )
      : detailedPermRequest
        ? requestedCategoryMatches.find(service =>
          /uốn/iu.test(service.name) && !/(?:mái|phồng|chân)/iu.test(service.name)
        )
      : null;
  if (currentServiceMatches.length) {
    context.selected_service_ids = currentServiceMatches.map(service => service.id);
  } else if (categoryService) {
    context.selected_service_ids = [categoryService.id];
  } else if (categoryMatches.length && (hasBookingLanguage(message) || bookingServiceWasRequested)) {
    context.selected_service_ids = [];
    context.booking_requested_category = categoryName;
  }

  const currentSize = parseHairSize(message);
  if (currentSize?.size) {
    context.hair_size = currentSize.size;
    context.hair_length_text = message;
  } else if (currentSize?.ambiguous) {
    context.hair_size = null;
    context.hair_length_text = message;
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
  if (bookingServiceWasRequested && bookingServiceWasMentioned) {
    context.booking_started = true;
    context.booking_intent_pending = false;
    context.booking_service_confirmed = true;
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
    if (bookingServiceWasMentioned) context.booking_service_confirmed = true;
    if (
      bookingServiceWasMentioned ||
      (bookingServiceWasConfirmed && hasSelectedService)
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
