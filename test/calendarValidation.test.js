'use strict';

// Unit tests for the calendar schema validator — no server involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCalendar } = require('../server/lib/calendarValidation');

function minimalValidCalendar() {
  return {
    goals: [{ id: 'spanish', name: 'Spanish', color: '#e8a94c' }],
    entries: { spanish: { '2026-08-01': true } },
    selectedGoalId: 'spanish',
  };
}

test('validateCalendar', async (t) => {
  await t.test('a well-formed calendar is valid', () => {
    const { valid, errors } = validateCalendar(minimalValidCalendar());
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
  });

  await t.test('an empty goals/entries calendar is valid', () => {
    const { valid } = validateCalendar({ goals: [], entries: {}, selectedGoalId: null });
    assert.equal(valid, true);
  });

  await t.test('rejects a non-object root', () => {
    const { valid, errors } = validateCalendar([]);
    assert.equal(valid, false);
    assert.match(errors[0], /must be an object/);
  });

  await t.test('rejects goals that is not an array', () => {
    const { valid, errors } = validateCalendar({ goals: 'nope', entries: {}, selectedGoalId: null });
    assert.equal(valid, false);
    assert.match(errors[0], /"goals" must be an array/);
  });

  await t.test('rejects a goal missing a name', () => {
    const c = minimalValidCalendar();
    delete c.goals[0].name;
    const { valid, errors } = validateCalendar(c);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /missing "name"/.test(e)));
  });

  await t.test('rejects a goal with an invalid color', () => {
    const c = minimalValidCalendar();
    c.goals[0].color = 'orange';
    const { valid, errors } = validateCalendar(c);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /"color" must be a hex string/.test(e)));
  });

  await t.test('rejects duplicate goal ids', () => {
    const c = minimalValidCalendar();
    c.goals.push({ id: 'spanish', name: 'Spanish again', color: '#4fa3e0' });
    const { valid, errors } = validateCalendar(c);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /duplicate "id"/.test(e)));
  });

  await t.test('rejects entries referencing an unknown goal id', () => {
    const c = minimalValidCalendar();
    c.entries.coding = { '2026-08-01': true };
    const { valid, errors } = validateCalendar(c);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => /references unknown goal id/.test(e)));
  });

  await t.test('rejects a non-string selectedGoalId', () => {
    const c = minimalValidCalendar();
    c.selectedGoalId = 42;
    const { valid, errors } = validateCalendar(c);
    assert.equal(valid, false);
    assert.match(errors[0], /"selectedGoalId" must be a string or null/);
  });

  await t.test('selectedGoalId may be null', () => {
    const c = minimalValidCalendar();
    c.selectedGoalId = null;
    const { valid } = validateCalendar(c);
    assert.equal(valid, true);
  });
});
