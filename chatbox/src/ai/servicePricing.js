'use strict';

const productRepository = require('../repositories/productRepository');

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

  if (/\b(?:qua|duoi)\s+cam\b.*\b(?:den|toi|ngang|cham)\s+vai\b/u.test(text)) {
    return { size: 'M' };
  }
  if (/\b(?:qua|duoi)\s+cam\b/u.test(text)) {
    return { ambiguous: true, reason: 'Mình cần biết tóc đã dài đến vai chưa để phân biệt size M.' };
  }
  if (/\b(?:qua|duoi)\s+vai\b.*\b(?:chua\s+(?:den|toi|ngang))\s+nguc\b/u.test(text)) {
    return { ambiguous: true, reason: 'Quy ước chưa phân loại rõ độ dài sau vai nhưng chưa đến ngực.' };
  }
  if (/\b(?:ngang\s+hong|toi\s+ngang\s+hong|den\s+ngang\s+hong|cham\s+hong|qua\s+hong|duoi\s+hong|hon\s+nguc|qua\s+nguc|duoi\s+nguc|ngang\s+nguc|cham\s+nguc|den\s+nguc|toi\s+nguc|tu\s+nguc\s+tro\s+xuong)\b/u.test(text)) {
    return { size: 'L' };
  }
  if (/\b(?:chua|khong)(?:\s+(?:den|toi|ngang|qua)){1,2}\s+lung\b/u.test(text)) {
    return { ambiguous: true, reason: 'Mình chưa xác nhận được tóc đã đến mốc lưng hay chưa.' };
  }
  if (/\b(?:ngang|toi|den|cham)\s+cam\b|\btu cam tro len\b|\btren cam\b|\bcao hon cam\b/u.test(text)) {
    return { size: 'S' };
  }
  if (
    /\b(?:ngang|toi|den|cham|qua|duoi)\s+lung\b|\bgan\s+that\s+lung\b|\b(?:qua|duoi)\s+vai\s+(?:den|toi|ngang)\s+lung\b/u
      .test(text)
  ) {
    return { size: 'L' };
  }
  if (/\b(?:qua vai|duoi vai)\b.*\b(?:chua\s+(?:den|toi|ngang))\s+nguc\b/u.test(text)) {
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

const CATEGORY_ALIASES = {
  'cắt tóc': ['cat toc'],
  'gội đầu và tạo kiểu': ['goi dau va tao kieu', 'goi dau'],
  'uốn tóc': ['uon toc', 'uon', 'lam toc xoan', 'toc xoan', 'lam xoan', 'xoan', 'lam toc cho phong len', 'lam toc phong len', 'lam phong len'],
  'duỗi tóc': ['duoi toc', 'duoi', 'lam toc thang', 'duoi thang'],
  'nhuộm tóc': ['nhuom toc', 'nhuom', 'doi mau toc', 'nhuom mau'],
  'phục hồi và dưỡng tóc': ['phuc hoi va duong toc', 'phuc hoi toc', 'phuc hoi', 'duong toc'],
  'nối tóc': ['noi toc', 'noi'],
  'tẩy tóc': ['tay toc', 'tay'],
};

const CATEGORY_INTENT_FILLER_WORDS = new Set([
  'anh', 'chi', 'co', 'dich', 'doi', 'em', 'gi', 'hien', 'khong', 'la',
  'lam', 'minh', 'muon', 'nao', 'nhe', 'salon', 'sang', 'toi', 'tu',
  'vu',
  'van', 'va', 'voi',
]);

function isPermedVolumeRequest(text) {
  return (
    (/\buon\b/u.test(text) && /\bphong\b/u.test(text)) ||
    /\b(?:lam toc cho phong len|lam toc phong len|lam phong len)\b/u.test(text)
  );
}

function isCategoryOnlyInquiry(query, categoryName) {
  const text = normalizeText(query);
  const aliases = [
    normalizeText(categoryName),
    ...(CATEGORY_ALIASES[categoryName.toLocaleLowerCase('vi-VN')] || []),
  ].sort((a, b) => b.length - a.length);
  const matchedAlias = aliases.find(alias => includesPhrase(text, alias));
  if (!matchedAlias) return false;

  const remainingWords = text
    .replace(` ${matchedAlias} `, ' ')
    .trim()
    .split(/\s+/u)
    .filter(word => word && !CATEGORY_INTENT_FILLER_WORDS.has(word));
  return remainingWords.length === 0;
}

function findCategoryMatches(query, services) {
  const text = normalizeText(query);
  const matchedCategories = new Set();
  const asksForPermedVolume = isPermedVolumeRequest(text);

  for (const service of services) {
    const categoryName = service.category_name;
    const aliases = CATEGORY_ALIASES[categoryName.toLocaleLowerCase('vi-VN')] || [categoryName];
    if (aliases.some(alias => includesPhrase(text, alias))) {
      matchedCategories.add(categoryName);
    }
  }

  const matchedServices = services.filter(service => matchedCategories.has(service.category_name));
  if (!asksForPermedVolume) return matchedServices;

  return matchedServices.filter(service =>
    [service.name, ...(service.aliases || [])]
      .some(phrase => includesPhrase(normalizeText(phrase), 'phong'))
  );
}

function findPendingServiceSelection(history, userMessage, services) {
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
  if (!/\b(?:dich vu nao|chon dich vu|dich vu cu the|ten dich vu)\b/u.test(assistantText)) {
    return null;
  }

  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (previous[i].sender_type !== 'user') continue;
    const categoryMatches = findCategoryMatches(previous[i].content, services);
    if (categoryMatches.length > 1) {
      return {
        request: previous[i].content,
        services: categoryMatches,
      };
    }
  }
  return null;
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
  if (!Number.isFinite(duration) || !Number.isFinite(staffCount)) {
    return `Dạ, danh mục hiện chưa đủ thông tin thời lượng hoặc nhân viên cho size ${size} của dịch vụ ${service.name}, nên em chưa thể tư vấn chính xác ạ.`;
  }
  return `- ${service.name}: ${formatPrice(Number(tier.price))}${unit} (size ${size}), ${duration} phút, ${staffCount} nhân viên.`;
}

