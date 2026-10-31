'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

function enrichConversation(conv) {
  if (!conv) return null;
  const users = jsonStore.getCollection('users');
  const products = jsonStore.getCollection('products');
  const messages = jsonStore.getCollection('messages');

  const agent = conv.assigned_to ? users.find(u => u.id === conv.assigned_to) : null;
  const product = conv.product_context_id ? products.find(p => p.id === conv.product_context_id) : null;
  
  const convMsgs = messages.filter(m => m.conversation_id === conv.id);
  convMsgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const lastMsg = convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : null;

  // Calculate unread count for Admin/Staff:
  // Only counts messages from customer (user) that have not been read.
  const unreadCount = convMsgs.filter(m => {
    if (m.sender_type !== 'user') return false;
    if (m.is_read === true || m.read_at) return false;
    if (conv.agent_last_read_at && new Date(m.created_at) <= new Date(conv.agent_last_read_at)) {
      return false;
    }
    return true;
  }).length;

  const normSessionId = typeof conv.guest_session_id === 'object' && conv.guest_session_id !== null
    ? (conv.guest_session_id.guestSessionId || conv.guest_session_id.id || String(conv.id))
    : String(conv.guest_session_id || conv.id || '');

  return {
    ...conv,
    guest_session_id: normSessionId,
    agent_name: agent ? agent.name : null,
    agent_email: agent ? agent.email : null,
    product_name: product ? product.name : null,
    message_count: convMsgs.length,
    unread_count: unreadCount,
    last_message: lastMsg ? lastMsg.content : null,
    last_message_sender: lastMsg ? lastMsg.sender_type : null,
    last_message_at: lastMsg ? lastMsg.created_at : (conv.updated_at || conv.created_at),
  };
}

async function create({ guestSessionId, productContextId = null }) {
  const conversations = jsonStore.getCollection('conversations');
  const now = new Date().toISOString();
  const normSession = typeof guestSessionId === 'object' && guestSessionId !== null
    ? (guestSessionId.guestSessionId || guestSessionId.id || String(guestSessionId))
    : String(guestSessionId || '');
  const newConv = {
    id: uuidv4(),
    guest_session_id: normSession,
    mode: 'ai',
    assigned_to: null,
    product_context_id: productContextId,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    is_lead: false,
    lead_notes: null,
    created_at: now,
    updated_at: now,
  };
  conversations.push(newConv);
  jsonStore.saveCollection('conversations', conversations);
  return newConv;
}

async function findById(id) {
  if (!id) return null;
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === id);
  return enrichConversation(conv);
}

async function findByIdAndSession(id, guestSessionId) {
  if (!id || !guestSessionId) return null;
  const normSession = typeof guestSessionId === 'object' && guestSessionId !== null
    ? (guestSessionId.guestSessionId || guestSessionId.id)
    : guestSessionId;
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => {
    const cSession = typeof c.guest_session_id === 'object' && c.guest_session_id !== null
      ? (c.guest_session_id.guestSessionId || c.guest_session_id.id)
      : c.guest_session_id;
    return c.id === id && cSession === normSession;
  });
  return enrichConversation(conv);
}

async function findBySession(guestSessionId) {
  if (!guestSessionId) return null;
  const normSession = typeof guestSessionId === 'object' && guestSessionId !== null
    ? (guestSessionId.guestSessionId || guestSessionId.id)
    : guestSessionId;
  const conversations = jsonStore.getCollection('conversations');
  const matched = conversations.filter(c => {
    const cSession = typeof c.guest_session_id === 'object' && c.guest_session_id !== null
      ? (c.guest_session_id.guestSessionId || c.guest_session_id.id)
      : c.guest_session_id;
    return cSession === normSession;
  });
  if (!matched.length) return null;
  matched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return enrichConversation(matched[0]);
}

async function updateMode(id, mode, assignedTo = undefined) {
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === id);
  if (!conv) return null;
  conv.mode = mode;
  if (assignedTo !== undefined) {
    conv.assigned_to = assignedTo;
  }
  conv.updated_at = new Date().toISOString();
  jsonStore.saveCollection('conversations', conversations);
  return enrichConversation(conv);
}

