'use strict';

const { verifyToken } = require('../config/jwt');
const userRepository = require('../repositories/userRepository');

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      return token;
    }
  }
  if (req.cookies && req.cookies.token) {
    const cookieToken = typeof req.cookies.token === 'string' ? req.cookies.token.trim() : null;
    if (cookieToken && cookieToken !== 'null' && cookieToken !== 'undefined') {
      return cookieToken;
    }
  }
  return null;
}

async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required', code: 'AuthenticationRequired' });
  }
  try {
    const decoded = verifyToken(token);
    // Verify user still exists and is active
    const user = await userRepository.findById(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'User not found or deactivated', code: 'UserDeactivated' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', code: 'TokenExpired' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token', code: 'InvalidToken' });
  }
}

async function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }
  try {
    const decoded = verifyToken(token);
    const user = await userRepository.findById(decoded.userId);
    if (user && user.is_active) {
      req.user = user;
    }
  } catch {
    // Ignore invalid/expired token for optional authentication
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireStaff = requireRole('admin', 'staff', 'receptionist');
const requireStaffOrReceptionist = requireRole('admin', 'staff', 'receptionist');

// Note: Under business_spec_booking.md, Receptionist is permitted to manage appointments,
// update status, reschedule, cancel, edit services, and chat.
// forbidReceptionist is kept for backward compatibility if needed, but not used on permitted routes.
function forbidReceptionist(req, res, next) {
  if (req.user && req.user.role === 'receptionist') {
    return res.status(403).json({
      success: false,
      error: 'Receptionists are not permitted to perform this administrative operation',
    });
  }
  next();
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  requireRole,
  requireAdmin,
  requireStaff,
  requireStaffOrReceptionist,
  forbidReceptionist,
  extractToken,
};