function hasSizePrices(service) {
  return Boolean(service.prices_by_size && Object.keys(service.prices_by_size).length > 0);
}

function buildSizeQuestion(serviceNames) {
  const serviceLabel = serviceNames.length === 1
    ? `dịch vụ ${serviceNames[0]}`
    : `các dịch vụ ${serviceNames.join(', ')}`;
  return `Dạ, giá ${serviceLabel} được tính theo độ dài tóc. Mình cho em biết tóc dài đến đâu (size S, M hay L) ạ?`;
}

function buildBoundaryQuestion(reason) {
  return `Dạ, em chưa xác định được size vì ${reason} Mình cho em biết size S, M, L hoặc mô tả tóc dài đến đâu để em báo đúng giá ạ?`;
}

function buildAmbiguousServiceReply(services, query) {
  const categoryName = services[0]?.category_name;
  const names = services.map(service => service.name);
  const hasSpecificUnknownName = /\b(?:uon phong|setting|keratin|balayage|ombre|pixie|layer|mullet|side part)\b/iu.test(query) &&
    !services.some(service => includesPhrase(normalizeText(query), service.name));
  const lead = hasSpecificUnknownName
    ? `Dạ, danh mục chưa có dịch vụ đúng tên “${query}”. Nhóm ${categoryName} hiện có`
    : `Dạ, nhóm ${categoryName} hiện có`;
  return `${lead}: ${names.join('; ')}. Mình muốn hỏi giá dịch vụ nào ạ?`;
}

function buildServiceSelectionReply(services) {
  const categoryName = services[0]?.category_name;
  const names = services.map(service => service.name);
  const categoryLabel = categoryName ? ` thuộc nhóm ${categoryName}` : '';
  return `Dạ, salon hiện có các dịch vụ${categoryLabel}: ${names.join('; ')}. Mình đang quan tâm dịch vụ nào ạ?`;
}

function getServiceFollowupType(userMessage) {
  const text = normalizeText(userMessage);
  if (/\b(?:mat bao lau|bao lau|thoi luong|thoi gian thuc hien|lam trong bao lau)\b/u.test(text)) {
    return 'duration';
  }
  if (/\b(?:loai nao|co nhung loai|lua chon nao|bien the|size nao)\b/u.test(text)) {
    return 'options';
  }
  if (/\b(?:tim hieu them|tim heu them|tu van them|gioi thieu dich vu nay|dich vu nay la gi|noi ro hon|chi tiet hon|cho toi biet them|cho toi biet chi tiet|dich vu nay nhu the nao|lam nhu the nao|co gi dac biet|phu hop voi toc nao|nen chon loai nao|toi muon biet them|giai thich them)\b/u.test(text)) {
    return 'details';
  }
  return null;
}

