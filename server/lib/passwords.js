'use strict';

const crypto = require('crypto');

// Explicit cost params (not Node's implicit scrypt defaults) so a hash
// carries everything needed to verify it, and params can change later
// without invalidating hashes already stored with the old ones.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt, params) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, params.keylen, { N: params.N, r: params.r, p: params.p }, (err, derivedKey) => {
      if (err) reject(err); else resolve(derivedKey);
    });
  });
}

// Stored as "scrypt:N:r:p:keylen:saltHex:hashHex" — self-describing, so
// verifyPassword doesn't need to assume today's params were used.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_PARAMS);
  const { N, r, p, keylen } = SCRYPT_PARAMS;
  return `scrypt:${N}:${r}:${p}:${keylen}:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 7 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, keylenStr, saltHex, hashHex] = parts;
  const params = { N: Number(nStr), r: Number(rStr), p: Number(pStr), keylen: Number(keylenStr) };
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, params);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
