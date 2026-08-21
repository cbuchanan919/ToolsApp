'use strict';

// HTTP-level tests against the real Express app, started on an ephemeral
// port below — covers every API route including a full exam upload/delete
// round trip against the real exams directory, and the full auth flow
// (signup/login/logout) with cleanup of every file it touches.
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

const CALENDARS_DIR = path.join(__dirname, '..', 'server', 'data', 'calendars');
const MATH_FACTS_PROFILES_DIR = path.join(__dirname, '..', 'server', 'data', 'mathFactsProfiles');
const EXAM_UPLOADS_DIR = path.join(__dirname, '..', 'server', 'data', 'examUploads');
const USERS_PATH = path.join(__dirname, '..', 'server', 'data', 'users.json');
const SESSIONS_PATH = path.join(__dirname, '..', 'server', 'data', 'sessions.json');

// Calendars/profiles/exam-upload dirs are now named by user id, so cleaning
// up every test account also cleans up everything it saved — one list to
// track instead of three.
const createdTestUserIds = [];
const createdTestEmails = [];
// Old-style pre-auth anonymous files this suite creates directly on disk
// to exercise the /claim endpoints.
const createdAnonymousFiles = [];

function cleanupTestUserData() {
  for (const userId of createdTestUserIds) {
    try { fs.unlinkSync(path.join(CALENDARS_DIR, `${userId}.json`)); } catch (e) { /* wasn't there */ }
    try { fs.unlinkSync(path.join(MATH_FACTS_PROFILES_DIR, `${userId}.json`)); } catch (e) { /* wasn't there */ }
    try { fs.rmSync(path.join(EXAM_UPLOADS_DIR, userId), { recursive: true, force: true }); } catch (e) { /* wasn't there */ }
  }
  createdTestUserIds.length = 0;
}

function cleanupAnonymousFiles() {
  for (const filePath of createdAnonymousFiles) {
    try { fs.unlinkSync(filePath); } catch (e) { /* wasn't there */ }
  }
  createdAnonymousFiles.length = 0;
}

function cleanupTestUsers() {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    let changed = false;
    for (const email of createdTestEmails) {
      if (users[email]) { delete users[email]; changed = true; }
    }
    if (changed) fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2) + '\n');
  } catch (e) { /* file missing — nothing to clean */ }
  createdTestEmails.length = 0;
}

function cleanupTestSessions() {
  try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    let changed = false;
    for (const token of Object.keys(sessions)) {
      if (createdTestUserIds.includes(sessions[token].userId)) { delete sessions[token]; changed = true; }
    }
    if (changed) fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2) + '\n');
  } catch (e) { /* file missing — nothing to clean */ }
}

let server, baseUrl;
let uniqueCounter = 0;

// Every call gets a distinctive email so parallel/repeated test runs never
// collide with an already-registered account.
function nextTestEmail() {
  uniqueCounter += 1;
  return `test-user-${Date.now()}-${uniqueCounter}@example.com`;
}

