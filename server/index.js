'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('./middleware/auth');

const BASE_DIR = path.join(__dirname, '..');
const EXAMS_DIR = path.join(BASE_DIR, 'tools', 'Exam', 'exams');
// Positional CLI arg takes priority (matches the old `python serve.py 8080`
// convention), then $PORT (what the systemd unit sets), then a default.
const PORT = process.argv[2] || process.env.PORT || 8000;

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

// Static site — everything under BASE_DIR that isn't one of the API routes
// above (index.html, global.css, nav.js, tools/**, etc.), same as serve.py's
// directory=BASE_DIR behavior.
app.use(express.static(BASE_DIR));

app.listen(PORT, () => {
  console.log(`ToolsApp running at http://localhost:${PORT}`);
});
