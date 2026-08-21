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

// Calendars this file creates via the API get their real generated ids
// (unknown ahead of time), so track them here and delete the underlying
// files directly — there's no DELETE /api/calendars/:id route to use.
const CALENDARS_DIR = path.join(__dirname, '..', 'server', 'data', 'calendars');
const createdTestCalendarIds = [];

function cleanupTestCalendars() {
  for (const id of createdTestCalendarIds) {
    try { fs.unlinkSync(path.join(CALENDARS_DIR, `${id}.json`)); } catch (e) { /* wasn't there */ }
  }
  createdTestCalendarIds.length = 0;
}

// Same pattern as calendars above — no DELETE route, so clean up the
// generated-id files directly.
const MATH_FACTS_PROFILES_DIR = path.join(__dirname, '..', 'server', 'data', 'mathFactsProfiles');
const createdTestProfileIds = [];

function cleanupTestMathFactsProfiles() {
  for (const id of createdTestProfileIds) {
    try { fs.unlinkSync(path.join(MATH_FACTS_PROFILES_DIR, `${id}.json`)); } catch (e) { /* wasn't there */ }
  }
  createdTestProfileIds.length = 0;
}

let server, baseUrl;

test.before(() => {
  cleanupTestExam(); // in case a previous failed run left residue
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => {
  cleanupTestExam();
  cleanupTestCalendars();
  cleanupTestMathFactsProfiles();
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

test('POST /api/calendars, GET /api/calendars/:id, PUT /api/calendars/:id', async (t) => {
  await t.test('creating with no body produces an empty, valid calendar', async () => {
    const res = await fetch(`${baseUrl}/api/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 200);
    const calendar = await res.json();
    createdTestCalendarIds.push(calendar.id);
    assert.match(calendar.id, /^cal-[a-f0-9]{20}$/);
    assert.equal(calendar.userId, null);
    assert.deepEqual(calendar.goals, []);
    assert.deepEqual(calendar.entries, {});
    assert.ok(calendar.createdAt);
    assert.equal(calendar.createdAt, calendar.updatedAt);
  });

  await t.test('creating with a schema-invalid body is rejected with a 400', async () => {
    const res = await fetch(`${baseUrl}/api/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ id: 'x', name: 'X', color: 'not-a-color' }] })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  await t.test('a full create/fetch/update/fetch round trip persists goals and entries', async () => {
    const createRes = await fetch(`${baseUrl}/api/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goals: [{ id: 'spanish', name: 'Spanish', color: '#e8a94c' }],
        selectedGoalId: 'spanish'
      })
    });
    const created = await createRes.json();
    createdTestCalendarIds.push(created.id);

    const fetchRes = await fetch(`${baseUrl}/api/calendars/${created.id}`);
    assert.equal(fetchRes.status, 200);
    const fetched = await fetchRes.json();
    assert.equal(fetched.goals[0].name, 'Spanish');

    const putRes = await fetch(`${baseUrl}/api/calendars/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: { spanish: { '2026-08-01': true } } })
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.deepEqual(updated.entries, { spanish: { '2026-08-01': true } });
    // Fields omitted from the PUT body (goals, selectedGoalId) keep their
    // previously stored value rather than being wiped out.
    assert.equal(updated.goals[0].name, 'Spanish');
    assert.equal(updated.selectedGoalId, 'spanish');
    assert.notEqual(updated.updatedAt, created.updatedAt);

    const refetchRes = await fetch(`${baseUrl}/api/calendars/${created.id}`);
    const refetched = await refetchRes.json();
    assert.deepEqual(refetched.entries, { spanish: { '2026-08-01': true } });
  });

  await t.test('GET on an unknown (but well-formed) id is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/calendars/cal-00000000000000000000`);
    assert.equal(res.status, 404);
  });

  await t.test('a malformed id is rejected with a 400, not treated as a path', async () => {
    const res = await fetch(`${baseUrl}/api/calendars/${encodeURIComponent('../../server/index')}`);
    assert.equal(res.status, 400);
  });

  await t.test('PUT to an unknown id is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/calendars/cal-00000000000000000000`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: {} })
    });
    assert.equal(res.status, 404);
  });
});

test('GET /api/calendars', async (t) => {
  await t.test('lists every calendar on the server, including ones just created', async () => {
    const createRes = await fetch(`${baseUrl}/api/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const created = await createRes.json();
    createdTestCalendarIds.push(created.id);

    const listRes = await fetch(`${baseUrl}/api/calendars`);
    assert.equal(listRes.status, 200);
    const all = await listRes.json();
    assert.ok(Array.isArray(all));
    assert.ok(all.some((c) => c.id === created.id));
  });
});

test('POST /api/math-facts-profiles, GET /api/math-facts-profiles/:id, PUT /api/math-facts-profiles/:id', async (t) => {
  await t.test('creating with no body produces a blank, valid profile', async () => {
    const res = await fetch(`${baseUrl}/api/math-facts-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 200);
    const profile = await res.json();
    createdTestProfileIds.push(profile.id);
    assert.match(profile.id, /^mf-[a-f0-9]{20}$/);
    assert.equal(profile.userId, null);
    assert.equal(profile.totalPoints, 0);
    assert.deepEqual(profile.badges, []);
    assert.deepEqual(profile.factStats, {});
    assert.ok(profile.createdAt);
    assert.equal(profile.createdAt, profile.updatedAt);
  });

  await t.test('creating with a schema-invalid body is rejected with a 400', async () => {
    const res = await fetch(`${baseUrl}/api/math-facts-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalPoints: -50 })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  await t.test('a full create/fetch/update/fetch round trip persists points, streak, and fact stats', async () => {
    const createRes = await fetch(`${baseUrl}/api/math-facts-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const created = await createRes.json();
    createdTestProfileIds.push(created.id);

    const fetchRes = await fetch(`${baseUrl}/api/math-facts-profiles/${created.id}`);
    assert.equal(fetchRes.status, 200);
    const fetched = await fetchRes.json();
    assert.equal(fetched.totalPoints, 0);

    const putRes = await fetch(`${baseUrl}/api/math-facts-profiles/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalPoints: 150,
        streak: { current: 1, longest: 1, lastPracticeDate: '2026-08-21' },
        factStats: { 'add:3+4': { attempts: 3, correct: 3, totalTimeMs: 4500, avgTimeMs: 1500, lastPracticedAt: '2026-08-21T00:00:00.000Z' } }
      })
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.equal(updated.totalPoints, 150);
    assert.equal(updated.streak.current, 1);
    assert.deepEqual(updated.factStats['add:3+4'].attempts, 3);
    // Fields omitted from the PUT body (badges, sessionHistory) keep their
    // previously stored value rather than being wiped out.
    assert.deepEqual(updated.badges, []);
    assert.notEqual(updated.updatedAt, created.updatedAt);

    const refetchRes = await fetch(`${baseUrl}/api/math-facts-profiles/${created.id}`);
    const refetched = await refetchRes.json();
    assert.equal(refetched.totalPoints, 150);
  });

  await t.test('GET on an unknown (but well-formed) id is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/mf-00000000000000000000`);
    assert.equal(res.status, 404);
  });

  await t.test('a malformed id is rejected with a 400, not treated as a path', async () => {
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/${encodeURIComponent('../../server/index')}`);
    assert.equal(res.status, 400);
  });

  await t.test('PUT to an unknown id is a 404', async () => {
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/mf-00000000000000000000`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalPoints: 10 })
    });
    assert.equal(res.status, 404);
  });
});
