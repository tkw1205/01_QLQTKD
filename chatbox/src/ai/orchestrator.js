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
const settingsRepo = require('../repositories/settingsRepository');

const MAX_TOOL_CALLS = 5;

// Chỉ nhận xác nhận cuối khi trước đó trợ lý đã yêu cầu khách xác nhận chốt lịch.
const FINAL_CONFIRMATION_REPLIES = new Set([
  'tôi xác nhận', 'mình xác nhận', 'em xác nhận',
  'tôi đồng ý đặt lịch', 'mình đồng ý đặt lịch', 'đồng ý đặt lịch',
  'xác nhận đặt lịch', 'tôi đồng ý', 'mình đồng ý', 'đồng ý',
  'xác nhận', 'ok', 'okay', 'oke', 'yes',
  'vâng, xác nhận', 'đúng, tôi đồng ý', 'đúng, mình đồng ý'
]);

function normalizeReply(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[.!?。！？]+$/g, '')
    .replace(/\s+/g, ' ');
}

function detectConfirmation(userMessage, history = []) {
  const reply = normalizeReply(userMessage);
  if (!FINAL_CONFIRMATION_REPLIES.has(reply)) return false;

  const lastAssistantMessage = [...(history || [])]
    .reverse()
    .find(message => message.sender_type !== 'user' && message.content);

  if (!lastAssistantMessage) return false;

  const previousText = String(lastAssistantMessage.content).toLowerCase();
  return (
    /(xác nhận|đồng ý).{0,100}(đặt lịch|chốt lịch)/i.test(previousText) ||
    /(đặt lịch|chốt lịch).{0,100}(xác nhận|đồng ý)/i.test(previousText) ||
    /bạn có đồng ý.{0,100}(đặt lịch|chốt lịch)/i.test(previousText) ||
    /bạn xác nhận.{0,100}(thông tin|đặt lịch)/i.test(previousText)
  );
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

  // 1. Direct or wrapped JSON
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

  // 2. Search embedded JSON with known tool name
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
  return `Dạ, trong ngày ${date}, salon hiện còn các khung giờ trống sau:\n\n${slots.join(', ')}\n\nBạn thuận tiện chọn khung giờ nào để em hỗ trợ giữ chỗ và đặt lịch cho bạn ạ?`;
}

