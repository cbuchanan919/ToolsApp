'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateProfile } = require('../lib/mathFactsValidation');

const router = express.Router();

// Runtime data (one JSON file per profile), not source — gitignored. Lives
// under server/ rather than public/ so it's only ever reachable through
// this API.
const PROFILES_DIR = path.join(__dirname, '..', 'data', 'mathFactsProfiles');

// One profile per user now (mounted behind requireAuth in app.js, so
// req.user is always set here) — filename is just the already-safe
// generated user id, no separate mf- id scheme needed.
const DEFAULT_PROFILE = { totalPoints: 0, streak: { current: 0, longest: 0, lastPracticeDate: null }, badges: [], factStats: {}, sessionHistory: [] };

// Old anonymous ids (pre-auth) still referenced by /claim below.
function isSafeAnonymousProfileId(id) {
  return typeof id === 'string' && /^mf-[a-f0-9]{20}$/.test(id);
}

function profilePath(userId) {
  return path.join(PROFILES_DIR, `${userId}.json`);
}
function anonymousProfilePath(anonymousId) {
  return path.join(PROFILES_DIR, `${anonymousId}.json`);
}

function loadProfile(userId) {
  const filePath = profilePath(userId);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveProfile(userId, profile) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.writeFileSync(profilePath(userId), JSON.stringify(profile, null, 2) + '\n');
}

function isBlankProfile(profile) {
  return (!profile.totalPoints || profile.totalPoints === 0) && (!profile.factStats || Object.keys(profile.factStats).length === 0);
}

router.get('/me', (req, res) => {
  try {
    let profile = loadProfile(req.user.id);
    if (!profile) {
      const now = new Date().toISOString();
      profile = Object.assign({ id: req.user.id, userId: req.user.id }, DEFAULT_PROFILE, { createdAt: now, updatedAt: now });
      saveProfile(req.user.id, profile);
    }
    res.json(profile);
  } catch (e) {
    console.error('GET /api/math-facts-profiles/me failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't read your profile: ${e.message}`] });
  }
});

// Full-state autosave — the frontend PUTs the whole profile once a
// practice session completes.
router.put('/me', (req, res) => {
  let existing;
  try {
    existing = loadProfile(req.user.id);
  } catch (e) {
    console.error('PUT /api/math-facts-profiles/me failed reading existing profile:', e);
    return res.status(500).json({ success: false, errors: [`Server couldn't read your profile: ${e.message}`] });
  }
  const base = existing || Object.assign({ id: req.user.id, userId: req.user.id }, DEFAULT_PROFILE, { createdAt: new Date().toISOString() });

  const body = req.body || {};
  const payload = {
    totalPoints: typeof body.totalPoints === 'number' ? body.totalPoints : base.totalPoints,
    streak: body.streak && typeof body.streak === 'object' ? body.streak : base.streak,
    badges: Array.isArray(body.badges) ? body.badges : base.badges,
    factStats: body.factStats && typeof body.factStats === 'object' ? body.factStats : base.factStats,
    sessionHistory: Array.isArray(body.sessionHistory) ? body.sessionHistory : base.sessionHistory,
  };

  const { valid, errors } = validateProfile(payload);
  if (!valid) return res.status(400).json({ success: false, errors });

  const updated = Object.assign({}, base, payload, { updatedAt: new Date().toISOString() });

  try {
    saveProfile(req.user.id, updated);
    res.json(updated);
  } catch (e) {
    console.error('PUT /api/math-facts-profiles/me failed saving:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't save your profile: ${e.message}`] });
  }
});

// Attaches an old pre-login anonymous profile (found in this browser's
// localStorage) to the now-logged-in user, but only if they don't already
// have real saved progress — no merge logic in this simple version.
router.post('/claim', (req, res) => {
  const { anonymousId } = req.body || {};
  if (!isSafeAnonymousProfileId(anonymousId)) {
    return res.status(400).json({ success: false, errors: ['Invalid or missing anonymousId.'] });
  }

  let current;
  try {
    current = loadProfile(req.user.id);
  } catch (e) {
    return res.status(500).json({ success: false, errors: [`Server couldn't read your profile: ${e.message}`] });
  }
  if (current && !isBlankProfile(current)) {
    return res.status(409).json({ success: false, errors: ['You already have saved progress on this account — this older guest data was not merged.'] });
  }

  const anonPath = anonymousProfilePath(anonymousId);
  if (!fs.existsSync(anonPath)) {
    return res.status(404).json({ success: false, errors: ['No guest profile found for that id.'] });
  }

  try {
    const anonymous = JSON.parse(fs.readFileSync(anonPath, 'utf8'));
    const now = new Date().toISOString();
    const claimed = Object.assign({}, current, {
      id: req.user.id, userId: req.user.id,
      totalPoints: anonymous.totalPoints || 0,
      streak: anonymous.streak || DEFAULT_PROFILE.streak,
      badges: anonymous.badges || [],
      factStats: anonymous.factStats || {},
      sessionHistory: anonymous.sessionHistory || [],
      createdAt: (current && current.createdAt) || now, updatedAt: now,
    });
    saveProfile(req.user.id, claimed);
    fs.unlinkSync(anonPath);
    res.json(claimed);
  } catch (e) {
    console.error('POST /api/math-facts-profiles/claim failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't claim that profile: ${e.message}`] });
  }
});

module.exports = router;
