'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Runtime data, not source — gitignored. Persisted to disk (not just an
// in-memory Map) because the deploy timer/service restarts the process
// periodically (see deploy/toolsapp.service, deploy-check.sh) — in-memory
// sessions would silently log everyone out on every deploy.
const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'sessions.json');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadSessions() {
  if (!fs.existsSync(SESSIONS_PATH)) return {};
  return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
}

function saveSessions(sessions) {
  fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2) + '\n');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = { token, userId, createdAt: new Date().toISOString() };
  saveSessions(sessions);
  return token;
}

// Expired sessions are pruned lazily here rather than on a timer — simplest
// option for a low-traffic personal site, and it self-heals sessions.json
// over time as lookups happen.
function getSession(token) {
  if (!token) return null;
  const sessions = loadSessions();
  const session = sessions[token];
  if (!session) return null;
  const age = Date.now() - new Date(session.createdAt).getTime();
  if (age > MAX_AGE_MS) {
    delete sessions[token];
    saveSessions(sessions);
    return null;
  }
  return session;
}

function deleteSession(token) {
  if (!token) return;
  const sessions = loadSessions();
  if (sessions[token]) {
    delete sessions[token];
    saveSessions(sessions);
  }
}

module.exports = { createSession, getSession, deleteSession, MAX_AGE_MS };