async function closeAsLead(id, { leadNotes = null, leadPhone = null, customerName = null } = {}) {
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === id);
  if (!conv) return null;

  conv.mode = 'closed';
  conv.is_lead = true;
  if (leadNotes) conv.lead_notes = leadNotes;
  if (leadPhone) conv.customer_phone = leadPhone;
  if (customerName) conv.customer_name = customerName;
  conv.updated_at = new Date().toISOString();

  jsonStore.saveCollection('conversations', conversations);
  return enrichConversation(conv);
}

async function updateCustomerInfo(id, { customerName, customerPhone, customerEmail, name, phone, email } = {}) {
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === id);
  if (!conv) return null;
  const cName = customerName || name;
  const cPhone = customerPhone || phone;
  const cEmail = customerEmail || email;
  if (cName) conv.customer_name = cName;
  if (cPhone) conv.customer_phone = cPhone;
  if (cEmail) conv.customer_email = cEmail;
  conv.updated_at = new Date().toISOString();
  jsonStore.saveCollection('conversations', conversations);
  return enrichConversation(conv);
}

async function claimConversation(conversationId, agentId) {
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (conv.mode !== 'waiting_for_agent' && conv.mode !== 'ai') {
    throw Object.assign(new Error('Conversation is not waiting or already claimed'), { status: 409 });
  }
  if (conv.assigned_to && conv.assigned_to !== agentId && conv.mode === 'human') {
    throw Object.assign(new Error('Conversation already claimed by another agent'), { status: 409 });
  }

  conv.mode = 'human';
  conv.assigned_to = agentId;
  conv.updated_at = new Date().toISOString();
  jsonStore.saveCollection('conversations', conversations);
  return enrichConversation(conv);
}

async function markAsRead(id, agentId = null) {
  if (!id) return null;
  const conversations = jsonStore.getCollection('conversations');
  const conv = conversations.find(c => c.id === id);
  if (!conv) return null;

  const now = new Date().toISOString();
  conv.agent_last_read_at = now;
  jsonStore.saveCollection('conversations', conversations);

  // Mark all unread messages for this conversation as read
  const messages = jsonStore.getCollection('messages');
  let msgUpdated = false;
  for (const m of messages) {
    if (m.conversation_id === id && (!m.is_read || !m.read_at)) {
      m.is_read = true;
      m.read_at = now;
      msgUpdated = true;
    }
  }
  if (msgUpdated) {
    jsonStore.saveCollection('messages', messages);
  }

  return enrichConversation(conv);
}

async function findWaiting() {
  const conversations = jsonStore.getCollection('conversations');
  const matched = conversations.filter(c => c.mode === 'waiting_for_agent');
  matched.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  return matched.map(enrichConversation);
}

async function findActive({ mode } = {}) {
  const conversations = jsonStore.getCollection('conversations');
  let matched = conversations.filter(c => c.mode === 'human' || c.mode === 'ai');
  if (mode && (mode === 'human' || mode === 'ai')) {
    matched = conversations.filter(c => c.mode === mode);
  }
  matched.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  return matched.map(enrichConversation);
}

async function findAI() {
  const conversations = jsonStore.getCollection('conversations');
  const matched = conversations.filter(c => c.mode === 'ai');
  matched.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  return matched.map(enrichConversation);
}

async function findClosed({ page = 1, limit = 20 } = {}) {
  const conversations = jsonStore.getCollection('conversations');
  const matched = conversations.filter(c => c.mode === 'closed');
  matched.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  const offset = (page - 1) * limit;
  const rows = matched.slice(offset, offset + limit).map(enrichConversation);
  return { rows, total: matched.length };
}

async function getCounts() {
  const conversations = jsonStore.getCollection('conversations');
  const result = { ai: 0, waiting_for_agent: 0, human: 0, closed: 0, active: 0 };
  for (const c of conversations) {
    if (result[c.mode] !== undefined) {
      result[c.mode]++;
    }
    if (c.mode === 'human' || c.mode === 'ai') {
      result.active++;
    }
  }
  return result;
}

module.exports = {
  create,
  findById,
  findByIdAndSession,
  findBySession,
  updateMode,
  closeAsLead,
  updateCustomerInfo,
  claimConversation,
  markAsRead,
  findWaiting,
  findActive,
  findAI,
  findClosed,
  getCounts,
};