async function buildSystemPrompt(conversation, targetDate = null) {
  const systemPromptSetting = await settingsRepo.get('ai_system_prompt');
  const siteName = await settingsRepo.get('site_name');
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const todayVN = getVietnamDate(0);
  const tomorrowVN = getVietnamDate(1);
  const dayAfterVN = getVietnamDate(2);
  const currentTargetDate = targetDate || tomorrowVN;

  let prompt = systemPromptSetting ||
    'Bạn là trợ lý tư vấn sản phẩm và đặt lịch chuyên nghiệp, thân thiện.';

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

  // Kiểm tra xem cuộc hội thoại có đang giữ chỗ hay không.
  if (conversation?.id) {
    try {
      const activeHold = await appointmentRepo.findActiveHoldByConversation(conversation.id);
      if (activeHold) {
        prompt += `\n\n[TRẠNG THÁI GIỮ CHỖ HIỆN TẠI]:
Cuộc hội thoại đang giữ chỗ khung giờ ${activeHold.appointment_time} ngày ${activeHold.appointment_date}.
Hãy tiếp tục thu thập Họ tên và SĐT, sau đó tóm tắt thông tin và hỏi khách xác nhận lần cuối trước khi chốt lịch.`;
      }
    } catch {}
  }

  prompt += `

QUY TẮC BẮT BUỘC ĐẶT LỊCH (BPMN 2.0 & SALON):
1. KIỂM TRA LỊCH TRỐNG:
   - TUYỆT ĐỐI KHÔNG tự bịa khung giờ trống.
   - Chỉ hiển thị các khung giờ do công cụ check_available_slots trả về.
   - Khi khách hỏi giờ trống hoặc giờ khác, phải gọi check_available_slots.
   - Không yêu cầu khách tự nhập giờ khi chưa cung cấp danh sách giờ trống.
   - Nếu ngày đó kín lịch, thông báo rõ ràng và đề xuất kiểm tra ngày tiếp theo.
   - Nếu công cụ báo lỗi, thông báo sự cố và đề xuất khách liên hệ nhân viên.
   - Giờ mở cửa từ 08:30 đến 20:30 hàng ngày.

2. QUY TẮC GIỮ CHỖ:
   - Chỉ thông báo đã giữ chỗ khi hold_appointment_slot trả về success: true.
   - Khi khách chọn một khung giờ trong danh sách còn trống, gọi hold_appointment_slot.
   - Nếu khung giờ đã kín hoặc xảy ra SLOT_CONFLICT, thông báo lịch sự và đề xuất giờ khác.
   - Không thông báo giữ chỗ nếu công cụ giữ chỗ thất bại.
   - Khi giữ chỗ thành công, thông báo thời hạn giữ chỗ 5 phút.

3. THU THẬP THÔNG TIN KHÁCH HÀNG:
   - Không yêu cầu khách cung cấp lại Họ tên và SĐT đã có, trừ khi thông tin không hợp lệ.
   - Chỉ yêu cầu 2 thông tin bắt buộc:
     + Họ và tên.
     + Số điện thoại Việt Nam gồm 10 chữ số (ví dụ: 0901234567).
   - Nếu thiếu thông tin nào thì chỉ hỏi thông tin đó.
   - Khi đã có đủ Họ tên và SĐT, KHÔNG tự động chốt lịch.

4. XÁC NHẬN VÀ CHỐT LỊCH:
   - Khi đã có đủ thông tin, tóm tắt Dịch vụ, Ngày, Giờ, Họ tên và SĐT.
   - Hỏi khách có đồng ý xác nhận đặt lịch hay không.
   - Chỉ gọi confirm_appointment khi khách trả lời đồng ý rõ ràng sau câu hỏi xác nhận cuối cùng.
   - Việc khách chọn giờ hoặc cung cấp Họ tên/SĐT KHÔNG phải xác nhận chốt lịch.
   - Không gọi create_appointment để bỏ qua bước xác nhận cuối.
   - Không tự bịa mã booking.
   - Chỉ thông báo thành công khi công cụ trả về success: true kèm booking_code thực tế.

5. Luôn giao tiếp bằng tiếng Việt lịch sự, thân thiện, chu đáo và chuyên nghiệp.`;

  return prompt;
}
async function chat({ conversationId, guestSessionId, userMessage }) {
  if (!provider.isConfigured()) {
    return {
      content: 'Xin lỗi, tính năng AI chưa được cấu hình. Bạn có thể bấm "Chat với nhân viên" để được hỗ trợ trực tiếp.',
      aiConfigured: false,
    };
  }

  // Get conversation context
  const conversation = await conversationRepo.findById(conversationId);
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  if (conversation.mode !== 'ai') {
    throw Object.assign(new Error('Conversation is not in AI mode'), { status: 400 });
  }

  // Build message history
  const history = await messageRepo.findForAI(conversationId, { limit: 20 });

  // Extract context details
  const targetDate = extractDateFromUserAndHistory(userMessage, history);
  const isAvailableSlotsQuery = detectAvailableSlotsQuery(userMessage);

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

  // Chỉ nhận xác nhận chốt lịch nếu khách đồng ý sau câu hỏi xác nhận cuối.
  const customerConfirmed = detectConfirmation(userMessage, history);

  const context = {
    conversationId,
    guestSessionId,
    customerConfirmed,
    targetDate,
    history,
    conversation
  };

  // Agentic loop with tool calling
  let toolCallCount = 0;
  let currentMessages = [...messages];
  let finalContent = null;
  let checkedSlotsResult = null;

  try {
    while (toolCallCount < MAX_TOOL_CALLS) {
      const response = await provider.chat({
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
        toolChoice: 'auto',
      });

      const choice = response.choices?.[0];
      if (!choice) throw new Error('Invalid response from AI provider');

      const assistantMessage = choice.message;

      // Check if AI wants to call tools (native tool_calls or embedded content)
      let toolCalls = assistantMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const extracted = extractToolCallsFromContent(assistantMessage.content);
        if (extracted && extracted.length > 0) {
          toolCalls = extracted;
          assistantMessage.tool_calls = extracted;
          assistantMessage.content = null;
        }
      }

      // Nếu khách hỏi giờ trống nhưng AI không tự gọi công cụ,
      // hệ thống chủ động gọi check_available_slots.
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

          const toolName = toolCall.function.name;

          // Chặn AI tự chốt lịch nếu khách chưa xác nhận ở bước cuối.
          if (
            (toolName === 'confirm_appointment' || toolName === 'create_appointment') &&
            !context.customerConfirmed
          ) {
            const blockedResult = JSON.stringify({
              success: false,
              code: 'CUSTOMER_FINAL_CONFIRMATION_REQUIRED',
              message: 'Khách chưa xác nhận chốt lịch. Hãy tóm tắt thông tin và hỏi khách xác nhận trước.'
            });

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: blockedResult
            });

            continue;
          }

          console.log(`[AI] Calling tool: ${toolName}`, args);
          const toolResult = await executeTool(toolName, args, context);
          console.log('[AI] Tool result:', String(toolResult).substring(0, 200));

          if (toolName === 'check_available_slots') {
            try {
              checkedSlotsResult = JSON.parse(toolResult);
            } catch {}
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

      // Safety check: intercept tool calls leaked as plain text.
      const leakedTool = extractToolCallsFromContent(finalContent);

      if (leakedTool && leakedTool.length > 0) {
        console.log('[AI] Safety handler: Intercepted leaked tool call:', leakedTool[0].function.name);

        const leaked = leakedTool[0];
        let args = {};

        try {
          args = typeof leaked.function.arguments === 'string'
            ? JSON.parse(leaked.function.arguments || '{}')
            : (leaked.function.arguments || {});
        } catch {}

        if (
          (leaked.function.name === 'confirm_appointment' ||
           leaked.function.name === 'create_appointment') &&
          !context.customerConfirmed
        ) {
          finalContent = 'Dạ, em đã ghi nhận thông tin của bạn. Bạn vui lòng xác nhận lại rằng mình đồng ý đặt lịch với thông tin vừa tóm tắt để em hoàn tất nhé ạ.';
        } else {
          const toolResStr = await executeTool(leaked.function.name, args, context);

          try {
            const resObj = JSON.parse(toolResStr);

            if (leaked.function.name === 'check_available_slots') {
              checkedSlotsResult = resObj;
              finalContent = formatSlotsReply(
                resObj.date,
                resObj.slots,
                resObj.next_date
              );
            }
          } catch {}
        }
      }

      break;
    }
  } catch (err) {
    console.warn('[AI] Provider request failed:', err.message);

    if (isAvailableSlotsQuery) {
      try {
        const toolResult = await executeTool(
          'check_available_slots',
          { date: targetDate },
          context
        );

        const resObj = JSON.parse(toolResult);
        finalContent = formatSlotsReply(
          resObj.date,
          resObj.slots,
          resObj.next_date
        );

        return { content: finalContent, aiConfigured: true };
      } catch {}
    }

    finalContent = 'Hệ thống AI hiện đang bận hoặc đang kết nối lại. Bạn có thể bấm "Chat với nhân viên" để được hỗ trợ ngay lập tức.';
    return { content: finalContent, aiConfigured: false };
  }
  if (finalContent === null) {
    finalContent = 'Xin lỗi, đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại.';
  }

  // Safety check 2: Không cho AI thông báo giữ chỗ nếu chưa có giữ chỗ thực tế.
  const activeHold = await appointmentRepo.findActiveHoldByConversation(conversationId);

  const isHoldActiveNow =
    activeHold &&
    activeHold.hold_expires_at &&
    new Date(activeHold.hold_expires_at).getTime() > Date.now();

  // Safety check 4: Xoà JSON giả / code block mà AI tự bịa ra trong câu trả lời.
  const codeBlockRegex = /```[\s\S]*?```/g;
  if (codeBlockRegex.test(finalContent)) {
    console.log('[AI] Safety handler: Stripped hallucinated code block / fake tool JSON from response.');
    finalContent = finalContent
      .replace(codeBlockRegex, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Safety check 5: Xoà các câu mô phỏng thông báo giả từ công cụ.
  const fakeToolNoticeRegex =
    /(?:Dưới đây là|Đây là)\s*(?:thông báo|kết quả|phản hồi)\s*(?:từ|của)\s*(?:công cụ|hệ thống|tool)[^\n]*\n?/gi;
  if (fakeToolNoticeRegex.test(finalContent)) {
    console.log('[AI] Safety handler: Stripped fake tool notice from response.');
    finalContent = finalContent
      .replace(fakeToolNoticeRegex, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (!isHoldActiveNow) {
    // Mở rộng regex để bắt thêm "đã giữ chỗ" / "đã được giữ chỗ"
    const falseHoldRegex =
      /(?:Chúng tôi|Em|Salon|Tôi|[Kk]hung giờ [\d:]+\s*(?:ngày [\d\-\/]+)?)?\s*(?:(?:sẽ|đã|đã được)\s+)?(?:giữ chỗ tạm thời|giữ chỗ|đã được giữ chỗ|đã giữ chỗ)\s*(?:cho bạn\s*)?(?:trong\s*(?:5|10)\s*phút)?[^.!?\n]*[.!?]?/gi;

    if (falseHoldRegex.test(finalContent)) {
      console.log('[AI] Safety handler: Cleared false hold claim since no active hold exists in DB.');

      finalContent = finalContent
        .replace(falseHoldRegex, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }

  // Safety check 3: Nếu khách hỏi giờ trống nhưng AI không hiển thị giờ,
  // hệ thống tự định dạng lại kết quả từ công cụ.
  if (isAvailableSlotsQuery && checkedSlotsResult) {
    const hasSlotMention = (checkedSlotsResult.slots || [])
      .some(s => finalContent.includes(s));

    if (
      !hasSlotMention &&
      (!checkedSlotsResult.slots || checkedSlotsResult.slots.length === 0)
    ) {
      if (
        !finalContent.includes(checkedSlotsResult.next_date || 'ngày khác') &&
        !finalContent.includes('tiếp theo')
      ) {
        finalContent = formatSlotsReply(
          checkedSlotsResult.date,
          [],
          checkedSlotsResult.next_date
        );
      }
    } else if (
      !hasSlotMention &&
      checkedSlotsResult.slots &&
      checkedSlotsResult.slots.length > 0
    ) {
      console.log('[AI] Safety handler: AI omitted slots from response. Applying formatSlotsReply.');

      finalContent = formatSlotsReply(
        checkedSlotsResult.date,
        checkedSlotsResult.slots,
        checkedSlotsResult.next_date
      );
    }
  }

  return {
    content: finalContent,
    aiConfigured: true
  };
}

module.exports = {
  chat,
  detectConfirmation,
  extractToolCallsFromContent,
  formatSlotsReply,
  buildSystemPrompt,
};