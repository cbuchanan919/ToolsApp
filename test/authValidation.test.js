'use strict';

// Unit tests for the email/password rules — no server involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, validateEmail, validatePassword } = require('../server/lib/authValidation');

test('normalizeEmail', async (t) => {
  await t.test('trims and lowercases', () => {
    assert.equal(normalizeEmail('  Chris@Example.com  '), 'chris@example.com');
  });

  await t.test('non-strings normalize to empty', () => {
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(normalizeEmail(42), '');
  });
});

test('validateEmail', async (t) => {
  await t.test('accepts a well-formed email', () => {
    const { valid, normalized } = validateEmail('chris@example.com');
    assert.equal(valid, true);
    assert.equal(normalized, 'chris@example.com');
  });

  await t.test('is case-insensitive — normalizes before validating', () => {
    const { valid, normalized } = validateEmail('Chris@Example.COM');
    assert.equal(valid, true);
    assert.equal(normalized, 'chris@example.com');
  });

  await t.test('accepts a plus-addressed or subdomained email', () => {
    assert.equal(validateEmail('chris+tools@mail.example.com').valid, true);
  });

  await t.test('rejects empty/missing', () => {
    assert.equal(validateEmail('').valid, false);
    assert.equal(validateEmail(undefined).valid, false);
    assert.equal(validateEmail('   ').valid, false);
  });

  await t.test('rejects a missing @', () => {
    assert.equal(validateEmail('chris.example.com').valid, false);
  });

  await t.test('rejects a missing domain', () => {
    assert.equal(validateEmail('chris@').valid, false);
  });

  await t.test('rejects a domain with no dot', () => {
    assert.equal(validateEmail('chris@localhost').valid, false);
  });

  await t.test('rejects whitespace inside the address', () => {
    assert.equal(validateEmail('chris @example.com').valid, false);
  });

  await t.test('rejects an absurdly long address', () => {
    assert.equal(validateEmail('a'.repeat(250) + '@example.com').valid, false);
  });
});

test('validatePassword', async (t) => {
  await t.test('accepts a password at the minimum length', () => {
    assert.equal(validatePassword('12345678').valid, true);
  });

  await t.test('rejects empty/missing', () => {
    assert.equal(validatePassword('').valid, false);
    assert.equal(validatePassword(undefined).valid, false);
  });

  await t.test('rejects too short', () => {
    assert.equal(validatePassword('short').valid, false);
  });
});
