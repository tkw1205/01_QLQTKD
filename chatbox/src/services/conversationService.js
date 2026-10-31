'use strict';
const conversationRepo = require('../repositories/conversationRepository');
const messageRepo = require('../repositories/messageRepository');
const userRepo = require('../repositories/userRepository');
const notificationRepo = require('../repositories/notificationRepository');
const settingsRepo = require('../repositories/settingsRepository');
const sessionTimeoutService = require('./sessionTimeoutService');

async function getOrCreate(guestSessionId, productContextId = null) {
  // Try to find active conversation for this session
  let conv = await conversationRepo.findBySession(guestSessionId);
  if (conv && conv.mode !== 'closed') return conv;

  // Create new conversation
  return conversationRepo.create({ guestSessionId, productContextId });
}

async function getMessages(conversationId, guestSessionId) {
  const conv = await conversationRepo.findByIdAndSession(conversationId, guestSessionId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const messages = await messageRepo.findByConversation(conversationId);
  return { conversation: conv, messages };
}

async function addMessage({ conversationId, guestSessionId, senderType, senderId, content, metadata }) {
  // Verify access for user messages
  if (senderType === 'user') {
    const conv = await conversationRepo.findByIdAndSession(conversationId, guestSessionId);
    if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
    if (conv.mode === 'closed') throw Object.assign(new Error('Conversation is closed'), { status: 400 });
    sessionTimeoutService.resetInactivityWarning(conversationId);
  }

  return messageRepo.create({ conversationId, senderType, senderId, content, metadata });
}

async function requestAgentSwitch(conversationId, guestSessionId, io) {
  const conv = await conversationRepo.findByIdAndSession(conversationId, guestSessionId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.mode === 'closed') throw Object.assign(new Error('Conversation is already closed'), { status: 400 });
  if (conv.mode === 'human') throw Object.assign(new Error('Already connected to an agent'), { status: 400 });
  if (conv.mode === 'waiting_for_agent') return { conversation: conv, status: 'already_waiting' };

  // Update mode to waiting
  const updated = await conversationRepo.updateMode(conversationId, 'waiting_for_agent');

  // Add system message
  const sysMsg = await messageRepo.create({
    conversationId,
    senderType: 'system',
    content: 'Khách hàng đã yêu cầu kết nối với nhân viên tư vấn.',
  });

  // Notify agents via Socket.IO
  if (io) {
    io.to(`conv_${conversationId}`).emit('new_message', sysMsg);
    io.to('agents').emit('new_message', sysMsg);
    io.to('agents').emit('conversation_mode_changed', {
      conversationId,
      mode: 'waiting_for_agent',
      customerName: conv.customer_name,
      updatedAt: updated.updated_at,
    });
    io.to('agents').emit('new_waiting_conversation', {
      conversationId,
      customerName: conv.customer_name,
      productName: conv.product_name,
      createdAt: updated.updated_at,
    });

    try {
      const notif = await notificationRepo.create({
        conversationId,
        customerName: conv.customer_name || 'Khách hàng',
        lastMessage: 'Khách hàng yêu cầu kết nối với nhân viên tư vấn',
      });
      const unreadCount = await notificationRepo.getUnreadCount();
      io.to('agents').emit('new_notification', {
        notification: notif,
        unreadCount,
      });
    } catch (err) {
      console.error('[Service] Failed to create notification for switch-to-agent:', err.message);
    }
  }

  return { conversation: updated, status: 'waiting' };
}

async function switchBackToAI(conversationId, guestSessionId, io) {
  const conv = await conversationRepo.findByIdAndSession(conversationId, guestSessionId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.mode === 'closed') throw Object.assign(new Error('Conversation is closed'), { status: 400 });
  if (conv.mode === 'ai') return conv;

  const updated = await conversationRepo.updateMode(conversationId, 'ai', null);
  sessionTimeoutService.resetInactivityWarning(conversationId);
  const sysMsg = await messageRepo.create({
    conversationId,
    senderType: 'system',
    content: 'Khách hàng đã quay lại chat với AI.',
  });

  if (io) {
    io.to(`conv_${conversationId}`).emit('mode_changed', { mode: 'ai', conversationId });
    io.to(`conv_${conversationId}`).emit('new_message', sysMsg);

    // Notify agents room so Admin list & status update in real time
    io.to('agents').emit('conversation_mode_changed', {
      conversationId,
      mode: 'ai',
      customerName: updated.customer_name,
      updatedAt: updated.updated_at,
    });
    io.to('agents').emit('new_message', sysMsg);
  }

  return updated;
}

async function agentClaim(conversationId, agentId, io) {
  const conv = await conversationRepo.claimConversation(conversationId, agentId);
  const agent = await userRepo.findById(agentId);

  const sysMsg = await messageRepo.create({
    conversationId,
    senderType: 'system',
    senderId: agentId,
    content: `Nhân viên ${agent?.name || 'hỗ trợ'} đã tiếp nhận cuộc hội thoại.`,
  });

  if (io) {
    // Notify customer
    io.to(`conv_${conversationId}`).emit('agent_joined', {
      agentId,
      agentName: agent?.name,
      conversationId,
    });
    io.to(`conv_${conversationId}`).emit('mode_changed', {
      mode: 'human',
      agentName: agent?.name,
      conversationId,
    });
    io.to(`conv_${conversationId}`).emit('new_message', sysMsg);

    // Notify all agents
    io.to('agents').emit('conversation_claimed', {
      conversationId,
      agentId,
      agentName: agent?.name,
    });
    io.to('agents').emit('conversation_mode_changed', {
      conversationId,
      mode: 'human',
      agentName: agent?.name,
      updatedAt: conv.updated_at,
    });
    io.to('agents').emit('new_message', sysMsg);
  }

  return conv;
}

async function agentClose(conversationId, agentId, io) {
  const conv = await conversationRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const updated = await conversationRepo.updateMode(conversationId, 'closed');

  await messageRepo.create({
    conversationId,
    senderType: 'system',
    senderId: agentId,
    content: 'Nhân viên đã kết thúc tư vấn. Cảm ơn bạn đã liên hệ.',
  });

  if (io) {
    io.to(`conv_${conversationId}`).emit('conversation_closed', { conversationId });
    io.to('agents').emit('conversation_closed', { conversationId });
  }

  return updated;
}

async function closeAsLead(conversationId, guestSessionId = null, { leadNotes, leadPhone, customerName } = {}, io = null) {
  const conv = await conversationRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  const updated = await conversationRepo.closeAsLead(conversationId, {
    leadNotes: leadNotes || 'Phiên đóng do khách hết thời gian phản hồi (BPMN Timeout - Lead Saved)',
    leadPhone,
    customerName,
  });

  await messageRepo.create({
    conversationId,
    senderType: 'system',
    content: 'Phiên tư vấn tự động tạm đóng do hết thời gian chờ phản hồi. Salon sẽ liên hệ lại nếu có thông tin.',
  });

  if (io) {
    io.to(`conv_${conversationId}`).emit('conversation_closed', { conversationId, isLead: true });
    io.to('agents').emit('lead_created', { conversationId, leadNotes });
  }

  return updated;
}

async function agentSendMessage({ conversationId, agentId, content, io }) {
  const conv = await conversationRepo.findById(conversationId);
  if (!conv) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (conv.mode === 'closed') throw Object.assign(new Error('Conversation is closed'), { status: 400 });

  // If conversation is in AI mode or waiting, automatically take over / claim
  if (conv.mode === 'ai' || conv.mode === 'waiting_for_agent') {
    await conversationRepo.claimConversation(conversationId, agentId);
    conv.mode = 'human';
    conv.assigned_to = agentId;
    if (io) {
      const agent = await userRepo.findById(agentId);
      io.to(`conv_${conversationId}`).emit('mode_changed', { mode: 'human', agentName: agent?.name, conversationId });
      io.to('agents').emit('conversation_claimed', { conversationId, agentId, agentName: agent?.name });
      io.to('agents').emit('conversation_mode_changed', { conversationId, mode: 'human', agentName: agent?.name });
    }
  } else if (conv.assigned_to !== agentId) {
    const user = await userRepo.findById(agentId);
    if (!user || user.role !== 'admin') {
      throw Object.assign(new Error('Not authorized for this conversation'), { status: 403 });
    }
  }

  const msg = await messageRepo.create({
    conversationId,
    senderType: 'agent',
    senderId: agentId,
    content,
  });

  // Touch updated_at
  await conversationRepo.updateMode(conversationId, conv.mode, conv.assigned_to);

  if (io) {
    const agent = await userRepo.findById(agentId);
    const payload = {
      ...msg,
      agent_name: agent ? agent.name : 'Nhân viên',
    };
    io.to(`conv_${conversationId}`).emit('new_message', payload);
    io.to('agents').emit('new_message', payload);
  }

  return msg;
}

/**
 * Send message to conversation (CR-05):
 * If conversation is closed, preserve history as read-only, create a new active session,
 * trigger fresh AI greeting, and return the new conversation.
 */
async function sendMessage(conversationId, { guestSessionId, content, message, clientMessageId, io } = {}) {
  const text = (content || message || '').trim();
  const conv = await conversationRepo.findById(conversationId);
  if (!conv) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }

  // CR-05: Target conversation is closed -> spawn new active session
  if (conv.mode === 'closed') {
    const effectiveSession = guestSessionId || conv.guest_session_id;
    const newConv = await conversationRepo.create({
      guestSessionId: effectiveSession,
      productContextId: conv.product_context_id || null,
    });

    if (conv.customer_name || conv.customer_phone || conv.customer_email) {
      await conversationRepo.updateCustomerInfo(newConv.id, {
        customerName: conv.customer_name,
        customerPhone: conv.customer_phone,
        customerEmail: conv.customer_email,
      });
    }

    // Fresh AI greeting
    const welcomeMessage = await settingsRepo.get('ai_welcome_message');
    const greetingMsg = await messageRepo.create({
      conversationId: newConv.id,
      senderType: 'assistant',
      content: welcomeMessage || 'Dạ, em là AI tư vấn của salon. Em có thể hỗ trợ mình tìm hiểu dịch vụ, giá và thời gian thực hiện hoặc hướng dẫn đặt lịch. Mình cần tư vấn nội dung nào ạ?',
    });

    let userMsg = null;
    let aiMsg = null;
    let aiConfigured = false;

    if (text) {
      userMsg = await messageRepo.create({
        conversationId: newConv.id,
        senderType: 'user',
        content: text,
        metadata: clientMessageId ? { clientMessageId } : null,
      });

      const orchestrator = require('../ai/orchestrator');
      const chatRes = await orchestrator.chat({
        conversationId: newConv.id,
        guestSessionId: effectiveSession,
        userMessage: text,
      });

      aiConfigured = chatRes.aiConfigured;
      aiMsg = await messageRepo.create({
        conversationId: newConv.id,
        senderType: 'assistant',
        content: chatRes.content,
      });

      await conversationRepo.updateMode(newConv.id, 'ai', null);
    }

    if (io) {
      io.to(`conv_${newConv.id}`).emit('new_message', greetingMsg);
      if (userMsg) {
        const broadcastUserMsg = { ...userMsg, client_message_id: clientMessageId || null };
        io.to(`conv_${newConv.id}`).emit('new_message', broadcastUserMsg);
        io.to('agents').emit('new_message', broadcastUserMsg);
      }
      if (aiMsg) {
        io.to(`conv_${newConv.id}`).emit('new_message', aiMsg);
        io.to('agents').emit('new_message', aiMsg);
      }
    }

    const enrichedNewConv = await conversationRepo.findById(newConv.id);
    return {
      conversation: enrichedNewConv || newConv,
      isNewSession: true,
      newConversationId: newConv.id,
      greeting: greetingMsg,
      userMessage: userMsg,
      message: aiMsg,
      aiConfigured,
    };
  }

  // If conversation is in AI mode
  if (conv.mode === 'ai') {
    if (!text) {
      throw Object.assign(new Error('message is required'), { status: 400 });
    }

    sessionTimeoutService.resetInactivityWarning(conversationId);

    const userMsg = await messageRepo.create({
      conversationId,
      senderType: 'user',
      content: text,
      metadata: clientMessageId ? { clientMessageId } : null,
    });

    const orchestrator = require('../ai/orchestrator');
    const { content: aiContent, aiConfigured } = await orchestrator.chat({
      conversationId,
      guestSessionId: guestSessionId || conv.guest_session_id,
      userMessage: text,
    });

    const aiMsg = await messageRepo.create({
      conversationId,
      senderType: 'assistant',
      content: aiContent,
    });

    await conversationRepo.updateMode(conversationId, 'ai', conv.assigned_to);

    if (io) {
      const broadcastUserMsg = { ...userMsg, client_message_id: clientMessageId || null };
      io.to(`conv_${conversationId}`).emit('new_message', broadcastUserMsg);
      io.to('agents').emit('new_message', broadcastUserMsg);
      io.to(`conv_${conversationId}`).emit('new_message', aiMsg);
      io.to('agents').emit('new_message', aiMsg);
    }

    return {
      conversation: conv,
      isNewSession: false,
      message: aiMsg,
      userMessage: userMsg,
      aiConfigured,
    };
  }

  // If conversation is in human or waiting_for_agent mode
  if (!text) {
    throw Object.assign(new Error('message is required'), { status: 400 });
  }

  const userMsg = await messageRepo.create({
    conversationId,
    senderType: 'user',
    content: text,
    metadata: clientMessageId ? { clientMessageId } : null,
  });

  await conversationRepo.updateMode(conversationId, conv.mode, conv.assigned_to);

  if (io) {
    const broadcastUserMsg = { ...userMsg, client_message_id: clientMessageId || null };
    io.to(`conv_${conversationId}`).emit('new_message', broadcastUserMsg);
    io.to('agents').emit('new_message', broadcastUserMsg);
  }

  return {
    conversation: conv,
    isNewSession: false,
    message: userMsg,
  };
}

module.exports = {
  getOrCreate, getMessages, addMessage, sendMessage,
  requestAgentSwitch, switchBackToAI,
  agentClaim, agentClose, closeAsLead, agentSendMessage,
};
