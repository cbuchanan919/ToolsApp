'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateCalendar } = require('../lib/calendarValidation');

const router = express.Router();

// Runtime data (one JSON file per calendar), not source — gitignored. Lives
// under server/ rather than public/ so it's only ever reachable through this
// API, never as a directly-fetchable static file the way exams/ is.
const CALENDARS_DIR = path.join(__dirname, '..', 'data', 'calendars');

// Generated ids are always `cal-<20 hex chars>`; rejecting anything else
// outright also rules out path traversal before it reaches the filesystem.
function isSafeCalendarId(id) {
  return typeof id === 'string' && /^cal-[a-f0-9]{20}$/.test(id);
}

function calendarPath(id) {
  return path.join(CALENDARS_DIR, `${id}.json`);
}

function loadCalendar(id) {
  const filePath = calendarPath(id);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveCalendar(calendar) {
  fs.mkdirSync(CALENDARS_DIR, { recursive: true });
  fs.writeFileSync(calendarPath(calendar.id), JSON.stringify(calendar, null, 2) + '\n');
}

function listCalendars() {
  if (!fs.existsSync(CALENDARS_DIR)) return [];
  return fs.readdirSync(CALENDARS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CALENDARS_DIR, f), 'utf8')))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

// GET / — every calendar on the server. No user scoping yet (userId is
// always null today, set aside for exactly this); an eventual `?userId=`
// filter just needs to narrow this same list once real auth exists.
router.get('/', (req, res) => {
  res.json(listCalendars());
});

router.get('/:id', (req, res) => {
  if (!isSafeCalendarId(req.params.id)) {
    return res.status(400).json({ success: false, errors: ['Invalid calendar id.'] });
  }
  const calendar = loadCalendar(req.params.id);
  if (!calendar) return res.status(404).json({ success: false, errors: ['No such calendar.'] });
  res.json(calendar);
});

// Creates a new calendar. Body may seed initial goals/entries/selectedGoalId
// (all optional — an empty POST creates a blank calendar), used once per
// browser the first time this tool loads with no calendar id saved locally.
router.post('/', (req, res) => {
  const body = req.body || {};
  const payload = {
    goals: Array.isArray(body.goals) ? body.goals : [],
    entries: body.entries && typeof body.entries === 'object' ? body.entries : {},
    selectedGoalId: body.selectedGoalId !== undefined ? body.selectedGoalId : null,
  };

  const { valid, errors } = validateCalendar(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const now = new Date().toISOString();
  const calendar = Object.assign(
    { id: 'cal-' + crypto.randomBytes(10).toString('hex'), userId: null },
    payload,
    { createdAt: now, updatedAt: now }
  );

  try {
    saveCalendar(calendar);
    res.json(calendar);
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't save the calendar: ${e.message}`] });
  }
});

// Full-state autosave — the frontend PUTs the whole calendar after every
// change (goal added/renamed/removed, day toggled), same as the localStorage
// write it replaces. Any field omitted from the body keeps its stored value.
router.put('/:id', (req, res) => {
  if (!isSafeCalendarId(req.params.id)) {
    return res.status(400).json({ success: false, errors: ['Invalid calendar id.'] });
  }
  const existing = loadCalendar(req.params.id);
  if (!existing) return res.status(404).json({ success: false, errors: ['No such calendar.'] });

  const body = req.body || {};
  const payload = {
    goals: Array.isArray(body.goals) ? body.goals : existing.goals,
    entries: body.entries && typeof body.entries === 'object' ? body.entries : existing.entries,
    selectedGoalId: body.selectedGoalId !== undefined ? body.selectedGoalId : existing.selectedGoalId,
  };

  const { valid, errors } = validateCalendar(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const updated = Object.assign({}, existing, payload, { updatedAt: new Date().toISOString() });

  try {
    saveCalendar(updated);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't save the calendar: ${e.message}`] });
  }
});

module.exports = router;
