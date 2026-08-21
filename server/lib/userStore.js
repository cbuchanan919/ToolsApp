'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeEmail } = require('./authValidation');

// Runtime data, not source — gitignored, same reasoning as
// server/data/calendars/. A single file (not one-per-user like
// calendars/profiles) since lookups here are by email, not a
// client-supplied random id.
const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) return {};
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2) + '\n');
}

function findByEmail(email) {
  const users = loadUsers();
  return users[normalizeEmail(email)] || null;
}

function findById(id) {
  const users = loadUsers();
  return Object.values(users).find((u) => u.id === id) || null;
}

// Caller is responsible for validating the email/password shape first
// (see authValidation.js) and for hashing the password (see passwords.js) —
// this just persists an already-prepared record.
function createUser(email, passwordHash) {
  const normalized = normalizeEmail(email);
  const users = loadUsers();
  if (users[normalized]) return null; // caller checks this, but stay safe against races
  const user = { id: 'u-' + crypto.randomBytes(10).toString('hex'), email: normalized, passwordHash, createdAt: new Date().toISOString() };
  users[normalized] = user;
  saveUsers(users);
  return user;
}

module.exports = { findByEmail, findById, createUser };
