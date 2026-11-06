'use strict';

const jsonStore = require('../config/jsonStore');
const messageRepo = require('../repositories/messageRepository');

const DEFAULT_AI_WARNING_MS = 5 * 60 * 1000;    // 5 minutes
const DEFAULT_AI_CLOSE_MS = 10 * 60 * 1000;     // 10 minutes total (5m after warning)
const DEFAULT_HUMAN_CLOSE_MS = 60 * 60 * 1000;  // 60 minutes

const WARNING_MESSAGE = 'Dạ em vẫn sẵn sàng hỗ trợ; mình cứ nhắn lại khi tiện nhé ạ!';
const SYSTEM_CLOSED_MESSAGE_AI = 'Phiên tư vấn tự động tạm đóng do hết thời gian chờ phản hồi. Salon sẽ liên hệ lại nếu có thông tin.';
const SYSTEM_CLOSED_MESSAGE_HUMAN = 'Cuộc trò chuyện với nhân viên đã tự động kết thúc do không có tương tác trong 60 phút.';

const AI_STAGE_WARNINGS = {
  first_response: WARNING_MESSAGE,
  consultation: 'Dạ, mình còn cần em tư vấn thêm về dịch vụ, giá hoặc thời gian thực hiện không ạ? Em sẵn sàng hỗ trợ mình.',
  booking: 'Dạ, mình cho em biết dịch vụ muốn đặt để em hỗ trợ tiếp nhé ạ.',
  slot_selection: 'Dạ, mình chọn giúp em một khung giờ phù hợp trong các khung giờ em vừa gửi nhé ạ.',
  customer_details: 'Dạ, em đang chờ thông tin để tiếp tục đặt lịch. Mình gửi giúp em họ tên và số điện thoại (nếu chưa gửi) nhé ạ.',
  booking_confirmation: 'Dạ, mình kiểm tra lại thông tin đặt lịch và xác nhận giúp em khi sẵn sàng nhé ạ.',
};

let intervalHandle = null;
let currentIo = null;

function getAiTimeoutStage(conv, convMsgs) {
  const context = conv.chat_context || {};
  if (context.booking_status === 'COLLECTING_CUSTOMER') return 'customer_details';
  if (context.booking_status === 'AWAITING_CONFIRMATION' || context.booking_confirmation_pending) {
    return 'booking_confirmation';
  }
  if (context.availability_query_pending) return 'slot_selection';
  if (context.booking_status === 'COLLECTING_BOOKING_DETAILS') return 'slot_selection';
  if (context.booking_intent_pending || context.booking_started) return 'booking';
  return convMsgs.some(message => message.sender_type === 'user')
    ? 'consultation'
    : 'first_response';
}

/**
 * Release any active holding appointments associated with a conversation
 */
function releaseHoldsForConversation(conversationId, nowIso) {
  try {
    const appointments = jsonStore.getCollection('appointments');
    let modified = false;
    for (const appt of appointments) {
      if (appt.conversation_id === conversationId && appt.status === 'holding') {
        appt.status = 'cancelled';
        appt.notes = (appt.notes ? appt.notes + ' | ' : '') + 'Holding slot released due to session timeout';
        appt.updated_at = nowIso;
        modified = true;
      }
    }
    if (modified) {
      jsonStore.saveCollection('appointments', appointments);
    }
  } catch (err) {
    console.error(`[SessionTimeoutService] Error releasing holds for conv ${conversationId}:`, err.message);
  }
}

/**
 * Scan active conversations and apply 2-stage AI timeout and 60-minute staff timeout.
 * Accepts optional options for testing with custom timers or time offsets.
 */
