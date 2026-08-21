'use strict';

// Builds the Express app: API routes + static site. Exported (not started
// here) so both index.js and the test suite can use it.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { attachUser, requireAuth } = require('./middleware/auth');

const BASE_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');
const EXAMS_DIR = path.join(PUBLIC_DIR, 'tools', 'Exam', 'exams');

fs.mkdirSync(EXAMS_DIR, { recursive: true });

const app = express();
app.use(express.json());
// express.json() throws a SyntaxError (not a normal request error) on
// malformed JSON bodies — without this it'd bubble up as a generic 500.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Request body is not valid JSON.' });
  }
  next(err);
});

// Resolves the session cookie (if any) into req.user for every route below
// — null when logged out. Routes that need to *require* a login apply
// requireAuth themselves (either at the router level, or per-route where a
// router mixes public and login-required endpoints, like exams below).
app.use(attachUser);

app.use('/api/auth', require('./routes/auth'));

// Public reference data (tax brackets, cost-of-living index) — used by the
// Finance tools' calculators, not per-user, so never gated behind login.
app.use('/api/states', require('./routes/states'));
app.use('/api/federal', require('./routes/federal'));
app.use('/api/tax-estimate', require('./routes/tax'));

// exams.js applies requireAuth itself, per-route: browsing/taking exams
// (including someone else's bundled ones) stays open, only uploading/
// deleting requires login.
app.use('/api/exams', require('./routes/exams'));

// Per-user data — every route here requires login (no login, no server
// round-trip at all; the frontend runs on a local-only default instead).
app.use('/api/calendars', requireAuth, require('./routes/calendars'));
app.use('/api/math-facts-profiles', requireAuth, require('./routes/mathFacts'));

// Static site — everything under public/ (index.html, global.css, nav.js,
// tools/**, etc.). Scoped to public/ specifically, not the whole repo root,
// so server/, test/, deploy/, package.json etc. are never reachable over
// HTTP regardless of what gets added to them later.
app.use(express.static(PUBLIC_DIR));

module.exports = app;