function cookieHeaderFrom(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

// Signs up a fresh, tracked-for-cleanup test account and returns
// { email, password, user, cookieHeader } — cookieHeader is ready to pass
// as a Cookie header on subsequent authenticated requests.
async function signupTestUser() {
  const email = nextTestEmail();
  const password = 'test-password-123';
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const user = await res.json();
  createdTestEmails.push(email);
  if (user && user.id) createdTestUserIds.push(user.id);
  return { email, password, user, cookieHeader: cookieHeaderFrom(res) };
}

test.before(() => {
  cleanupTestExam(); // in case a previous failed run left residue
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => {
  cleanupTestExam();
  // Sessions before user data — it reads createdTestUserIds, which
  // cleanupTestUserData() empties once it's done with it.
  cleanupTestSessions();
  cleanupTestUserData();
  cleanupAnonymousFiles();
  cleanupTestUsers();
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

  await t.test('works with no auth cookie at all — reference data is never gated behind login', async () => {
    const res = await fetch(`${baseUrl}/api/states`);
    assert.equal(res.status, 200);
  });
});

test('POST /api/auth/signup, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me', async (t) => {
  await t.test('signup creates an account, sets a session cookie, and returns the user', async () => {
    const { email, user, cookieHeader } = await signupTestUser();
    assert.match(user.id, /^u-[a-f0-9]{20}$/);
    assert.equal(user.email, email);
    assert.ok(cookieHeader);
  });

  await t.test('signup normalizes/lowercases the email', async () => {
    const email = nextTestEmail().toUpperCase();
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'test-password-123' }),
    });
    const user = await res.json();
    createdTestEmails.push(user.email);
    createdTestUserIds.push(user.id);
    assert.equal(user.email, email.toLowerCase());
  });

  await t.test('signup rejects a malformed email with a 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'test-password-123' }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('signup rejects a duplicate email with a 400', async () => {
    const { email } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'another-password-1' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('signup rejects a too-short password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nextTestEmail(), password: 'short' }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('login succeeds with the right password and sets a session cookie', async () => {
    const { email, password } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(res.status, 200);
    assert.ok(cookieHeaderFrom(res));
    const user = await res.json();
    assert.equal(user.email, email);
  });

  await t.test('login with a wrong password and login for a non-existent account return the identical generic error', async () => {
    const { email } = await signupTestUser();

    const wrongPasswordRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'not-the-right-password' }),
    });
    const noSuchUserRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no-such-account@example.com', password: 'whatever-12345' }),
    });

    assert.equal(wrongPasswordRes.status, 401);
    assert.equal(noSuchUserRes.status, 401);
    const wrongPasswordBody = await wrongPasswordRes.json();
    const noSuchUserBody = await noSuchUserRes.json();
    assert.deepEqual(wrongPasswordBody.errors, noSuchUserBody.errors);
  });

  await t.test('GET /me reflects the logged-in user, and null when logged out', async () => {
    const { cookieHeader, user } = await signupTestUser();

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookieHeader } });
    const me = await meRes.json();
    assert.equal(me.id, user.id);

    const loggedOutRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(await loggedOutRes.json(), null);
  });

  await t.test('logout invalidates the session server-side, not just the cookie', async () => {
    const { cookieHeader } = await signupTestUser();

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader } });
    assert.equal(logoutRes.status, 200);

    // Re-sending the now-logged-out cookie (as if it had been copied
    // somewhere) must not still authenticate — the session row itself has
    // to be gone, not just cleared client-side.
    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookieHeader } });
    assert.equal(await meRes.json(), null);
  });
});

