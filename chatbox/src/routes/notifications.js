'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireStaffOrReceptionist } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const notificationRepo = require('../repositories/notificationRepository');

// GET /api/admin/notifications/unread-count
router.get('/unread-count', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const count = await notificationRepo.getUnreadCount();
  res.json({ success: true, data: { count }, unreadCount: count });
}));

// GET /api/admin/notifications
router.get('/', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const { isRead, limit } = req.query;
  const notifications = await notificationRepo.getAll({ isRead, limit });
  res.json({ success: true, data: notifications });
}));

// PUT /api/admin/notifications/read-all
router.put('/read-all', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const result = await notificationRepo.markAllAsRead();
  res.json({ success: true, data: result, message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
}));

// PUT /api/admin/notifications/:id/read
router.put('/:id/read', authenticate, requireStaffOrReceptionist, asyncHandler(async (req, res) => {
  const notif = await notificationRepo.markAsRead(req.params.id);
  if (!notif) {
    return res.status(404).json({ success: false, error: 'Thông báo không tồn tại' });
  }
  res.json({ success: true, data: notif });
}));

module.exports = router;
