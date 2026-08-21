'use strict';

// Unit tests for the math facts profile schema validator — no server involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile } = require('../server/lib/mathFactsValidation');

function minimalValidProfile() {
  return {
    totalPoints: 120,
    streak: { current: 2, longest: 5, lastPracticeDate: '2026-08-21' },
    badges: [{ id: 'first-session', earnedAt: '2026-08-20T00:00:00.000Z' }],
    factStats: { 'add:3+4': { attempts: 5, correct: 4, totalTimeMs: 9000, avgTimeMs: 1800, lastPracticedAt: '2026-08-21T00:00:00.000Z' } },
    sessionHistory: [{ date: '2026-08-21', operation: 'add', difficulty: 'easy', mode: 'timed', correct: 8, incorrect: 2, accuracy: 0.8, avgResponseMs: 1800, pointsEarned: 90 }],
  };
}

test('validateProfile', async (t) => {
  await t.test('a well-formed profile is valid', () => {
    const { valid, errors } = validateProfile(minimalValidProfile());
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
  });

  await t.test('an empty object (all fields optional) is valid', () => {
    const { valid } = validateProfile({});
    assert.equal(valid, true);
  });

  await t.test('rejects a non-object root', () => {
    const { valid, errors } = validateProfile([]);
    assert.equal(valid, false);
    assert.match(errors[0], /must be an object/);
  });

  await t.test('rejects a negative totalPoints', () => {
    const p = minimalValidProfile();
    p.totalPoints = -5;
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /"totalPoints" must be a non-negative number/.test(e)));
  });

  await t.test('rejects a malformed streak.lastPracticeDate', () => {
    const p = minimalValidProfile();
    p.streak.lastPracticeDate = 'not-a-date';
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /"streak.lastPracticeDate"/.test(e)));
  });

  await t.test('streak.lastPracticeDate may be null', () => {
    const p = minimalValidProfile();
    p.streak.lastPracticeDate = null;
    const { valid } = validateProfile(p);
    assert.equal(valid, true);
  });

  await t.test('rejects a badge with no id', () => {
    const p = minimalValidProfile();
    p.badges = [{ earnedAt: '2026-08-20T00:00:00.000Z' }];
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /must be an object with an "id"/.test(e)));
  });

  await t.test('rejects an invalid fact key', () => {
    const p = minimalValidProfile();
    p.factStats['nonsense-key'] = { attempts: 1, correct: 1, avgTimeMs: 1000 };
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /invalid fact key/.test(e)));
  });

  await t.test('rejects fact stats where correct exceeds attempts', () => {
    const p = minimalValidProfile();
    p.factStats['add:3+4'] = { attempts: 2, correct: 5, avgTimeMs: 1000 };
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /"correct" cannot exceed "attempts"/.test(e)));
  });

  await t.test('rejects sessionHistory that is not an array', () => {
    const p = minimalValidProfile();
    p.sessionHistory = 'nope';
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.match(errors[0], /"sessionHistory" must be an array/);
  });

  await t.test('rejects a session missing correct/incorrect', () => {
    const p = minimalValidProfile();
    p.sessionHistory = [{ date: '2026-08-21' }];
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /"correct" must be a non-negative number/.test(e)));
  });

  await t.test('rejects an oversized sessionHistory', () => {
    const p = minimalValidProfile();
    p.sessionHistory = Array.from({ length: 501 }, () => ({ correct: 1, incorrect: 0 }));
    const { valid, errors } = validateProfile(p);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /cannot exceed 500 entries/.test(e)));
  });
});
