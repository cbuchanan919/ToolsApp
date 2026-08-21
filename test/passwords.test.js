'use strict';

// Unit tests for password hashing/verification — no server/filesystem
// involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../server/lib/passwords');

test('hashPassword / verifyPassword', async (t) => {
  await t.test('a hash round-trips against the same password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  });

  await t.test('a wrong password fails verification', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('wrong password', stored), false);
  });

  await t.test('hashing the same password twice produces different output (salted)', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    assert.notEqual(a, b);
  });

  await t.test('verifyPassword rejects malformed stored values instead of throwing', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-real-hash'), false);
    assert.equal(await verifyPassword('anything', ''), false);
    assert.equal(await verifyPassword('anything', undefined), false);
  });

  await t.test('the stored value is self-describing (scrypt params embedded)', async () => {
    const stored = await hashPassword('x');
    const parts = stored.split(':');
    assert.equal(parts[0], 'scrypt');
    assert.equal(parts.length, 7);
  });
});
