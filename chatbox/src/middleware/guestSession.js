const { v4: uuidv4 } = require('uuid');

const GUEST_SESSION_COOKIE = 'guest_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 ngày

function guestSession(req, res, next) {
  let sessionId = (req.cookies && req.cookies[GUEST_SESSION_COOKIE]) ||
                  req.headers['x-guest-session'];
  if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
    sessionId = uuidv4();
    res.cookie(GUEST_SESSION_COOKIE, sessionId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  req.guestSessionId = sessionId;
  next();
}

module.exports = { guestSession, GUEST_SESSION_COOKIE };
