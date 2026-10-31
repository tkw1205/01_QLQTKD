'use strict';

const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../config/jsonStore');

async function getAll({ isRead, limit } = {}) {
  const notifications = jsonStore.getCollection('notifications') || [];
  let result = [...notifications];

  if (typeof isRead === 'boolean') {
    result = result.filter(n => n.is_read === isRead);
  } else if (typeof isRead === 'string' && (isRead === 'true' || isRead === 'false')) {
    result = result.filter(n => n.is_read === (isRead === 'true'));
  }

  // Sort descending by created_at (newest first)
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (limit) {
    const parsedLimit = parseInt(limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      result = result.slice(0, parsedLimit);
    }
  }

  return result;
}

async function getUnreadCount() {
  const notifications = jsonStore.getCollection('notifications') || [];
  return notifications.filter(n => !n.is_read).length;
}

async function findById(id) {
  if (!id) return null;
  const notifications = jsonStore.getCollection('notifications') || [];
  return notifications.find(n => n.id === id) || null;
}

async function create({ conversationId, customerName, lastMessage }) {
  const notifications = jsonStore.getCollection('notifications') || [];
  const now = new Date().toISOString();

  // Deduplication check: if there is already an unread notification for this conversation,
  // update the existing notification to avoid spamming duplicate notifications
  const existingIndex = notifications.findIndex(n => n.conversation_id === conversationId && !n.is_read);
  if (existingIndex !== -1) {
    const existing = notifications[existingIndex];
    existing.last_message = lastMessage || '';
    if (customerName) {
      existing.customer_name = customerName;
    }
    existing.created_at = now;
    jsonStore.saveCollection('notifications', notifications);
    return existing;
  }

  const newNotif = {
    id: uuidv4(),
    conversation_id: conversationId,
    customer_name: customerName || 'Khách hàng',
    last_message: lastMessage || '',
    is_read: false,
    created_at: now,
  };

  notifications.unshift(newNotif);
  jsonStore.saveCollection('notifications', notifications);
  return newNotif;
}

async function markAsRead(id) {
  if (!id) return null;
  const notifications = jsonStore.getCollection('notifications') || [];
  const notif = notifications.find(n => n.id === id);
  if (!notif) return null;

  notif.is_read = true;
  jsonStore.saveCollection('notifications', notifications);
  return notif;
}

async function markAllAsRead() {
  const notifications = jsonStore.getCollection('notifications') || [];
  let updatedCount = 0;
  for (const n of notifications) {
    if (!n.is_read) {
      n.is_read = true;
      updatedCount++;
    }
  }
  jsonStore.saveCollection('notifications', notifications);
  return { updatedCount };
}

module.exports = {
  getAll,
  getUnreadCount,
  findById,
  create,
  markAsRead,
  markAllAsRead,
};
