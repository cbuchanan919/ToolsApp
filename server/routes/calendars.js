'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateCalendar } = require('../lib/calendarValidation');

const router = express.Router();

// Runtime data (one JSON file per calendar), not source — gitignored. Lives
// under server/ rather than public/ so it's only ever reachable through this
// API, never as a directly-fetchable static file.
const CALENDARS_DIR = path.join(__dirname, '..', 'data', 'calendars');

// One calendar per user now (mounted behind requireAuth in app.js, so
// req.user is always set here) — filename is just the already-safe
// generated user id, no separate cal- id scheme needed.
const DEFAULT_CALENDAR = { goals: [], entries: {}, selectedGoalId: null };

// Old anonymous ids (pre-auth) still referenced by /claim below.
function isSafeAnonymousCalendarId(id) {
  return typeof id === 'string' && /^cal-[a-f0-9]{20}$/.test(id);
}

function calendarPath(userId) {
  return path.join(CALENDARS_DIR, `${userId}.json`);
}
function anonymousCalendarPath(anonymousId) {
  return path.join(CALENDARS_DIR, `${anonymousId}.json`);
}

function loadCalendar(userId) {
  const filePath = calendarPath(userId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCalendar(userId, calendar) {
  fs.mkdirSync(CALENDARS_DIR, { recursive: true });
  fs.writeFileSync(calendarPath(userId), JSON.stringify(calendar, null, 2) + '\n');
}

function isBlankCalendar(calendar) {
  return (!calendar.goals || calendar.goals.length === 0) && (!calendar.entries || Object.keys(calendar.entries).length === 0);
}

router.get('/me', (req, res) => {
  try {
    let calendar = loadCalendar(req.user.id);
    if (!calendar) {
      const now = new Date().toISOString();
      calendar = Object.assign({ id: req.user.id, userId: req.user.id }, DEFAULT_CALENDAR, { createdAt: now, updatedAt: now });
      saveCalendar(req.user.id, calendar);
    }
    res.json(calendar);
  } catch (e) {
    console.error('GET /api/calendars/me failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't read your calendar: ${e.message}`] });
  }
});

// Full-state autosave — the frontend PUTs the whole calendar after every
// change (goal added/renamed/removed, day toggled).
router.put('/me', (req, res) => {
  let existing;
  try {
    existing = loadCalendar(req.user.id);
  } catch (e) {
    console.error('PUT /api/calendars/me failed reading existing calendar:', e);
    return res.status(500).json({ success: false, errors: [`Server couldn't read your calendar: ${e.message}`] });
  }
  const base = existing || Object.assign({ id: req.user.id, userId: req.user.id }, DEFAULT_CALENDAR, { createdAt: new Date().toISOString() });

  const body = req.body || {};
  const payload = {
    goals: Array.isArray(body.goals) ? body.goals : base.goals,
    entries: body.entries && typeof body.entries === 'object' ? body.entries : base.entries,
    selectedGoalId: body.selectedGoalId !== undefined ? body.selectedGoalId : base.selectedGoalId,
  };

  const { valid, errors } = validateCalendar(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const updated = Object.assign({}, base, payload, { updatedAt: new Date().toISOString() });

  try {
    saveCalendar(req.user.id, updated);
    res.json(updated);
  } catch (e) {
    console.error('PUT /api/calendars/me failed saving:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't save your calendar: ${e.message}`] });
  }
});

// Attaches an old pre-login anonymous calendar (found in this browser's
// localStorage) to the now-logged-in user, but only if they don't already
// have real saved content — no merge logic in this simple version.
router.post('/claim', (req, res) => {
  const { anonymousId } = req.body || {};
  if (!isSafeAnonymousCalendarId(anonymousId)) {
    return res.status(400).json({ success: false, errors: ['Invalid or missing anonymousId.'] });
  }

  let current;
  try {
    current = loadCalendar(req.user.id);
  } catch (e) {
    return res.status(500).json({ success: false, errors: [`Server couldn't read your calendar: ${e.message}`] });
  }
  if (current && !isBlankCalendar(current)) {
    return res.status(409).json({ success: false, errors: ['You already have saved progress on this account — this older guest data was not merged.'] });
  }

  const anonPath = anonymousCalendarPath(anonymousId);
  if (!fs.existsSync(anonPath)) {
    return res.status(404).json({ success: false, errors: ['No guest calendar found for that id.'] });
  }

  try {
    const anonymous = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
    const now = new Date().toISOString();
    const claimed = Object.assign({}, current, {
      id: req.user.id, userId: req.user.id,
      goals: anonymous.goals || [], entries: anonymous.entries || {}, selectedGoalId: anonymous.selectedGoalId || null,
      createdAt: (current && current.createdAt) || now, updatedAt: now,
    });
    saveCalendar(req.user.id, claimed);
    fs.unlinkSync(anonPath);
    res.json(claimed);
  } catch (e) {
    console.error('POST /api/calendars/claim failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't claim that calendar: ${e.message}`] });
  }
});

module.exports = router;
