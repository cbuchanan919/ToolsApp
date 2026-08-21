'use strict';

const cookie = require('cookie');
const { getSession } = require('../lib/sessionStore');
const { findById } = require('../lib/userStore');

const SESSION_COOKIE = 'tools_session';

// Mounted globally (before any route) so every handler can read req.user —
// null when logged out, {id, email} when a valid session cookie is
// present. Doesn't reject anything itself; that's requireAuth's job.
function attachUser(req, res, next) {
  const cookies = cookie.parseCookie(req.headers.cookie || '');
  const session = getSession(cookies[SESSION_COOKIE]);
  const user = session ? findById(session.userId) : null;
  req.user = user ? { id: user.id, email: user.email } : null;
  next();
}

// Every API route ran through this even when it was a no-op (see git
// history) — real auth is now a matter of filling this in, not a
// routes/ refactor. Applied per-route (not always at the router level) —
// e.g. Exam's GET routes stay open while POST/DELETE require login.
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, errors: ['Login required.'] });
  next();
}

module.exports = { attachUser, requireAuth, SESSION_COOKIE };
