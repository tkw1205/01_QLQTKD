const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
  console.warn('[JWT] WARNING: JWT_SECRET is weak or not set. Use a strong secret in production.');
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET || 'dev-secret-change-in-production-32chars', {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET || 'dev-secret-change-in-production-32chars');
}

module.exports = { signToken, verifyToken };
