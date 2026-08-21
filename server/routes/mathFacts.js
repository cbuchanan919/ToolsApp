'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateProfile } = require('../lib/mathFactsValidation');

const router = express.Router();

// Runtime data (one JSON file per profile), not source — gitignored. Lives
// under server/ rather than public/ so it's only ever reachable through
// this API, same as calendars/.
const PROFILES_DIR = path.join(__dirname, '..', 'data', 'mathFactsProfiles');

// Generated ids are always `mf-<20 hex chars>`; rejecting anything else
// outright also rules out path traversal before it reaches the filesystem.
function isSafeProfileId(id) {
  return typeof id === 'string' && /^mf-[a-f0-9]{20}$/.test(id);
}

function profilePath(id) {
  return path.join(PROFILES_DIR, `${id}.json`);
}

function loadProfile(id) {
  const filePath = profilePath(id);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveProfile(profile) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.writeFileSync(profilePath(profile.id), JSON.stringify(profile, null, 2) + '\n');
}

router.get('/:id', (req, res) => {
  if (!isSafeProfileId(req.params.id)) {
    return res.status(400).json({ success: false, errors: ['Invalid profile id.'] });
  }
  try {
    const profile = loadProfile(req.params.id);
    if (!profile) return res.status(404).json({ success: false, errors: ['No such profile.'] });
    res.json(profile);
  } catch (e) {
    console.error(`GET /api/math-facts-profiles/${req.params.id} failed:`, e);
    res.status(500).json({ success: false, errors: [`Server couldn't read the profile: ${e.message}`] });
  }
});

// Creates a new profile. Body may seed initial totalPoints/streak/badges/
// factStats/sessionHistory (all optional — an empty POST creates a blank
// profile), used once per browser the first time this tool loads with no
// profile id saved locally.
router.post('/', (req, res) => {
  const body = req.body || {};
  const payload = {
    totalPoints: typeof body.totalPoints === 'number' ? body.totalPoints : 0,
    streak: body.streak && typeof body.streak === 'object' ? body.streak : { current: 0, longest: 0, lastPracticeDate: null },
    badges: Array.isArray(body.badges) ? body.badges : [],
    factStats: body.factStats && typeof body.factStats === 'object' ? body.factStats : {},
    sessionHistory: Array.isArray(body.sessionHistory) ? body.sessionHistory : [],
  };

  const { valid, errors } = validateProfile(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const now = new Date().toISOString();
  const profile = Object.assign(
    { id: 'mf-' + crypto.randomBytes(10).toString('hex'), userId: null },
    payload,
    { createdAt: now, updatedAt: now }
  );

  try {
    saveProfile(profile);
    res.json(profile);
  } catch (e) {
    console.error('POST /api/math-facts-profiles failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't save the profile: ${e.message}`] });
  }
});

// Full-state autosave — the frontend PUTs the whole profile after every
// session completes. Any field omitted from the body keeps its stored value.
router.put('/:id', (req, res) => {
  if (!isSafeProfileId(req.params.id)) {
    return res.status(400).json({ success: false, errors: ['Invalid profile id.'] });
  }

  let existing;
  try {
    existing = loadProfile(req.params.id);
  } catch (e) {
    console.error(`PUT /api/math-facts-profiles/${req.params.id} failed reading existing profile:`, e);
    return res.status(500).json({ success: false, errors: [`Server couldn't read the profile: ${e.message}`] });
  }
  if (!existing) return res.status(404).json({ success: false, errors: ['No such profile.'] });

  const body = req.body || {};
  const payload = {
    totalPoints: typeof body.totalPoints === 'number' ? body.totalPoints : existing.totalPoints,
    streak: body.streak && typeof body.streak === 'object' ? body.streak : existing.streak,
    badges: Array.isArray(body.badges) ? body.badges : existing.badges,
    factStats: body.factStats && typeof body.factStats === 'object' ? body.factStats : existing.factStats,
    sessionHistory: Array.isArray(body.sessionHistory) ? body.sessionHistory : existing.sessionHistory,
  };

  const { valid, errors } = validateProfile(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const updated = Object.assign({}, existing, payload, { updatedAt: new Date().toISOString() });

  try {
    saveProfile(updated);
    res.json(updated);
  } catch (e) {
    console.error(`PUT /api/math-facts-profiles/${req.params.id} failed saving:`, e);
    res.status(500).json({ success: false, errors: [`Server couldn't save the profile: ${e.message}`] });
  }
});

module.exports = router;
