'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const settingsRepo = require('../repositories/settingsRepository');

// GET /api/settings/public - Get public settings (no auth)
router.get('/public', asyncHandler(async (req, res) => {
  const settings = await settingsRepo.getPublic();
  res.json({ success: true, data: settings });
}));

// GET /api/settings/business-hours - Get working hours (public)
router.get('/business-hours', asyncHandler(async (req, res) => {
  const hours = await settingsRepo.getBusinessSetting('working_hours');
  res.json({ success: true, data: hours });
}));

// GET /api/settings - Admin: get all settings
router.get('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const system = await settingsRepo.getAll();
  const business = await settingsRepo.getAllBusiness();
  res.json({ success: true, data: { system, business } });
}));

// PUT /api/settings/system - Admin: update system settings
router.put('/system', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const SAFE_KEYS = ['site_name', 'site_tagline', 'ai_welcome_message', 'ai_system_prompt',
    'max_ai_turns', 'appointment_duration', 'allow_guest_chat'];
  for (const [key, value] of Object.entries(req.body)) {
    if (SAFE_KEYS.includes(key)) {
      await settingsRepo.set(key, value);
    }
  }
  res.json({ success: true, message: 'Settings updated' });
}));

// PUT /api/settings/business - Admin: update business settings
router.put('/business', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const SAFE_KEYS = ['working_hours', 'contact_info'];
  for (const [key, value] of Object.entries(req.body)) {
    if (SAFE_KEYS.includes(key)) {
      await settingsRepo.setBusinessSetting(key, value);
    }
  }
  res.json({ success: true, message: 'Business settings updated' });
}));

module.exports = router;
