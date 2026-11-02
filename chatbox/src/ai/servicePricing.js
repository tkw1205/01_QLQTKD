'use strict';

const productRepository = require('../repositories/productRepository');

const SIZE_LABELS = {
  S: 'tóc ngắn',
  M: 'tóc lỡ',
  L: 'tóc dài',
};

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isPriceQuestion(value) {
  const text = normalizeText(value);
  return /\b(?:gia|bao nhieu|chi phi|bang gia|bao tien|tien)\b/u.test(text);
}

function parseHairSize(value) {
  const text = normalizeText(value);
  const explicitSize = text.match(/\b(?:size|co)\s*([sml])\b/u);
  if (explicitSize) return { size: explicitSize[1].toUpperCase() };
  if (/^[sml]$/u.test(text)) return { size: text.toUpperCase() };

  if (/\b(?:qua|duoi)\s+vai\b.*\b(?:chua\s+(?:den|toi|ngang))\s+nguc\b/u.test(text)) {
    return { ambiguous: true, reason: 'Quy ước chưa phân loại rõ độ dài sau vai nhưng chưa đến ngực.' };
  }
  if (/\b(?:ngang\s+hong|toi\s+ngang\s+hong|den\s+ngang\s+hong|cham\s+hong|qua\s+hong|duoi\s+hong|hon\s+nguc|qua\s+nguc|duoi\s+nguc|ngang\s+nguc|cham\s+nguc|den\s+nguc|toi\s+nguc|tu\s+nguc\s+tro\s+xuong)\b/u.test(text)) {
    return { size: 'L' };
  }
  if (/\b(?:ngang|toi|den|cham)\s+cam\b|\btu cam tro len\b/u.test(text)) {
    return { ambiguous: true, reason: 'Mốc cằm được bao gồm trong cả quy ước size S và M.' };
  }
  if (/\b(?:qua vai|duoi vai|ngang lung|toi lung|duoi lung|den lung)\b/u.test(text)) {
    return { ambiguous: true, reason: 'Quy ước chưa phân loại rõ độ dài sau vai nhưng chưa đến ngực.' };
  }
  if (/\b(?:toc lo|toc ngang vai|ngang vai|den vai|toi vai|cham vai|tu cam den vai|tu cam toi vai)\b/u.test(text)) {
    return { size: 'M' };
  }
  if (/\b(?:toc ngan|ngan hon cam|tren cam|cao hon cam)\b/u.test(text)) {
    return { size: 'S' };
  }
  if (/\b(?:toc dai|dai)\b/u.test(text)) {
    return { ambiguous: true, reason: 'Cần xác nhận tóc dài đến ngang ngực hay chưa để chọn size L.' };
  }
  return null;
}

function findPendingPriceQuestion(history, userMessage) {
  const previous = [...history];
  const last = previous[previous.length - 1];
  if (
    last?.sender_type === 'user' &&
    normalizeText(last.content) === normalizeText(userMessage)
  ) {
    previous.pop();
  }

  let assistantIndex = -1;
  for (let i = previous.length - 1; i >= 0; i--) {
    if (previous[i].sender_type === 'assistant') {
      assistantIndex = i;
      break;
    }
  }
  if (assistantIndex < 0) return null;

  const assistantText = normalizeText(previous[assistantIndex].content);
  const waitingForSize = /\b(?:size|do dai toc|toc thuoc loai)\b/u.test(assistantText);
  const waitingForService = /\b(?:dich vu nao|chon dich vu|dich vu cu the|ten dich vu)\b/u.test(assistantText);
  if (!waitingForSize && !waitingForService) return null;

  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (previous[i].sender_type === 'user' && isPriceQuestion(previous[i].content)) {
      return {
        request: previous[i].content,
        waitingForSize,
        waitingForService,
      };
    }
  }
  return null;
}

function includesPhrase(text, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase.length > 1 && ` ${text} `.includes(` ${normalizedPhrase} `);
}

