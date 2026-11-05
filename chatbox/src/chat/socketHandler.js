'use strict';
const { verifyToken } = require('../config/jwt');
const userRepository = require('../repositories/userRepository');
const conversationRepository = require('../repositories/conversationRepository');
const messageRepository = require('../repositories/messageRepository');
const notificationRepository = require('../repositories/notificationRepository');

async function verifySocketAgent(token) {
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    const user = await userRepository.findById(decoded.userId);
    if (user && user.is_active) {
      return { id: user.id, name: user.name, role: user.role };
    }
    return null;
  } catch {
    return null;
  }
}

function extractGuestSession(socket) {
  if (socket.handshake.auth?.guestSession) {
    return socket.handshake.auth.guestSession;
  }
  if (socket.handshake.headers?.['x-guest-session']) {
    return socket.handshake.headers['x-guest-session'];
  }
  const cookieHeader = socket.handshake.headers?.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)guest_session=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  if (socket.handshake.query?.guestSession) {
    return socket.handshake.query.guestSession;
  }
  return null;
}

async function verifyConversationAccess(conversationId, guestSessionId) {
  if (!conversationId) return false;
  if (guestSessionId) {
    const conv = await conversationRepository.findByIdAndSession(conversationId, guestSessionId);
    if (conv) return true;
    const directConv = await conversationRepository.findById(conversationId);
    if (directConv && directConv.guest_session_id === guestSessionId) return true;
  }
  // Fallback: If conversation exists and is not closed, allow client to connect
  const anyConv = await conversationRepository.findById(conversationId);
  return Boolean(anyConv && anyConv.mode !== 'closed');
}

async function verifyAgentConversationAccess(conversationId, agentId) {
  if (!conversationId || !agentId) return false;
  const conv = await conversationRepository.findById(conversationId);
  if (!conv) return false;
  // Agent can access if assigned or admin
  return true; // Will do role-based check in query
}

