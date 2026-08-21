'use strict';

const express = require('express');
const cookie = require('cookie');
const { validateEmail, validatePassword, normalizeEmail } = require('../lib/authValidation');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { findByEmail, createUser } = require('../lib/userStore');
const { createSession, deleteSession, MAX_AGE_MS } = require('../lib/sessionStore');
const { SESSION_COOKIE } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: MAX_AGE_MS };

router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};

  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return res.status(400).json({ success: false, errors: emailCheck.errors });

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) return res.status(400).json({ success: false, errors: passwordCheck.errors });

  if (findByEmail(emailCheck.normalized)) {
    return res.status(400).json({ success: false, errors: ['An account with that email already exists.'] });
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = createUser(emailCheck.normalized, passwordHash);
    if (!user) return res.status(400).json({ success: false, errors: ['An account with that email already exists.'] });

    const token = createSession(user.id);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    res.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error('POST /api/auth/signup failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't create the account: ${e.message}`] });
  }
});

// "No such account" and "wrong password" return the identical generic
// error — distinguishing them would let someone enumerate registered
// emails.
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const GENERIC_ERROR = { success: false, errors: ['Incorrect email or password.'] };

  const user = findByEmail(normalizeEmail(email));
  if (!user) return res.status(401).json(GENERIC_ERROR);

  try {
    const ok = await verifyPassword(typeof password === 'string' ? password : '', user.passwordHash);
    if (!ok) return res.status(401).json(GENERIC_ERROR);

    const token = createSession(user.id);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    res.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error('POST /api/auth/login failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't log you in: ${e.message}`] });
  }
});

router.post('/logout', (req, res) => {
  const cookies = cookie.parseCookie(req.headers.cookie || '');
  deleteSession(cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  res.json(req.user || null);
});

module.exports = router;
