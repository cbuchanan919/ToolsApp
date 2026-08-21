'use strict';

// Builds the Express app: API routes + static site. Exported (not started
// here) so both index.js and the test suite can use it.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('./middleware/auth');

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

app.use('/api/exams', requireAuth, require('./routes/exams'));
app.use('/api/states', requireAuth, require('./routes/states'));
app.use('/api/federal', requireAuth, require('./routes/federal'));
app.use('/api/tax-estimate', requireAuth, require('./routes/tax'));
app.use('/api/calendars', requireAuth, require('./routes/calendars'));
app.use('/api/math-facts-profiles', requireAuth, require('./routes/mathFacts'));

// Static site — everything under public/ (index.html, global.css, nav.js,
// tools/**, etc.). Scoped to public/ specifically, not the whole repo root,
// so server/, test/, deploy/, package.json etc. are never reachable over
// HTTP regardless of what gets added to them later.
app.use(express.static(PUBLIC_DIR));

module.exports = app;