test('POST /api/exams and DELETE /api/exams/:filename', async (t) => {
  await t.test('GET /api/exams works with no auth cookie — browsing exams never requires login', async () => {
    const res = await fetch(`${baseUrl}/api/exams`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.exams));
    assert.ok(body.exams.every((e) => e.source === 'bundled'));
  });

  await t.test('POST without a login is rejected with a 401', async () => {
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam: { examTitle: 'x', questions: [] } })
    });
    assert.equal(res.status, 401);
  });

  await t.test('DELETE without a login is rejected with a 401', async () => {
    const res = await fetch(`${baseUrl}/api/exams/whatever.json`, { method: 'DELETE' });
    assert.equal(res.status, 401);
  });

  await t.test('rejects a schema-invalid exam with a 400 and an errors array (logged in)', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ exam: { examTitle: 'Missing questions' } })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  });

  await t.test('a path-traversal delete attempt is rejected', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/exams/${encodeURIComponent('../../server/index.js')}`, {
      method: 'DELETE',
      headers: { Cookie: cookieHeader },
    });
    assert.equal(res.status, 400);
  });

  await t.test('deleting a bundled exam (not an upload) is a 404 — no such file in your own upload dir', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/exams/az900-practice-exam.json`, { method: 'DELETE', headers: { Cookie: cookieHeader } });
    assert.equal(res.status, 404);
  });

  await t.test('a valid upload succeeds, is private to the uploader, and can then be fetched/deleted', async () => {
    const uploaderRes = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nextTestEmail(), password: 'test-password-123' }),
    });
    const uploaderCookie = cookieHeaderFrom(uploaderRes);
    const uploader = await uploaderRes.json();
    createdTestEmails.push(uploader.email);
    createdTestUserIds.push(uploader.id);

    const uploadRes = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: uploaderCookie },
      body: JSON.stringify({
        fileName: 'automated-test-exam',
        exam: {
          examTitle: 'Automated Test Exam',
          questions: [{
            id: 1, domain: 'Test', type: 'single', question: '2+2?',
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
    assert.ok(fs.existsSync(path.join(EXAM_UPLOADS_DIR, uploader.id, TEST_EXAM_FILE)));
    // Never written into the statically-served exams dir.
    assert.ok(!fs.existsSync(path.join(EXAMS_DIR, TEST_EXAM_FILE)));

    // Shows up in the uploader's own list...
    const myListRes = await fetch(`${baseUrl}/api/exams`, { headers: { Cookie: uploaderCookie } });
    const myList = await myListRes.json();
    assert.ok(myList.exams.some((e) => e.file === TEST_EXAM_FILE && e.source === 'mine'));

    // ...but not in a second user's list, nor in the logged-out list.
    const otherUser = await signupTestUser();
    const otherListRes = await fetch(`${baseUrl}/api/exams`, { headers: { Cookie: otherUser.cookieHeader } });
    const otherList = await otherListRes.json();
    assert.ok(!otherList.exams.some((e) => e.file === TEST_EXAM_FILE));

    const loggedOutListRes = await fetch(`${baseUrl}/api/exams`);
    const loggedOutList = await loggedOutListRes.json();
    assert.ok(!loggedOutList.exams.some((e) => e.file === TEST_EXAM_FILE));

    // The uploader can fetch its content...
    const contentRes = await fetch(`${baseUrl}/api/exams/mine/${TEST_EXAM_FILE}`, { headers: { Cookie: uploaderCookie } });
    assert.equal(contentRes.status, 200);
    const content = await contentRes.json();
    assert.equal(content.examTitle, 'Automated Test Exam');

    // ...but a different user gets a 404, not the uploader's content.
    const otherContentRes = await fetch(`${baseUrl}/api/exams/mine/${TEST_EXAM_FILE}`, { headers: { Cookie: otherUser.cookieHeader } });
    assert.equal(otherContentRes.status, 404);

    const deleteRes = await fetch(`${baseUrl}/api/exams/${TEST_EXAM_FILE}`, { method: 'DELETE', headers: { Cookie: uploaderCookie } });
    assert.equal(deleteRes.status, 200);
    assert.ok(!fs.existsSync(path.join(EXAM_UPLOADS_DIR, uploader.id, TEST_EXAM_FILE)));
  });
});

test('GET /api/calendars/me, PUT /api/calendars/me, POST /api/calendars/claim', async (t) => {
  await t.test('every route 401s without a login', async () => {
    const getRes = await fetch(`${baseUrl}/api/calendars/me`);
    assert.equal(getRes.status, 401);
    const putRes = await fetch(`${baseUrl}/api/calendars/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    assert.equal(putRes.status, 401);
    const claimRes = await fetch(`${baseUrl}/api/calendars/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anonymousId: 'cal-aaaaaaaaaaaaaaaaaaaa' })
    });
    assert.equal(claimRes.status, 401);
  });

  await t.test('GET auto-creates a blank calendar on first access', async () => {
    const { cookieHeader, user } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/calendars/me`, { headers: { Cookie: cookieHeader } });
    assert.equal(res.status, 200);
    const calendar = await res.json();
    assert.equal(calendar.userId, user.id);
    assert.deepEqual(calendar.goals, []);
    assert.deepEqual(calendar.entries, {});
  });

  await t.test('PUT with a schema-invalid body is rejected with a 400', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/calendars/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ goals: [{ id: 'x', name: 'X', color: 'not-a-color' }] })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  await t.test('a full get/put/get round trip persists goals and entries, scoped to the logged-in user', async () => {
    const { cookieHeader } = await signupTestUser();

    const putRes = await fetch(`${baseUrl}/api/calendars/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        goals: [{ id: 'spanish', name: 'Spanish', color: '#e8a94c' }],
        selectedGoalId: 'spanish',
        entries: { spanish: { '2026-08-01': true } },
      })
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.equal(updated.goals[0].name, 'Spanish');

    const refetchRes = await fetch(`${baseUrl}/api/calendars/me`, { headers: { Cookie: cookieHeader } });
    const refetched = await refetchRes.json();
    assert.deepEqual(refetched.entries, { spanish: { '2026-08-01': true } });

    // A second account's "me" is a completely separate, blank calendar.
    const other = await signupTestUser();
    const otherRes = await fetch(`${baseUrl}/api/calendars/me`, { headers: { Cookie: other.cookieHeader } });
    const otherCalendar = await otherRes.json();
    assert.deepEqual(otherCalendar.goals, []);
  });

  await t.test('claim attaches an old anonymous calendar to a blank account, then it is gone', async () => {
    const anonId = 'cal-' + 'a1b2c3d4e5f6a7b8c9d0';
    const anonPath = path.join(CALENDARS_DIR, `${anonId}.json`);
    fs.mkdirSync(CALENDARS_DIR, { recursive: true });
    fs.writeFileSync(anonPath, JSON.stringify({
      id: anonId, userId: null,
      goals: [{ id: 'coding', name: 'Coding', color: '#4fa3e0' }],
      entries: { coding: { '2026-07-01': true } },
      selectedGoalId: 'coding',
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
    }, null, 2));
    createdAnonymousFiles.push(anonPath);

    const { cookieHeader } = await signupTestUser();
    const claimRes = await fetch(`${baseUrl}/api/calendars/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: anonId })
    });
    assert.equal(claimRes.status, 200);
    const claimed = await claimRes.json();
    assert.equal(claimed.goals[0].name, 'Coding');
    assert.ok(!fs.existsSync(anonPath));
  });

  await t.test('claim is refused with a 409 if the account already has real content', async () => {
    const { cookieHeader } = await signupTestUser();
    await fetch(`${baseUrl}/api/calendars/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ goals: [{ id: 'x', name: 'X', color: '#e8a94c' }] })
    });

    const anonId = 'cal-' + 'b2b2c3d4e5f6a7b8c9d0';
    const anonPath = path.join(CALENDARS_DIR, `${anonId}.json`);
    fs.writeFileSync(anonPath, JSON.stringify({ id: anonId, userId: null, goals: [], entries: {}, selectedGoalId: null }, null, 2));
    createdAnonymousFiles.push(anonPath);

    const claimRes = await fetch(`${baseUrl}/api/calendars/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: anonId })
    });
    assert.equal(claimRes.status, 409);
  });

  await t.test('claim rejects a malformed anonymousId with a 400', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/calendars/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: '../../server/index' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('claim for a guest record that does not exist is a 404', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/calendars/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: 'cal-00000000000000000000' })
    });
    assert.equal(res.status, 404);
  });
});

test('GET /api/math-facts-profiles/me, PUT /api/math-facts-profiles/me, POST /api/math-facts-profiles/claim', async (t) => {
  await t.test('every route 401s without a login', async () => {
    const getRes = await fetch(`${baseUrl}/api/math-facts-profiles/me`);
    assert.equal(getRes.status, 401);
    const putRes = await fetch(`${baseUrl}/api/math-facts-profiles/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    assert.equal(putRes.status, 401);
    const claimRes = await fetch(`${baseUrl}/api/math-facts-profiles/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anonymousId: 'mf-aaaaaaaaaaaaaaaaaaaa' })
    });
    assert.equal(claimRes.status, 401);
  });

  await t.test('GET auto-creates a blank profile on first access', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/me`, { headers: { Cookie: cookieHeader } });
    assert.equal(res.status, 200);
    const profile = await res.json();
    assert.equal(profile.totalPoints, 0);
    assert.deepEqual(profile.badges, []);
    assert.deepEqual(profile.factStats, {});
  });

  await t.test('PUT with a schema-invalid body is rejected with a 400', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ totalPoints: -50 })
    });
    assert.equal(res.status, 400);
  });

  await t.test('a full get/put/get round trip persists points, streak, and fact stats, scoped to the logged-in user', async () => {
    const { cookieHeader } = await signupTestUser();

    const putRes = await fetch(`${baseUrl}/api/math-facts-profiles/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        totalPoints: 150,
        streak: { current: 1, longest: 1, lastPracticeDate: '2026-08-21' },
        factStats: { 'add:3+4': { attempts: 3, correct: 3, totalTimeMs: 4500, avgTimeMs: 1500, lastPracticedAt: '2026-08-21T00:00:00.000Z' } }
      })
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.equal(updated.totalPoints, 150);
    assert.equal(updated.factStats['add:3+4'].attempts, 3);

    const refetchRes = await fetch(`${baseUrl}/api/math-facts-profiles/me`, { headers: { Cookie: cookieHeader } });
    const refetched = await refetchRes.json();
    assert.equal(refetched.totalPoints, 150);

    // A second account's "me" is a completely separate, blank profile.
    const other = await signupTestUser();
    const otherRes = await fetch(`${baseUrl}/api/math-facts-profiles/me`, { headers: { Cookie: other.cookieHeader } });
    const otherProfile = await otherRes.json();
    assert.equal(otherProfile.totalPoints, 0);
  });

  await t.test('claim attaches an old anonymous profile to a blank account, then it is gone', async () => {
    const anonId = 'mf-' + 'a1b2c3d4e5f6a7b8c9d0';
    const anonPath = path.join(MATH_FACTS_PROFILES_DIR, `${anonId}.json`);
    fs.mkdirSync(MATH_FACTS_PROFILES_DIR, { recursive: true });
    fs.writeFileSync(anonPath, JSON.stringify({
      id: anonId, userId: null, totalPoints: 90,
      streak: { current: 2, longest: 2, lastPracticeDate: '2026-08-20' },
      badges: [], factStats: { 'add:1+1': { attempts: 5, correct: 5, totalTimeMs: 5000, avgTimeMs: 1000, lastPracticedAt: '2026-08-20T00:00:00.000Z' } },
      sessionHistory: [],
      createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
    }, null, 2));
    createdAnonymousFiles.push(anonPath);

    const { cookieHeader } = await signupTestUser();
    const claimRes = await fetch(`${baseUrl}/api/math-facts-profiles/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: anonId })
    });
    assert.equal(claimRes.status, 200);
    const claimed = await claimRes.json();
    assert.equal(claimed.totalPoints, 90);
    assert.ok(!fs.existsSync(anonPath));
  });

  await t.test('claim is refused with a 409 if the account already has real progress', async () => {
    const { cookieHeader } = await signupTestUser();
    await fetch(`${baseUrl}/api/math-facts-profiles/me`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ totalPoints: 10 })
    });

    const anonId = 'mf-' + 'b2b2c3d4e5f6a7b8c9d0';
    const anonPath = path.join(MATH_FACTS_PROFILES_DIR, `${anonId}.json`);
    fs.writeFileSync(anonPath, JSON.stringify({ id: anonId, userId: null, totalPoints: 500, streak: { current: 0, longest: 0, lastPracticeDate: null }, badges: [], factStats: {}, sessionHistory: [] }, null, 2));
    createdAnonymousFiles.push(anonPath);

    const claimRes = await fetch(`${baseUrl}/api/math-facts-profiles/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: anonId })
    });
    assert.equal(claimRes.status, 409);
  });

  await t.test('claim rejects a malformed anonymousId with a 400', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: '../../server/index' })
    });
    assert.equal(res.status, 400);
  });

  await t.test('claim for a guest record that does not exist is a 404', async () => {
    const { cookieHeader } = await signupTestUser();
    const res = await fetch(`${baseUrl}/api/math-facts-profiles/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ anonymousId: 'mf-00000000000000000000' })
    });
    assert.equal(res.status, 404);
  });
});