function getServiceSizeTiers(service) {
  const tiers = service.prices_by_size;
  if (!tiers || typeof tiers !== 'object') return [];
  return ['S', 'M', 'L']
    .filter(size => tiers[size])
    .map(size => ({ size, ...tiers[size] }));
}

function formatDuration(service, size = null) {
  const tiers = getServiceSizeTiers(service);
  if (tiers.length) {
    const applicable = size
      ? tiers.filter(tier => tier.size === size)
      : tiers;
    const durations = [...new Set(applicable
      .map(tier => Number(tier.duration ?? service.duration))
      .filter(duration => Number.isFinite(duration) && duration > 0))];
    if (!durations.length) return null;
    if (durations.length === 1) return `${durations[0]} phút`;
    return `${Math.min(...durations)}–${Math.max(...durations)} phút tùy size`;
  }
  const duration = Number(service.duration);
  return Number.isFinite(duration) && duration > 0 ? `${duration} phút` : null;
}

function buildServiceFollowupReply(service, type, hairSize = null) {
  const duration = formatDuration(service, hairSize);
  if (type === 'duration') {
    if (duration) {
      return `Dạ, dịch vụ ${service.name} có thời lượng ${duration}${hairSize ? ` theo size ${hairSize}` : ''} theo thông tin hiện có của salon ạ. Mình muốn tìm hiểu thêm về giá hay lựa chọn kiểu phù hợp ạ?`;
    }
    return `Dạ, danh mục hiện chưa có thời lượng xác nhận cho dịch vụ ${service.name}. Mình muốn em hỏi chuyên viên tư vấn giúp không ạ?`;
  }

  if (type === 'options') {
    const sizes = getServiceSizeTiers(service).map(tier => tier.size);
    if (sizes.length) {
      return `Dạ, dịch vụ ${service.name} hiện có các mức size ${sizes.join(', ')} theo danh mục salon${duration ? `; thời lượng ${duration}` : ''} ạ. Mình muốn em tư vấn mức nào phù hợp với tóc của mình?`;
    }
    return `Dạ, danh mục hiện ghi nhận dịch vụ ${service.name}${duration ? ` với thời lượng ${duration}` : ''}, chưa có các biến thể khác được khai báo. Mình muốn em tư vấn thêm về đặc điểm dịch vụ hay giá ạ?`;
  }

  const description = String(service.description || '').trim();
  const category = normalizeText(service.category_name || '');
  const generalExplanation = /\bcat\b/u.test(category)
    ? 'Dịch vụ cắt tóc thường giúp chỉnh lại dáng tóc hiện tại hoặc tạo kiểu mới theo mong muốn; kiểu phù hợp còn tùy khuôn mặt, chất tóc và cách chăm sóc.'
    : /\b(uon|duoi)\b/u.test(category)
      ? 'Ở góc độ chung, dịch vụ tạo kiểu bằng uốn hoặc duỗi giúp thay đổi độ cong hay độ thẳng của tóc; lựa chọn phù hợp còn tùy nền tóc và kết quả mình mong muốn.'
      : /\bnhuom\b/u.test(category)
        ? 'Ở góc độ chung, nhuộm tóc giúp thay đổi màu tóc; màu đạt được còn phụ thuộc nền tóc hiện tại và màu mình mong muốn.'
        : null;
  const facts = [
    description
      ? `Dạ, về dịch vụ ${service.name}: ${description}`
      : generalExplanation
        ? `Dạ, ở góc độ thông tin chung, ${generalExplanation}`
        : `Dạ, danh mục hiện chưa có mô tả chi tiết đã xác nhận cho dịch vụ ${service.name}.`,
    duration ? `Thời lượng hiện có trong danh mục: ${duration}.` : null,
    getServiceSizeTiers(service).length
      ? `Dịch vụ có các size ${getServiceSizeTiers(service).map(tier => tier.size).join(', ')}.`
      : null,
  ].filter(Boolean);
  return `${facts.join(' ')} Mình còn muốn em làm rõ thêm điểm nào về dịch vụ này ạ?`;
}

async function resolveServiceFollowup({ userMessage, conversation = null }) {
  const type = getServiceFollowupType(userMessage);
  if (!type) return null;

  const context = conversation?.chat_context || {};
  const selectedIds = Array.isArray(context.selected_service_ids)
    ? context.selected_service_ids
    : [];
  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;
  const selectedServices = selectedIds
    .map(id => services.find(service => service.id === id))
    .filter(Boolean);
  if (selectedServices.length) {
    return {
      handled: true,
      content: selectedServices
        .map(service => buildServiceFollowupReply(service, type, context.hair_size))
        .join('\n'),
    };
  }

  const categoryName = context.service_interest_category || context.booking_requested_category;
  if (categoryName) {
    const categoryServices = services.filter(service => service.category_name === categoryName);
    if (categoryServices.length) {
      return {
        handled: true,
        content: `Dạ, nhóm ${categoryName} hiện có các dịch vụ: ${categoryServices.map(service => service.name).join('; ')}. Mình muốn tìm hiểu dịch vụ cụ thể nào ạ?`,
      };
    }
  }
  return null;
}

