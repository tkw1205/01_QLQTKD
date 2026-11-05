'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, requireStaff } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const conversationService = require('../services/conversationService');
const convRepo = require('../repositories/conversationRepository');
const messageRepo = require('../repositories/messageRepository');
const orchestrator = require('../ai/orchestrator');
const jsonStore = require('../config/jsonStore');
const settingsRepo = require('../repositories/settingsRepository');
const sessionTimeoutService = require('../services/sessionTimeoutService');

// GET /api/conversations/current - Get or create conversation for guest
router.get('/current', asyncHandler(async (req, res) => {
  const { productId } = req.query;
  const conv = await conversationService.getOrCreate(req.guestSessionId, productId || null);
  let messages = await messageRepo.findByConversation(conv.id);
  if (conv.mode === 'ai' && messages.length === 0) {
    const welcomeMessage = await settingsRepo.get('ai_welcome_message');
    const greeting = await messageRepo.create({
      conversationId: conv.id,
      senderType: 'assistant',
      content: welcomeMessage || 'Dạ, em là AI tư vấn của salon. Em có thể hỗ trợ mình tìm hiểu dịch vụ, giá và thời gian thực hiện hoặc hướng dẫn đặt lịch. Mình cần tư vấn nội dung nào ạ?',
    });
    messages = [greeting];
  }
  res.json({ success: true, data: { conversation: conv, messages } });
}));

// GET /api/conversations/:id/messages
router.get('/:id/messages', asyncHandler(async (req, res) => {
  const { conversation, messages } = await conversationService.getMessages(
    req.params.id, req.guestSessionId
  );
  res.json({ success: true, data: { conversation, messages } });
}));

// POST /api/conversations/:id/chat - Send message to AI
router.post('/:id/chat', asyncHandler(async (req, res) => {
  const { message, clientMessageId } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const conversationId = req.params.id;
  const guestSessionId = req.guestSessionId;
  const io = req.app.get('io');

  // Verify conversation access
  const conv = await convRepo.findByIdAndSession(conversationId, guestSessionId);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

  // CR-05: If conversation is closed, preserve history and auto-spawn a new session
  if (conv.mode === 'closed') {
    const result = await conversationService.sendMessage(conversationId, {
      guestSessionId,
      message: message.trim(),
      clientMessageId,
      io,
    });
    return res.json({
      success: true,
      data: {
        conversation: result.conversation,
        newConversationId: result.newConversationId,
        isNewSession: true,
        greeting: result.greeting,
        message: result.message,
        aiConfigured: result.aiConfigured,
      },
    });
  }

  if (conv.mode !== 'ai') {
    return res.status(400).json({ success: false, error: 'Conversation is not in AI mode' });
  }

  // Reset inactivity warning on active user message
  sessionTimeoutService.resetInactivityWarning(conversationId);

  // Check for duplicate user message
  const duplicate = await messageRepo.findDuplicateUserMessage(conversationId, message.trim(), clientMessageId);
  if (duplicate) {
    return res.json({ success: true, data: { message: null, duplicate: true, originalId: duplicate.id } });
  }

  // Save user message
  const userMsg = await messageRepo.create({
    conversationId,
    senderType: 'user',
    content: message.trim(),
    metadata: clientMessageId ? { clientMessageId } : null,
  });

  const broadcastMsg = {
    ...userMsg,
    client_message_id: clientMessageId || null,
  };

  if (io) {
    io.to(`conv_${conversationId}`).emit('new_message', broadcastMsg);
    io.to('agents').emit('new_message', broadcastMsg);
  }

  // Get AI response
  const { content, aiConfigured, handoffAttempted, handoffStatus } = await orchestrator.chat({
    conversationId,
    guestSessionId,
    userMessage: message.trim(),
    io,
  });

  // Save AI response
  const aiMsg = await messageRepo.create({
    conversationId,
    senderType: 'assistant',
    content,
  });

  // Touch updated_at for conversation
  if (!handoffAttempted) {
    await convRepo.updateMode(conversationId, 'ai', conv.assigned_to);
  }

  if (io) {
    io.to(`conv_${conversationId}`).emit('new_message', aiMsg);
    io.to('agents').emit('new_message', aiMsg);
  }

  res.json({
    success: true,
    data: {
      message: aiMsg,
      aiConfigured,
      ...(handoffAttempted ? { handoffStatus } : {}),
    },
  });
}));

// POST /api/conversations/:id/switch-to-agent
router.post('/:id/switch-to-agent', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const result = await conversationService.requestAgentSwitch(
    req.params.id, req.guestSessionId, io
  );
  res.json({ success: true, data: result });
}));

// POST /api/conversations/:id/switch-to-ai
router.post('/:id/switch-to-ai', asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const result = await conversationService.switchBackToAI(
    req.params.id, req.guestSessionId, io
  );
  res.json({ success: true, data: result });
}));

