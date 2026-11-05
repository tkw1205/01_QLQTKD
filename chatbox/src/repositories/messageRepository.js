'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

async function create({ conversationId, senderType, senderId = null, content, metadata = null, isRead = null }) {
  const messages = jsonStore.getCollection('messages');
  const now = new Date().toISOString();

  // Messages sent by agent or system are automatically considered read by staff.
  // Messages from customer/user are unread until staff views them.
  const isMsgRead = (isRead !== null)
    ? Boolean(isRead)
    : (senderType === 'agent' || senderType === 'system');

  const newMsg = {
    id: uuidv4(),
    conversation_id: conversationId,
    sender_type: senderType,
    sender_id: senderId,
    content,
    metadata: metadata || null,
    is_read: isMsgRead,
    read_at: isMsgRead ? now : null,
    created_at: now,
  };

  messages.push(newMsg);
  jsonStore.saveCollection('messages', messages);
  return newMsg;
}

async function markAllAsRead(conversationId) {
  if (!conversationId) return 0;
  const messages = jsonStore.getCollection('messages');
  const now = new Date().toISOString();
  let updatedCount = 0;

  for (const m of messages) {
    if (m.conversation_id === conversationId && !m.is_read) {
      m.is_read = true;
      m.read_at = now;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    jsonStore.saveCollection('messages', messages);
  }
  return updatedCount;
}

async function countUnread(conversationId) {
  if (!conversationId) return 0;
  const messages = jsonStore.getCollection('messages');
  return messages.filter(
    m => m.conversation_id === conversationId && m.sender_type === 'user' && !m.is_read
  ).length;
}

async function findByConversation(conversationId, { limit = 100, before = null } = {}) {
  const messages = jsonStore.getCollection('messages');
  let filtered = messages.filter(m => m.conversation_id === conversationId);

  if (before) {
    const beforeDate = new Date(before);
    filtered = filtered.filter(m => new Date(m.created_at) < beforeDate);
  }

  filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return filtered.slice(0, limit);
}

async function findForAI(conversationId, { limit = 20 } = {}) {
  const messages = jsonStore.getCollection('messages');
  const filtered = messages.filter(
    m => m.conversation_id === conversationId &&
      (m.sender_type === 'user' || m.sender_type === 'assistant') &&
      m.metadata?.kind !== 'session_timeout_warning' &&
      !/phiên chat sẽ tự động kết thúc sau 5 phút nữa/iu.test(m.content || '')
  );

  filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const recent = filtered.slice(0, limit);
  return recent.reverse().map(m => ({
    sender_type: m.sender_type,
    content: m.content,
    created_at: m.created_at,
  }));
}

async function countByConversation(conversationId) {
  const messages = jsonStore.getCollection('messages');
  return messages.filter(m => m.conversation_id === conversationId).length;
}

async function findDuplicateUserMessage(conversationId, content, clientMessageId = null) {
  if (!conversationId || !content) return null;
  const messages = jsonStore.getCollection('messages');
  const now = Date.now();
  const trimmed = content.trim();

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.conversation_id !== conversationId) continue;
    const msgTime = new Date(m.created_at).getTime();
    const age = now - msgTime;

    if (m.sender_type === 'user') {
      // 1. If same clientMessageId (idempotency key), check within 120 seconds window
      if (clientMessageId && m.metadata?.clientMessageId === clientMessageId && age <= 120000) {
        return m;
      }
      // 2. If exact same content without clientMessageId (rapid double click), check within 5 seconds window
      if (m.content && m.content.trim() === trimmed && age <= 5000) {
        return m;
      }
    }
  }
  return null;
}

module.exports = {
  create,
  findByConversation,
  findForAI,
  countByConversation,
  markAllAsRead,
  countUnread,
  findDuplicateUserMessage,
};
