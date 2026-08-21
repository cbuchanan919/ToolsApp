'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateExamSchema, slugify } = require('../lib/examValidation');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Bundled/shared exams — statically served, public, unauthenticated. This
// manifest now lists ONLY that shared content; per-user uploads used to
// live here too (flagged "uploaded":true) but have moved to UPLOADS_DIR
// below so they're never reachable by anyone but their owner.
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const EXAMS_DIR = path.join(PUBLIC_DIR, 'tools', 'Exam', 'exams');
const MANIFEST_PATH = path.join(EXAMS_DIR, 'manifest.json');

// Runtime data, not source — gitignored, same reasoning as
// server/data/calendars/. One subdirectory per user.
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'examUploads');

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { exams: [] };
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function userUploadsDir(userId) {
  return path.join(UPLOADS_DIR, userId);
}

// Must be a bare filename (no path separators / traversal) ending in
// .json, and must resolve to a real path inside the given directory.
function isSafeExamFilename(filename, dir) {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    return false;
  }
  if (!filename.endsWith('.json')) return false;
  const resolved = path.resolve(dir, filename);
  return resolved.startsWith(path.resolve(dir) + path.sep);
}

function uniqueFilename(dir, desiredStem) {
  let candidate = desiredStem + '.json';
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    n += 1;
    candidate = `${desiredStem}-${n}.json`;
  }
  return candidate;
}

function listUserUploads(userId) {
  const dir = userUploadsDir(userId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const exam = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { file: f, label: (exam.examTitle || f) + ' (uploaded)', source: 'mine' };
    });
}

// Merged list the frontend uses to build its exam picker — bundled exams
// (always) plus this caller's own uploads (only if logged in). Left open
// (no requireAuth) so browsing/taking exams works without login; it's only
// upload/delete below that require it.
router.get('/', (req, res) => {
  try {
    const manifest = loadManifest();
    const bundled = (manifest.exams || []).map((e) => Object.assign({}, e, { source: 'bundled' }));
    const mine = req.user ? listUserUploads(req.user.id) : [];
    res.json({ exams: bundled.concat(mine) });
  } catch (e) {
    console.error('GET /api/exams failed:', e);
    res.status(500).json({ success: false, errors: [`Server couldn't list exams: ${e.message}`] });
  }
});

// Serves an uploaded exam's content — directory-scoped to req.user.id (the
// session-resolved user, never a client-supplied one), so there's no way
// to fetch another user's upload by guessing their id or filename.
router.get('/mine/:filename', requireAuth, (req, res) => {
  const dir = userUploadsDir(req.user.id);
  if (!isSafeExamFilename(req.params.filename, dir)) {
    return res.status(400).json({ success: false, errors: ['Invalid filename.'] });
  }
  const filePath = path.join(dir, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, errors: ['No such exam.'] });
  }
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (e) {
    console.error(`GET /api/exams/mine/${req.params.filename} failed:`, e);
    res.status(500).json({ success: false, errors: [`Server couldn't read that exam: ${e.message}`] });
  }
});

router.post('/', requireAuth, (req, res) => {
  const { exam, fileName: requestedName } = req.body || {};

  const { valid, errors } = validateExamSchema(exam);
  if (!valid) {
    return res.status(400).json({ success: false, errors });
  }

  const dir = userUploadsDir(req.user.id);
  fs.mkdirSync(dir, { recursive: true });

  const stem = requestedName
    ? slugify(path.basename(requestedName, path.extname(requestedName)))
    : slugify(exam.examTitle);
  const filename = uniqueFilename(dir, stem);

  try {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(exam, null, 2) + '\n');
    res.json({ success: true, file: filename, label: (exam.examTitle || filename) + ' (uploaded)' });
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't save the file: ${e.message}`] });
  }
});

// Ownership is implicit in the path (a user's own directory) — no more
// manifest "uploaded":true bookkeeping needed to tell an upload apart from
// bundled content.
router.delete('/:filename', requireAuth, (req, res) => {
  const dir = userUploadsDir(req.user.id);
  const filename = req.params.filename;

  if (!isSafeExamFilename(filename, dir)) {
    return res.status(400).json({ success: false, errors: ['Invalid filename.'] });
  }

  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, errors: ['No such exam.'] });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't remove the file: ${e.message}`] });
  }
});

module.exports = router;