// POST /api/conversations/:id/message - Guest sends message in human mode
router.post('/:id/message', asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const conversationId = req.params.id;
  const convRepo = require('../repositories/conversationRepository');
  const conv = await convRepo.findByIdAndSession(conversationId, req.guestSessionId);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  if (conv.mode === 'closed') {
    const io = req.app.get('io');
    const result = await conversationService.sendMessage(conversationId, {
      guestSessionId: req.guestSessionId,
      message: message.trim(),
      io,
    });
    return res.json({
      success: true,
      data: {
        conversation: result.conversation,
        newConversationId: result.newConversationId,
        isNewSession: true,
        greeting: result.greeting,
        message: result.message,
        aiConfigured: result.aiConfigured,
      },
    });
  }
  if (conv.mode === 'ai') return res.status(400).json({ success: false, error: 'Use /chat for AI mode' });

  const msg = await messageRepo.create({
    conversationId,
    senderType: 'user',
    content: message.trim(),
  });

  // Touch updated_at to reset staff inactivity timer (CR-06)
  await convRepo.updateMode(conversationId, conv.mode, conv.assigned_to);

  // Emit to agent via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.to(`conv_${conversationId}`).emit('new_message', msg);
    try {
      const notificationRepo = require('../repositories/notificationRepository');
      notificationRepo.create({
        conversationId,
        customerName: conv.customer_name || 'Khách hàng',
        lastMessage: message.trim(),
      }).then(async (notif) => {
        const unreadCount = await notificationRepo.getUnreadCount();
        io.to('agents').emit('new_notification', {
          notification: notif,
          unreadCount,
        });
      }).catch(err => {
        console.error('[Route] Error creating notification:', err.message);
      });
    } catch (err) {
      console.error('[Route] Failed to dispatch notification:', err.message);
    }
  }

  res.json({ success: true, data: msg });
}));

// ─── Agent routes ──────────────────────────────────────────────────────────────

// GET /api/conversations/agent/waiting - List waiting conversations
router.get('/agent/waiting', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const convRepo = require('../repositories/conversationRepository');
  const convs = await convRepo.findWaiting();
  res.json({ success: true, data: convs });
}));

// GET /api/conversations/agent/active - List active conversations (human + ai, or filtered by ?mode=)
router.get('/agent/active', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const convRepo = require('../repositories/conversationRepository');
  const { mode } = req.query;
  const convs = await convRepo.findActive({ mode });
  res.json({ success: true, data: convs });
}));

// GET /api/conversations/agent/ai - List AI conversations
router.get('/agent/ai', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const convRepo = require('../repositories/conversationRepository');
  const convs = await convRepo.findAI();
  res.json({ success: true, data: convs });
}));

// GET /api/conversations/agent/counts - Get counts of conversations by status
router.get('/agent/counts', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const convRepo = require('../repositories/conversationRepository');
  const counts = await convRepo.getCounts();
  res.json({ success: true, data: counts });
}));

// GET /api/conversations/agent/closed - List closed conversations
router.get('/agent/closed', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const convRepo = require('../repositories/conversationRepository');
  const { page = 1, limit = 20 } = req.query;
  const result = await convRepo.findClosed({ page: parseInt(page), limit: parseInt(limit) });
  res.json({ success: true, data: result.rows, meta: { total: result.total } });
}));

// GET /api/conversations/agent/:id - Agent views any conversation and marks it as read
router.get('/agent/:id', authenticate, requireStaff, asyncHandler(async (req, res) => {
  // Mark conversation and its messages as read for staff
  const conv = await convRepo.markAsRead(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });
  const messages = await messageRepo.findByConversation(req.params.id);

  // Mark related notifications as read
  try {
    const notificationRepo = require('../repositories/notificationRepository');
    const notifs = jsonStore.getCollection('notifications') || [];
    let notifModified = false;
    for (const n of notifs) {
      if (n.conversation_id === req.params.id && !n.is_read) {
        n.is_read = true;
        notifModified = true;
      }
    }
    if (notifModified) {
      jsonStore.saveCollection('notifications', notifs);
      const io = req.app.get('io');
      if (io) {
        const unreadNotifCount = await notificationRepo.getUnreadCount();
        io.to('agents').emit('notification_count_updated', { unreadCount: unreadNotifCount });
      }
    }
  } catch (e) {}

  // Broadcast conversation_read to agents
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('conversation_read', { conversationId: req.params.id, unreadCount: 0 });
  }

  res.json({ success: true, data: { conversation: conv, messages } });
}));

// POST /api/conversations/agent/:id/read - Explicitly mark conversation as read
router.post('/agent/:id/read', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const conv = await convRepo.markAsRead(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ success: false, error: 'Conversation not found' });

  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('conversation_read', { conversationId: req.params.id, unreadCount: 0 });
  }
  res.json({ success: true, data: { conversationId: req.params.id, unreadCount: 0 } });
}));

// POST /api/conversations/agent/:id/claim - Agent claims waiting conversation
router.post('/agent/:id/claim', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const conv = await conversationService.agentClaim(req.params.id, req.user.id, io);
  res.json({ success: true, data: conv });
}));

// POST /api/conversations/agent/:id/message - Agent sends message
router.post('/agent/:id/message', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }
  const io = req.app.get('io');
  const msg = await conversationService.agentSendMessage({
    conversationId: req.params.id,
    agentId: req.user.id,
    content: message.trim(),
    io,
  });
  await convRepo.markAsRead(req.params.id, req.user.id);
  if (io) {
    io.to('agents').emit('conversation_read', { conversationId: req.params.id, unreadCount: 0 });
  }
  res.json({ success: true, data: msg });
}));

// POST /api/conversations/agent/:id/close - Agent closes conversation
router.post('/agent/:id/close', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const conv = await conversationService.agentClose(req.params.id, req.user.id, io);
  res.json({ success: true, data: conv });
}));

module.exports = router;