async function resolveServiceInquiry({ userMessage, conversation = null, history = [] }) {
  const chatContext = conversation?.chat_context || {};
  if (
    isPriceQuestion(userMessage) ||
    chatContext.pricing_inquiry_active
  ) return null;

  const normalizedMessage = normalizeText(userMessage);
  if (
    !chatContext.booking_intent_pending &&
    !chatContext.booking_started &&
    /\bbob\b/u.test(normalizedMessage)
  ) {
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

  const services = (await productRepository.findAll({
    status: 'active',
    page: 1,
    limit: 1000,
  })).rows;
  const directMatches = findDirectMatches(userMessage, services);
  const categoryMatches = directMatches.length ? [] : findCategoryMatches(userMessage, services);
  const selectedIds = Array.isArray(chatContext.selected_service_ids)
    ? chatContext.selected_service_ids
    : [];
  const selectedService = services.find(service => selectedIds.includes(service.id));
  if (
    selectedService &&
    categoryMatches.length &&
    categoryMatches[0].category_name === selectedService.category_name
  ) {
    return null;
  }

  if (chatContext.booking_intent_pending || chatContext.booking_started) {
    if (categoryMatches.length > 1) {
      return {
        handled: true,
        content: `Dạ, nhóm ${categoryMatches[0].category_name} hiện có các dịch vụ: ${categoryMatches.map(service => service.name).join('; ')}. Mình muốn đặt dịch vụ nào ạ?`,
      };
    }
    return null;
  }

  const pendingServiceSelection = findPendingServiceSelection(history, userMessage, services);
  if (pendingServiceSelection && !directMatches.length) {
    if (Number(chatContext.service_selection_clarification_attempts || 0) >= 2) {
      return {
        handled: true,
        handoffRequired: true,
        handoffReason: 'service_selection_unresolved',
      };
    }
    if (!categoryMatches.length) {
      return {
        handled: true,
        content: buildServiceSelectionReply(pendingServiceSelection.services),
      };
    }
  }

  if (directMatches.length === 1) {
    return {
      handled: true,
      content: `Dạ, salon hiện có dịch vụ ${directMatches[0].name}. Mình muốn tìm hiểu thêm hay đặt lịch dịch vụ này ạ?`,
    };
  }
  if (directMatches.length > 1) {
    return {
      handled: true,
      content: `Dạ, em tìm thấy các dịch vụ ${directMatches.map(service => service.name).join('; ')}. Mình muốn tìm hiểu dịch vụ nào ạ?`,
    };
  }

  if (categoryMatches.length > 1) {
    return {
      handled: true,
      content: buildServiceSelectionReply(categoryMatches),
    };
  }

  if (categoryMatches.length === 1) {
    return {
      handled: true,
      content: `Dạ, salon hiện có dịch vụ ${categoryMatches[0].name}. Mình muốn tìm hiểu thêm hay đặt lịch dịch vụ này ạ?`,
    };
  }

  if (/\b(?:muon\s+)?lam\s+toc\b/u.test(normalizedMessage)) {
    return {
      handled: true,
      content: 'Dạ, anh/chị đang muốn cắt, uốn, nhuộm hay phục hồi tóc ạ?',
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

  const pendingServiceSelection = findPendingServiceSelection(history, userMessage, services);
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

  const selectedServicesMatchCurrentCategory = selectedServices.length > 0 &&
    currentCategoryMatches.length > 0 &&
    selectedServices.every(service =>
      service.category_name === currentCategoryMatches[0].category_name
    );
  const selectedServicesMatchBroadDirectMatches = selectedServices.length > 0 &&
    directCurrentMatches.length > 1 &&
    selectedServices.every(service =>
      directCurrentMatches.some(match => match.id === service.id)
    ) &&
    directCurrentMatches.every(service =>
      service.category_name === selectedServices[0].category_name
    );
  let matches = directCurrentMatches.length === 1
    ? directCurrentMatches
    : selectedServicesMatchCurrentCategory || selectedServicesMatchBroadDirectMatches
      ? selectedServices
      : directCurrentMatches.length
        ? directCurrentMatches
        : currentCategoryMatches.length
          ? currentCategoryMatches
          : selectedServices;
  const matchingCategory = !directCurrentMatches.length && currentCategoryMatches.length > 0;
  if (
    pendingServiceSelection &&
    !directCurrentMatches.length &&
    !selectedServices.length
  ) {
    if (Number(chatContext.service_selection_clarification_attempts || 0) >= 2) {
      return {
        handled: true,
        handoffRequired: true,
        handoffReason: 'service_selection_unresolved',
      };
    }
    if (!currentCategoryMatches.length) {
      return {
        handled: true,
        content: buildAmbiguousServiceReply(
          pendingServiceSelection.services,
          pendingServiceSelection.request
        ),
      };
    }
  }
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
        handoffRequired: true,
        handoffReason: 'service_not_found_in_catalog',
      };
    }
    return {
      handled: true,
      content: 'Dạ, mình muốn hỏi giá dịch vụ nào ạ? Mình cho em biết tên dịch vụ để em tra đúng bảng giá nhé.',
    };
  }

  if (matchingCategory && matches.length > 1) {
    if (/\b(?:setting|keratin|balayage|ombre|pixie|layer|mullet|side part)\b/iu.test(query) &&
      !matches.some(service => includesPhrase(normalizeText(query), service.name))) {
      return {
        handled: true,
        content: buildAmbiguousServiceReply(matches, query),
        handoffRequired: true,
        handoffReason: 'service_not_found_in_catalog',
      };
    }
    return { handled: true, content: buildAmbiguousServiceReply(matches, query) };
  }

  const sizePricedMatches = matches.filter(hasSizePrices);
  const unconfiguredMatches = matches.filter(service => !hasSizePrices(service));
  const sizeResult = parseHairSize(userMessage) ||
    (chatContext.hair_size ? { size: chatContext.hair_size } : null);

  if (unconfiguredMatches.length) {
    return {
      handled: true,
      content: unconfiguredMatches.map(service =>
        `Dạ, dịch vụ ${service.name} chưa có bảng giá theo size được cấu hình nên em chưa thể báo giá chính xác ạ.`
      ).join('\n'),
      handoffRequired: true,
      handoffReason: 'service_size_pricing_missing',
      serviceNames: unconfiguredMatches.map(service => service.name),
    };
  }
  if (
    !sizeResult?.size &&
    Number(chatContext.hair_size_clarification_attempts || 0) >= 2
  ) {
    return {
      handled: true,
      handoffRequired: true,
      handoffReason: 'hair_size_unresolved',
      serviceNames: matches.map(service => service.name),
    };
  }
  if (sizeResult?.ambiguous) {
    return { handled: true, content: buildBoundaryQuestion(sizeResult.reason) };
  }
  if (!sizeResult?.size && sizePricedMatches.length) {
    const unavailablePrices = unconfiguredMatches.map(service =>
      `Dạ, dịch vụ ${service.name} chưa có giá theo size được cấu hình.`
    );
    return {
      handled: true,
      content: [...unavailablePrices, buildSizeQuestion(sizePricedMatches.map(service => service.name))].join('\n'),
    };
  }

  const missingTier = matches.find(service => {
    const tier = service.prices_by_size[sizeResult.size];
    return !tier ||
      tier.price === null ||
      tier.price === undefined ||
      !Number.isFinite(Number(tier.price)) ||
      !Number.isFinite(Number(tier.duration ?? service.duration)) ||
      !Number.isFinite(Number(tier.staff_count ?? service.staff_count));
  });
  if (missingTier) {
    return {
      handled: true,
      handoffRequired: true,
      handoffReason: 'selected_size_data_missing',
      serviceNames: [missingTier.name],
    };
  }

  return {
    handled: true,
    content: matches.map(service => hasSizePrices(service)
      ? formatServicePrice(service, sizeResult.size)
      : `Dạ, dịch vụ ${service.name} chưa có giá theo size được cấu hình nên em chưa thể báo giá chính xác ạ.`).join('\n'),
  };
}

module.exports = {
  isPriceQuestion,
  parseHairSize,
  buildSizeQuestion,
  buildBoundaryQuestion,
  findDirectMatches,
  findCategoryMatches,
  isCategoryOnlyInquiry,
  buildServiceSelectionReply,
  resolveServiceFollowup,
  resolveServiceInquiry,
  resolvePriceInquiry,
};
