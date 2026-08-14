'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { validateExamSchema, slugify } = require('../lib/examValidation');

const router = express.Router();

// Upload (POST) and remove (DELETE) exam banks — the only routes that write
// to disk. Bundled exams (no "uploaded" flag in the manifest) can never be
// deleted through this API, only ones this route itself created.
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const EXAMS_DIR = path.join(PUBLIC_DIR, 'tools', 'Exam', 'exams');
const MANIFEST_PATH = path.join(EXAMS_DIR, 'manifest.json');

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { exams: [] };
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

// Appends -2, -3, ... if the slugified name already exists, so two uploads
// with the same title don't clobber each other.
function uniqueFilename(desiredStem) {
  let candidate = desiredStem + '.json';
  let n = 1;
  while (fs.existsSync(path.join(EXAMS_DIR, candidate))) {
    n += 1;
    candidate = `${desiredStem}-${n}.json`;
  }
  return candidate;
}

// Must be a bare filename (no path separators / traversal) ending in .json,
// and must resolve to a real path inside EXAMS_DIR.
function isSafeExamFilename(filename) {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    return false;
  }
  if (!filename.endsWith('.json')) return false;
  const resolved = path.resolve(EXAMS_DIR, filename);
  return resolved.startsWith(path.resolve(EXAMS_DIR) + path.sep);
}

router.post('/', (req, res) => {
  const { exam, fileName: requestedName } = req.body || {};

  const { valid, errors } = validateExamSchema(exam);
  if (!valid) {
    return res.status(400).json({ success: false, errors });
  }

  fs.mkdirSync(EXAMS_DIR, { recursive: true });

  const stem = requestedName
    ? slugify(path.basename(requestedName, path.extname(requestedName)))
    : slugify(exam.examTitle);
  const filename = uniqueFilename(stem);

  try {
    fs.writeFileSync(path.join(EXAMS_DIR, filename), JSON.stringify(exam, null, 2) + '\n');

    const manifest = loadManifest();
    manifest.exams = manifest.exams || [];
    const label = (exam.examTitle || filename) + ' (uploaded)';
    manifest.exams.push({ file: filename, label, uploaded: true });
    saveManifest(manifest);

    res.json({ success: true, file: filename, label });
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't save the file: ${e.message}`] });
  }
});

router.delete('/:filename', (req, res) => {
  const filename = req.params.filename;

  if (!isSafeExamFilename(filename)) {
    return res.status(400).json({ success: false, errors: ['Invalid filename.'] });
  }

  const manifest = loadManifest();
  const entries = manifest.exams || [];
  const match = entries.find((e) => e.file === filename);

  if (!match) {
    return res.status(404).json({ success: false, errors: ['No such exam in manifest.'] });
  }
  if (!match.uploaded) {
    return res.status(403).json({ success: false, errors: ['Only uploaded exams can be removed this way.'] });
  }

  try {
    manifest.exams = entries.filter((e) => e.file !== filename);
    saveManifest(manifest);
    const filePath = path.join(EXAMS_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, errors: [`Server couldn't remove the file: ${e.message}`] });
  }
});

module.exports = router;
