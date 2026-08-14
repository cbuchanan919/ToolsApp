'use strict';

// No-op today — every API route already runs through this middleware, so
// adding real auth later (an API key check, a JWT verify, whatever) is a
// one-file change here instead of a routes/ refactor. Intentionally does
// nothing yet.
function requireAuth(req, res, next) {
  next();
}

module.exports = { requireAuth };
