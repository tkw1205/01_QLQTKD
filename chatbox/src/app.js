'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const config = require('./config');
const { waitForDatabase } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { guestSession } = require('./middleware/guestSession');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
});

// Expose io to routes
app.set('io', io);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.socket.io'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : true,
  credentials: true,
}));

// Rate limiting disabled on local environment - no-op pass-through middleware
const noopLimiter = (req, res, next) => next();
const globalLimiter = noopLimiter;
const loginLimiter = noopLimiter;
const registerLimiter = noopLimiter;
const authLimiter = noopLimiter;

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(guestSession);

app.get('/appointments.html', (req, res) => {
  res.redirect(302, '/chat.html');
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Frontend routes - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(__dirname, '../public', 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(200).json({ status: 'ok', message: 'Chatbox API is running. Frontend not built yet.' });
      }
    });
  }
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Setup Socket.IO handlers
require('./chat/socketHandler')(io);

// Background Session Timeout Service
const sessionTimeoutService = require('./services/sessionTimeoutService');

// Start server
async function start() {
  try {
    console.log('[APP] Starting Chatbox Consulting Platform...');
    console.log(`[APP] Environment: ${config.env}`);

    await waitForDatabase();

    // Run migrations
    const { runMigrations } = require('../database/migrate');
    await runMigrations();

    const aiValidation = config.validateAIConfig();
    if (!aiValidation.valid) {
      console.error(`[AI ERROR] Cấu hình AI Provider không hợp lệ: ${aiValidation.error}`);
      console.warn('[AI WARNING] Tính năng AI chat sẽ phản hồi thông báo bảo trì cho đến khi cấu hình hợp lệ.');
    } else {
      console.log(`[AI] Provider đã kích hoạt: ${config.ai.provider.toUpperCase()} (Model: ${config.ai.model})`);
    }

    // Start background session timeout scheduler (CR-04, CR-06)
    sessionTimeoutService.start(io);

    server.listen(config.port, '0.0.0.0', () => {
      console.log(`[APP] Server running on port ${config.port}`);
      console.log(`[APP] Website: http://localhost:${config.port}`);
      console.log(`[APP] Admin:   http://localhost:${config.port}/admin`);
    });
  } catch (err) {
    console.error('[APP] Fatal startup error:', err.message);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  console.error('[APP] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[APP] Unhandled Rejection at:', promise, 'reason:', reason);
});

if (require.main === module) {
  start();
}

module.exports = { app, server, io, start, authLimiter, loginLimiter, registerLimiter, sessionTimeoutService };
