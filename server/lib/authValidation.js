'use strict';

// Deliberately not a full RFC 5322 validator — just enough shape-checking
// to catch obvious typos ("chris@", "chris.com") without rejecting real
// addresses a stricter regex might trip up on.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // practical upper bound (RFC 5321 §4.5.3.1.3)
const MIN_PASSWORD_LENGTH = 8;

// Emails are stored/compared lowercase so "Chris@Example.com" and
// "chris@example.com" can't register as two different accounts.
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { valid: false, errors: ['Email is required.'] };
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalized)) {
    return { valid: false, errors: ['Enter a valid email address.'] };
  }
  return { valid: true, errors: [], normalized };
}

function validatePassword(password) {
  if (typeof password !== 'string' || !password) return { valid: false, errors: ['Password is required.'] };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, errors: [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`] };
  }
  return { valid: true, errors: [] };
}

module.exports = { normalizeEmail, validateEmail, validatePassword, MIN_PASSWORD_LENGTH };