async function checkTimeouts(io = null, options = {}) {
  const effectiveIo = io || currentIo;
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const nowIso = new Date(now).toISOString();

  const aiWarningMs = options.aiWarningMs ?? DEFAULT_AI_WARNING_MS;
  const aiCloseMs = options.aiCloseMs ?? DEFAULT_AI_CLOSE_MS;
  const humanCloseMs = options.humanCloseMs ?? DEFAULT_HUMAN_CLOSE_MS;

  const conversations = jsonStore.getCollection('conversations');
  const messages = jsonStore.getCollection('messages');

  let convModified = false;
  const processed = {
    warningsSent: [],
    closedAI: [],
    closedHuman: [],
  };

  for (const conv of conversations) {
    if (!conv || conv.mode === 'closed') continue;

    // Messages for this conversation sorted by created_at ascending
    const convMsgs = messages.filter(m => m.conversation_id === conv.id);
    convMsgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const lastMsg = convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : null;
    const lastCustomerMsg = [...convMsgs].reverse().find(m => m.sender_type === 'user');

    // ──────────────────────────────────────────────────────────────────────────
    // 1. AI MODE: 2-stage timeout (CR-04)
    // ──────────────────────────────────────────────────────────────────────────
    if (conv.mode === 'ai') {
      const timeoutStage = getAiTimeoutStage(conv, convMsgs);
      const stageChanged = conv.timeout_stage && conv.timeout_stage !== timeoutStage;
      if (stageChanged) {
        conv.warning_sent = false;
        conv.stage1_warning_sent = false;
        conv.warning_sent_at = null;
        convModified = true;
      }
      if (conv.timeout_stage !== timeoutStage) {
        conv.timeout_stage = timeoutStage;
        convModified = true;
      }
      const isWarningSent = !stageChanged &&
        Boolean(conv.warning_sent || conv.stage1_warning_sent);

      // Check if customer spoke AFTER the warning was dispatched
      if (isWarningSent && lastCustomerMsg && conv.warning_sent_at) {
        if (new Date(lastCustomerMsg.created_at).getTime() > new Date(conv.warning_sent_at).getTime()) {
          // Customer was active -> reset warning status
          conv.warning_sent = false;
          conv.stage1_warning_sent = false;
          conv.warning_sent_at = null;
          conv.updated_at = nowIso;
          convModified = true;
          continue;
        }
      }

      if (!isWarningSent) {
        // Stage 1: Measure silence from last activity
        const lastActivityTime = lastMsg
          ? new Date(lastMsg.created_at).getTime()
          : new Date(conv.updated_at || conv.created_at).getTime();

        const silenceDuration = now - lastActivityTime;
        if (silenceDuration >= aiWarningMs) {
          // Send polite warning message
          const warningMsg = await messageRepo.create({
            conversationId: conv.id,
            senderType: 'assistant',
            content: AI_STAGE_WARNINGS[timeoutStage],
            metadata: { kind: 'session_timeout_warning', phase: timeoutStage },
          });

          conv.warning_sent = true;
          conv.stage1_warning_sent = true;
          conv.warning_sent_at = nowIso;
          conv.updated_at = nowIso;
          convModified = true;
          processed.warningsSent.push(conv.id);

          if (effectiveIo) {
            effectiveIo.to(`conv_${conv.id}`).emit('new_message', warningMsg);
            effectiveIo.to('agents').emit('new_message', warningMsg);
          }
        }
      } else {
        // Stage 2: Warning was already sent -> check if additional 5m elapsed without customer reply
        const warningTime = new Date(conv.warning_sent_at || conv.updated_at).getTime();
        const stage2Duration = now - warningTime;
        const remainingToClose = aiCloseMs - aiWarningMs;

        if (stage2Duration >= remainingToClose) {
          // Transition conversation to closed lead
          conv.mode = 'closed';
          conv.is_lead = true;
          conv.closed_at = nowIso;
          conv.updated_at = nowIso;
          if (!conv.lead_notes) {
            conv.lead_notes = 'Phiên đóng do khách hết thời gian phản hồi (BPMN Timeout - Lead Saved)';
          }
          convModified = true;
          processed.closedAI.push(conv.id);

          // Add system closing message
          const sysMsg = await messageRepo.create({
            conversationId: conv.id,
            senderType: 'system',
            content: SYSTEM_CLOSED_MESSAGE_AI,
          });

          // Release any active holding slots
          releaseHoldsForConversation(conv.id, nowIso);

          if (effectiveIo) {
            effectiveIo.to(`conv_${conv.id}`).emit('conversation_closed', {
              conversationId: conv.id,
              isLead: true,
              closedAt: nowIso,
            });
            effectiveIo.to(`conv_${conv.id}`).emit('mode_changed', {
              conversationId: conv.id,
              mode: 'closed',
            });
            effectiveIo.to(`conv_${conv.id}`).emit('new_message', sysMsg);

            effectiveIo.to('agents').emit('conversation_closed', {
              conversationId: conv.id,
              isLead: true,
            });
            effectiveIo.to('agents').emit('conversation_mode_changed', {
              conversationId: conv.id,
              mode: 'closed',
            });
            effectiveIo.to('agents').emit('new_message', sysMsg);
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. HUMAN OR WAITING MODE: 60-minute inactivity timeout (CR-06)
    // ──────────────────────────────────────────────────────────────────────────
    else if (conv.mode === 'human' || conv.mode === 'waiting_for_agent') {
      const lastInteraction = lastMsg
        ? new Date(lastMsg.created_at).getTime()
        : new Date(conv.updated_at || conv.created_at).getTime();

      const silenceDuration = now - lastInteraction;
      if (silenceDuration >= humanCloseMs) {
        conv.mode = 'closed';
        conv.is_lead = true;
        conv.closed_at = nowIso;
        conv.updated_at = nowIso;
        conv.lead_notes = 'Phiên đóng tự động do không có tương tác sau 60 phút hỗ trợ nhân viên';
        convModified = true;
        processed.closedHuman.push(conv.id);

        const sysMsg = await messageRepo.create({
          conversationId: conv.id,
          senderType: 'system',
          content: SYSTEM_CLOSED_MESSAGE_HUMAN,
        });

        releaseHoldsForConversation(conv.id, nowIso);

        if (effectiveIo) {
          effectiveIo.to(`conv_${conv.id}`).emit('conversation_closed', {
            conversationId: conv.id,
            isLead: true,
            closedAt: nowIso,
          });
          effectiveIo.to(`conv_${conv.id}`).emit('mode_changed', {
            conversationId: conv.id,
            mode: 'closed',
          });
          effectiveIo.to(`conv_${conv.id}`).emit('new_message', sysMsg);

          effectiveIo.to('agents').emit('conversation_closed', {
            conversationId: conv.id,
            isLead: true,
          });
          effectiveIo.to('agents').emit('conversation_mode_changed', {
            conversationId: conv.id,
            mode: 'closed',
          });
          effectiveIo.to('agents').emit('new_message', sysMsg);
        }
      }
    }
  }

  if (convModified) {
    jsonStore.saveCollection('conversations', conversations);
  }

  return processed;
}

/**
 * Start periodic timeout scanning
 */
function start(io = null, intervalMs = 15000) {
  if (io) currentIo = io;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  intervalHandle = setInterval(async () => {
    try {
      await checkTimeouts(currentIo);
    } catch (err) {
      console.error('[SessionTimeoutService] Scheduled check error:', err.message);
    }
  }, intervalMs);

  if (intervalHandle && typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }

  console.log(`[SessionTimeoutService] Started periodic scanner (interval: ${intervalMs}ms)`);
}

/**
 * Stop periodic timeout scanning
 */
function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[SessionTimeoutService] Stopped periodic scanner');
  }
}

/**
 * Reset inactivity warning flag for a conversation
 */
function resetInactivityWarning(conversationId) {
  if (!conversationId) return;
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === conversationId);
  if (conv && (
    conv.warning_sent ||
    conv.stage1_warning_sent ||
    conv.warning_sent_at ||
    conv.timeout_stage
  )) {
    conv.warning_sent = false;
    conv.stage1_warning_sent = false;
    conv.warning_sent_at = null;
    conv.timeout_stage = null;
    conv.updated_at = new Date().toISOString();
    jsonStore.saveCollection('conversations', conversations);
  }
}

module.exports = {
  start,
  stop,
  checkTimeouts,
  resetInactivityWarning,
  DEFAULT_AI_WARNING_MS,
  DEFAULT_AI_CLOSE_MS,
  DEFAULT_HUMAN_CLOSE_MS,
  WARNING_MESSAGE,
  SYSTEM_CLOSED_MESSAGE_AI,
  SYSTEM_CLOSED_MESSAGE_HUMAN,
};