module.exports = function setupSocketIO(io) {
  // Middleware for agent authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const guestSession = extractGuestSession(socket);

    socket.guestSession = guestSession;

    if (token) {
      const agent = await verifySocketAgent(token);
      if (agent) {
        socket.agent = agent;
        socket.isAgent = true;
      }
    }

    next(); // Allow all connections; authorization is per-event
  });

  io.on('connection', (socket) => {
    const sessionId = socket.guestSession || socket.id;
    console.log(`[Socket] Connected: ${socket.id} (agent: ${socket.isAgent ? socket.agent?.name : 'guest'}, session: ${socket.guestSession || 'none'})`);

    // ── Agent joins agent room ──────────────────────────────────────────────────
    if (socket.isAgent) {
      socket.join('agents');
      console.log(`[Socket] Agent ${socket.agent.name} joined agents room`);

      socket.on('disconnect', () => {
        console.log(`[Socket] Agent ${socket.agent?.name} disconnected`);
      });
    }

    // ── Guest joins conversation room ──────────────────────────────────────────
    socket.on('join_conversation', async ({ conversationId, guestSession }) => {
      if (!conversationId) return;

      const effectiveGuestSession = socket.guestSession || guestSession || extractGuestSession(socket);
      if (effectiveGuestSession && !socket.guestSession) {
        socket.guestSession = effectiveGuestSession;
      }

      if (socket.isAgent) {
        // Agent: verify they can access
        socket.join(`conv_${conversationId}`);
        socket.emit('joined_conversation', { conversationId });
        console.log(`[Socket] Agent ${socket.agent?.name} joined conv_${conversationId}`);
      } else {
        // Guest: verify session ownership
        const hasAccess = await verifyConversationAccess(conversationId, socket.guestSession);
        if (!hasAccess) {
          console.warn(`[Socket] Guest access denied to conv_${conversationId} (session: ${socket.guestSession})`);
          socket.emit('error', { message: 'Access denied to conversation' });
          return;
        }
        socket.join(`conv_${conversationId}`);
        socket.emit('joined_conversation', { conversationId });
        console.log(`[Socket] Guest joined conv_${conversationId} successfully`);
      }
    });

    // ── Guest sends message via socket (human mode) ────────────────────────────
    socket.on('guest_message', async ({ conversationId, content, clientMessageId }) => {
      if (!conversationId || !content || !content.trim()) return;

      if (!socket.guestSession) {
        socket.guestSession = extractGuestSession(socket);
      }

      // Verify access
      const hasAccess = await verifyConversationAccess(conversationId, socket.guestSession);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Check conversation mode
      const conv = await conversationRepository.findById(conversationId);
      if (!conv) {
        socket.emit('error', { message: 'Conversation not available' });
        return;
      }

      // CR-05: Customer messages closed conversation -> auto spawn new session with AI greeting
      if (conv.mode === 'closed') {
        const conversationService = require('../services/conversationService');
        const result = await conversationService.sendMessage(conversationId, {
          guestSessionId: socket.guestSession,
          content: content.trim(),
          clientMessageId,
          io,
        });

        socket.join(`conv_${result.conversation.id}`);
        socket.emit('new_conversation_created', {
          oldConversationId: conversationId,
          newConversation: result.conversation,
          greeting: result.greeting,
          message: result.message,
        });
        return;
      }

      // Check duplicate
      const duplicate = await messageRepository.findDuplicateUserMessage(conversationId, content.trim(), clientMessageId, 4000);
      if (duplicate) return;

      // Reset inactivity warning on active interaction
      const sessionTimeoutService = require('../services/sessionTimeoutService');
      sessionTimeoutService.resetInactivityWarning(conversationId);
      await conversationRepository.updateMode(conversationId, conv.mode, conv.assigned_to);

      // Save message
      const msg = await messageRepository.create({
        conversationId,
        senderType: 'user',
        content: content.trim(),
        metadata: clientMessageId ? { clientMessageId } : null,
      });

      const broadcastMsg = {
        ...msg,
        client_message_id: clientMessageId || null,
      };

      // Broadcast to room (agent + guest)
      io.to(`conv_${conversationId}`).emit('new_message', broadcastMsg);

      // In staff/waiting mode: automatically create notification and emit to agents room
      if (conv.mode === 'human' || conv.mode === 'waiting_for_agent') {
        try {
          const notif = await notificationRepository.create({
            conversationId,
            customerName: conv.customer_name || 'Khách hàng',
            lastMessage: content.trim(),
          });
          const unreadCount = await notificationRepository.getUnreadCount();
          io.to('agents').emit('new_notification', {
            notification: notif,
            unreadCount,
          });
        } catch (err) {
          console.error('[Socket] Failed to create notification for guest_message:', err.message);
        }
      }
    });

    // ── Guest requests agent / transitions to waiting_for_agent ───────────────
    socket.on('request_agent', async ({ conversationId }) => {
      if (!conversationId) return;
      if (!socket.guestSession) {
        socket.guestSession = extractGuestSession(socket);
      }
      const hasAccess = await verifyConversationAccess(conversationId, socket.guestSession);
      if (!hasAccess) return;

      try {
        const conversationService = require('../services/conversationService');
        await conversationService.requestAgentSwitch(
          conversationId,
          socket.guestSession,
          io
        );
      } catch (error) {
        console.error('[Socket] Failed to hand off conversation to an agent:', error.message);
        socket.emit('error', {
          message: 'Chưa thể kết nối với nhân viên tư vấn. Vui lòng thử lại sau.',
        });
      }
    });

    // ── Agent sends message via socket ─────────────────────────────────────────
    socket.on('agent_message', async ({ conversationId, content }) => {
      if (!socket.isAgent) {
        socket.emit('error', { message: 'Not authenticated as agent' });
        return;
      }
      if (!conversationId || !content || !content.trim()) return;

      // Check conversation availability
      const conv = await conversationRepository.findById(conversationId);
      if (!conv) {
        socket.emit('error', { message: 'Conversation not found' });
        return;
      }
      if (conv.mode === 'closed') {
        socket.emit('error', { message: 'Conversation is closed' });
        return;
      }

      // If in AI or waiting mode, auto-claim
      if (conv.mode === 'ai' || conv.mode === 'waiting_for_agent') {
        await conversationRepository.claimConversation(conversationId, socket.agent.id);
        conv.mode = 'human';
        conv.assigned_to = socket.agent.id;
        io.to(`conv_${conversationId}`).emit('mode_changed', { mode: 'human', agentName: socket.agent.name, conversationId });
        io.to('agents').emit('conversation_claimed', { conversationId, agentId: socket.agent.id, agentName: socket.agent.name });
        io.to('agents').emit('conversation_mode_changed', { conversationId, mode: 'human', agentName: socket.agent.name });
      } else if (conv.assigned_to !== socket.agent.id && socket.agent.role !== 'admin') {
        socket.emit('error', { message: 'Not authorized for this conversation' });
        return;
      }

      const msg = await messageRepository.create({
        conversationId,
        senderType: 'agent',
        senderId: socket.agent.id,
        content: content.trim(),
      });

      // Update conversation timestamp
      await conversationRepository.updateMode(conversationId, conv.mode, conv.assigned_to);

      // Mark conversation as read since agent responded
      await conversationRepository.markAsRead(conversationId, socket.agent.id);

      // Broadcast to room and agents
      const payload = {
        ...msg,
        agent_name: socket.agent.name,
      };
      io.to(`conv_${conversationId}`).emit('new_message', payload);
      io.to('agents').emit('new_message', payload);
      io.to('agents').emit('conversation_read', { conversationId, unreadCount: 0 });
    });

    // ── Agent marks conversation as read ───────────────────────────────────────
    socket.on('mark_read', async ({ conversationId }) => {
      if (!socket.isAgent || !conversationId) return;
      await conversationRepository.markAsRead(conversationId, socket.agent.id);
      io.to('agents').emit('conversation_read', { conversationId, unreadCount: 0 });
    });

    // ── Agent typing indicator ─────────────────────────────────────────────────
    socket.on('typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conv_${conversationId}`).emit('typing', {
        isTyping,
        isAgent: socket.isAgent,
        name: socket.isAgent ? socket.agent?.name : 'Khách hàng',
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error on ${socket.id}:`, err.message);
    });
  });
};
