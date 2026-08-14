'use strict';

// HTTP-level tests against the real Express app, started on an ephemeral
// port below — covers every API route including a full exam upload/delete
// round trip against the real exams directory (with cleanup).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server/app');

// A distinctive name so this test's own upload/delete round trip can never
// collide with real exam content, and is easy to spot as test residue if a
// failure ever leaves it behind despite the cleanup below.
const TEST_EXAM_FILE = 'automated-test-exam.json';
const EXAMS_DIR = path.join(__dirname, '..', 'public', 'tools', 'Exam', 'exams');
const MANIFEST_PATH = path.join(EXAMS_DIR, 'manifest.json');

function cleanupTestExam() {
  try { fs.unlinkSync(path.join(EXAMS_DIR, TEST_EXAM_FILE)); } catch (e) { /* wasn't there */ }
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const before = manifest.exams.length;
    manifest.exams = manifest.exams.filter((e) => e.file !== TEST_EXAM_FILE);
    if (manifest.exams.length !== before) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    }
  } catch (e) { /* manifest missing/unreadable — nothing to clean */ }
}

let server, baseUrl;

test.before(() => {
  cleanupTestExam(); // in case a previous failed run left residue
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => {
  cleanupTestExam();
  server.close();
});

test('GET /api/states', async (t) => {
  await t.test('returns the full state dataset with cost-of-living index', async () => {
    const res = await fetch(`${baseUrl}/api/states`);
    assert.equal(res.status, 200);
    const states = await res.json();
    assert.equal(states.NJ.name, 'New Jersey');
    assert.equal(states.NJ.col, 115.1);
    assert.ok(Object.keys(states).length >= 50);
  });
});

test('GET /api/federal', async (t) => {
  await t.test('returns federal brackets, deductions, and FICA constants', async () => {
    const res = await fetch(`${baseUrl}/api/federal`);
    assert.equal(res.status, 200);
    const federal = await res.json();
    assert.equal(federal.stdDed.single, 16100);
    assert.equal(federal.fica.ssRate, 0.062);
  });
});

test('POST /api/tax-estimate', async (t) => {
  await t.test('matches the hand-verified NJ figure at the median household income', async () => {
    const res = await fetch(`${baseUrl}/api/tax-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income: 80610, state: 'NJ' })
    });
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.ok(Math.abs(result.totalTax - 18017.522) < 0.01);
  });

  await t.test('rejects a missing income with 400, not a crash', async () => {
    const res = await fetch(`${baseUrl}/api/tax-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'NJ' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('rejects a negative income', async () => {
    const res = await fetch(`${baseUrl}/api/tax-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income: -100 })
    });
    assert.equal(res.status, 400);
  });

  await t.test('rejects an invalid filingStatus', async () => {
    const res = await fetch(`${baseUrl}/api/tax-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income: 50000, filingStatus: 'nonsense' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('rejects malformed JSON with a 400, not a 500', async () => {
    const res = await fetch(`${baseUrl}/api/tax-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json'
    });
    assert.equal(res.status, 400);
  });
});

test('POST /api/exams and DELETE /api/exams/:filename', async (t) => {
  await t.test('rejects a schema-invalid exam with a 400 and an errors array', async () => {
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam: { examTitle: 'Missing questions' } })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  await t.test('a path-traversal delete attempt is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${encodeURIComponent('../../server/index.js')}`, {
      method: 'DELETE'
    });
    assert.equal(res.status, 400);
  });

  await t.test('deleting a non-uploaded (bundled) exam is forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/exams/az900-practice-exam.json`, { method: 'DELETE' });
    assert.equal(res.status, 403);
  });

  await t.test('deleting a file not present in the manifest is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/exams/does-not-exist-anywhere.json`, { method: 'DELETE' });
    assert.equal(res.status, 404);
  });

  await t.test('a valid upload succeeds, is listed in the manifest, and can then be deleted', async () => {
    const uploadRes = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'automated-test-exam',
        exam: {
          examTitle: 'Automated Test Exam',
          questions: [{
            id: 1,
            domain: 'Test',
            type: 'single',
            question: '2+2?',
            options: [{ letter: 'A', text: '3' }, { letter: 'B', text: '4' }],
            correctAnswers: ['B']
          }]
        }
      })
    });
    assert.equal(uploadRes.status, 200);
    const uploadBody = await uploadRes.json();
    assert.equal(uploadBody.success, true);
    assert.equal(uploadBody.file, TEST_EXAM_FILE);
    assert.ok(fs.existsSync(path.join(EXAMS_DIR, TEST_EXAM_FILE)));

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    assert.ok(manifest.exams.some((e) => e.file === TEST_EXAM_FILE && e.uploaded === true));

    const deleteRes = await fetch(`${baseUrl}/api/exams/${TEST_EXAM_FILE}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);
    assert.ok(!fs.existsSync(path.join(EXAMS_DIR, TEST_EXAM_FILE)));

    const manifestAfter = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    assert.ok(!manifestAfter.exams.some((e) => e.file === TEST_EXAM_FILE));
  });
});