function findDirectMatches(query, services) {
  const text = normalizeText(query);
  const matchedPhrases = [];
  for (const service of services) {
    const phrases = [service.name, ...(service.aliases || [])];
    for (const phrase of phrases) {
      if (includesPhrase(text, phrase)) {
        matchedPhrases.push({ service, phrase: normalizeText(phrase) });
      }
    }
  }
  const specificPhrases = matchedPhrases.filter(match =>
    !matchedPhrases.some(other =>
      other.service.id !== match.service.id &&
      other.phrase.length > match.phrase.length &&
      includesPhrase(other.phrase, match.phrase)
    )
  );
  return [...new Map(specificPhrases.map(match => [match.service.id, match.service])).values()];
}

function findCategoryMatches(query, services) {
  const text = normalizeText(query);
  const matchedCategories = new Set();
  const categoryAliases = {
    'cắt tóc': ['cat toc'],
    'gội đầu và tạo kiểu': ['goi dau va tao kieu'],
    'uốn tóc': ['uon toc', 'uon'],
    'duỗi tóc': ['duoi toc', 'duoi'],
    'nhuộm tóc': ['nhuom toc', 'nhuom'],
    'phục hồi và dưỡng tóc': ['phuc hoi', 'duong toc'],
    'nối tóc': ['noi toc', 'noi'],
    'tẩy tóc': ['tay toc', 'tay'],
  };

  for (const service of services) {
    const categoryName = service.category_name;
    const aliases = categoryAliases[categoryName] || [categoryName];
    if (aliases.some(alias => includesPhrase(text, alias))) {
      matchedCategories.add(categoryName);
    }
  }

  return services.filter(service => matchedCategories.has(service.category_name));
}

function formatPrice(price) {
  return `${new Intl.NumberFormat('vi-VN').format(price)} VNĐ`;
}

function formatServicePrice(service, size) {
  const tier = service.prices_by_size?.[size];
  if (!tier || tier.price === null || tier.price === undefined || !Number.isFinite(Number(tier.price))) {
    return `Dạ, danh mục hiện chưa có giá size ${size} cho dịch vụ ${service.name}, nên em chưa thể báo giá chính xác ạ.`;
  }

  const unit = service.price_unit === 'per_tap' ? '/tép' : '';
  const duration = Number(tier.duration ?? service.duration);
  const staffCount = Number(tier.staff_count ?? service.staff_count);
  return `- ${service.name}: ${formatPrice(Number(tier.price))}${unit} (size ${size}), ${duration} phút, ${staffCount} nhân viên.`;
}

function buildSizeQuestion(serviceNames) {
  const serviceLabel = serviceNames.length === 1
    ? `dịch vụ ${serviceNames[0]}`
    : `các dịch vụ ${serviceNames.join(', ')}`;
  return `Dạ, giá ${serviceLabel} được tính theo size tóc. Mình cho em biết tóc thuộc size S, M hay L ạ?`;
}

function buildBoundaryQuestion(reason) {
  return `Dạ, em chưa xác định được size vì ${reason} Mình cho em biết size S, M, L hoặc mô tả tóc dài đến đâu để em báo đúng giá ạ?`;
}

function buildAmbiguousServiceReply(services, query) {
  const categoryName = services[0]?.category_name;
  const names = services.map(service => service.name);
  const hasSpecificUnknownName = /\b(?:setting|keratin|balayage|ombre|pixie|layer|mullet|side part)\b/iu.test(query) &&
    !services.some(service => includesPhrase(normalizeText(query), service.name));
  const lead = hasSpecificUnknownName
    ? `Dạ, em chưa thấy dịch vụ đúng tên trong danh mục. Nhóm ${categoryName} hiện có`
    : `Dạ, nhóm ${categoryName} hiện có`;
  return `${lead}: ${names.join('; ')}. Mình muốn hỏi giá dịch vụ nào ạ?`;
}

