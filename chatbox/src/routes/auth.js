'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const authService = require('../services/authService');

// POST /api/auth/register - Register customer account
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name, phone } = req.body;
  const { token, user } = await authService.register({ email, password, name, phone });

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({ success: true, data: { user, token } });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { token, user } = await authService.login(email, password);

  // Set HTTP-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({ success: true, data: { user, token } });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { password_hash, ...safeUser } = req.user;

  // Synchronize HTTP-only cookie if authenticated via Bearer header
  if (!req.cookies?.token && req.headers.authorization?.startsWith('Bearer ')) {
    const token = req.headers.authorization.slice(7).trim();
    if (token) {
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
  }

  res.json({ success: true, data: { user: safeUser } });
}));

// GET /api/auth/profile
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const { password_hash, ...safeUser } = req.user;
  res.json({ success: true, data: { user: safeUser } });
}));

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const updatedUser = await authService.updateProfile(req.user.id, { name, phone });
  res.json({ success: true, data: { user: updatedUser } });
}));

// PUT /api/auth/availability - Toggle agent availability
router.put('/availability', authenticate, asyncHandler(async (req, res) => {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ success: false, error: 'isAvailable must be boolean' });
  }
  const userRepo = require('../repositories/userRepository');
  const updated = await userRepo.setAvailability(req.user.id, isAvailable);
  res.json({ success: true, data: updated });
}));

module.exports = router;