async function resolveServiceInquiry({ userMessage, conversation = null }) {
  const chatContext = conversation?.chat_context || {};
  if (
    isPriceQuestion(userMessage) ||
    chatContext.pricing_inquiry_active ||
    chatContext.booking_intent_pending ||
    chatContext.booking_started
  ) return null;

  const normalizedMessage = normalizeText(userMessage);
  if (/\b(?:muon\s+)?lam\s+toc\b/u.test(normalizedMessage)) {
    return {
      handled: true,
      content: 'Dạ, anh/chị đang muốn cắt, uốn, nhuộm hay phục hồi tóc ạ?',
    };
  }

  if (/\bbob\b/u.test(normalizedMessage)) {
    if (/\b(?:tu van|tham khao|tim hieu)\b/u.test(normalizedMessage)) {
      return {
        handled: true,
        content: 'Dạ, em có thể hỗ trợ anh/chị tư vấn kiểu tóc bob. Anh/chị muốn kiểu bob ngắn hay bob ngang vai ạ?',
      };
    }
    return {
      handled: true,
      content: 'Dạ, anh/chị muốn cắt kiểu tóc bob ạ. Anh/chị muốn tư vấn thêm về kiểu tóc bob hay muốn đặt lịch cắt tóc ạ?',
    };
  }

  return null;
}

async function resolvePriceInquiry({ userMessage, history = [], conversation = null }) {
  const pending = findPendingPriceQuestion(history, userMessage);
  const currentIsPriceQuestion = isPriceQuestion(userMessage);
  const chatContext = conversation?.chat_context || {};
  if (!currentIsPriceQuestion && !chatContext.pricing_inquiry_active && !pending) return null;

  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;

  const contextProductName = conversation?.product_name || '';
  const directCurrentMatches = findDirectMatches(userMessage, services);
  const currentCategoryMatches = directCurrentMatches.length
    ? []
    : findCategoryMatches(userMessage, services);
  const selectedIds = Array.isArray(chatContext.selected_service_ids)
    ? chatContext.selected_service_ids
    : [];
  const selectedServices = services.filter(service => selectedIds.includes(service.id));
  const query = [
    currentIsPriceQuestion ? userMessage : '',
    pending?.request,
    pending && !currentIsPriceQuestion ? userMessage : '',
    contextProductName,
  ].filter(Boolean).join(' ');

  let matches = directCurrentMatches.length
    ? directCurrentMatches
    : currentCategoryMatches.length
      ? currentCategoryMatches
      : selectedServices;
  const matchingCategory = !directCurrentMatches.length && currentCategoryMatches.length > 0;
  if (!matches.length && !currentIsPriceQuestion && pending) {
    matches = findDirectMatches(query, services);
    if (!matches.length) matches = findCategoryMatches(query, services);
  }

  if (!matches.length) {
    const hasServiceTerm = /\b(?:cat|goi|tao kieu|xa phong|uon|duoi|nhuom|phuc hoi|noi|tay|phong chan|setting|keratin|balayage|ombre|pixie|layer|mullet)\b/u.test(normalizeText(userMessage));
    if (hasServiceTerm) {
      return {
        handled: true,
        content: 'Dạ, em chưa tìm thấy dịch vụ phù hợp trong danh mục nên chưa thể báo giá chính xác. Mình cho em tên dịch vụ cụ thể trên menu hoặc bấm “Chat với nhân viên” để được hỗ trợ ạ.',
      };
    }
    return {
      handled: true,
      content: 'Dạ, mình muốn hỏi giá dịch vụ nào ạ? Mình cho em biết tên dịch vụ để em tra đúng bảng giá nhé.',
    };
  }

  if (matchingCategory && matches.length > 1) {
    return { handled: true, content: buildAmbiguousServiceReply(matches, query) };
  }

  if (matches.some(service => !service.prices_by_size || typeof service.prices_by_size !== 'object')) {
    return {
      handled: true,
      content: `Dạ, danh mục hiện chưa có bảng giá theo size cho dịch vụ ${matches.map(service => service.name).join(', ')}, nên em chưa thể báo giá chính xác ạ.`,
    };
  }

  const sizeResult = parseHairSize(userMessage) ||
    (chatContext.hair_size ? { size: chatContext.hair_size } : null);

  if (sizeResult?.ambiguous) {
    return { handled: true, content: buildBoundaryQuestion(sizeResult.reason) };
  }
  if (!sizeResult?.size) {
    return { handled: true, content: buildSizeQuestion(matches.map(service => service.name)) };
  }

  return {
    handled: true,
    content: matches.map(service => formatServicePrice(service, sizeResult.size)).join('\n'),
  };
}

module.exports = {
  isPriceQuestion,
  parseHairSize,
  findDirectMatches,
  findCategoryMatches,
  resolveServiceInquiry,
  resolvePriceInquiry,
};
