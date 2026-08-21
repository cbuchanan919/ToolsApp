'use strict';

const FACT_KEY_RE = /^(add|sub|mul|div):.+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SESSION_HISTORY = 500; // enough for months of daily practice without an unbounded file

// Mirrors the shape the frontend builds (see MathFacts/app.js): a running
// per-fact stats map plus points/streak/badges/session-history summaries.
function validateProfile(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Body must be an object.'] };
  }

  const { totalPoints, streak, badges, factStats, sessionHistory } = payload;

  if (totalPoints !== undefined && (typeof totalPoints !== 'number' || !Number.isFinite(totalPoints) || totalPoints < 0)) {
    errors.push('"totalPoints" must be a non-negative number.');
  }

  if (streak !== undefined) {
    if (!streak || typeof streak !== 'object' || Array.isArray(streak)) {
      errors.push('"streak" must be an object.');
    } else {
      if (typeof streak.current !== 'number' || streak.current < 0) errors.push('"streak.current" must be a non-negative number.');
      if (typeof streak.longest !== 'number' || streak.longest < 0) errors.push('"streak.longest" must be a non-negative number.');
      if (streak.lastPracticeDate !== null && streak.lastPracticeDate !== undefined && !DATE_RE.test(streak.lastPracticeDate)) {
        errors.push('"streak.lastPracticeDate" must be a "YYYY-MM-DD" string or null.');
      }
    }
  }

  if (badges !== undefined) {
    if (!Array.isArray(badges)) {
      errors.push('"badges" must be an array.');
    } else {
      badges.forEach((b, i) => {
        if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !b.id.trim()) {
          errors.push(`Badge ${i + 1}: must be an object with an "id".`);
        }
      });
    }
  }

  if (factStats !== undefined) {
    if (!factStats || typeof factStats !== 'object' || Array.isArray(factStats)) {
      errors.push('"factStats" must be an object mapping fact key to stats.');
    } else {
      Object.keys(factStats).forEach((key) => {
        if (!FACT_KEY_RE.test(key)) {
          errors.push(`"factStats" has an invalid fact key "${key}".`);
          return;
        }
        const s = factStats[key];
        const label = `factStats["${key}"]`;
        if (!s || typeof s !== 'object' || Array.isArray(s)) {
          errors.push(`${label}: must be an object.`);
          return;
        }
        if (typeof s.attempts !== 'number' || s.attempts < 0) errors.push(`${label}.attempts must be a non-negative number.`);
        if (typeof s.correct !== 'number' || s.correct < 0) errors.push(`${label}.correct must be a non-negative number.`);
        if (typeof s.attempts === 'number' && typeof s.correct === 'number' && s.correct > s.attempts) {
          errors.push(`${label}: "correct" cannot exceed "attempts".`);
        }
        if (typeof s.avgTimeMs !== 'number' || s.avgTimeMs < 0) errors.push(`${label}.avgTimeMs must be a non-negative number.`);
      });
    }
  }

  if (sessionHistory !== undefined) {
    if (!Array.isArray(sessionHistory)) {
      errors.push('"sessionHistory" must be an array.');
    } else if (sessionHistory.length > MAX_SESSION_HISTORY) {
      errors.push(`"sessionHistory" cannot exceed ${MAX_SESSION_HISTORY} entries.`);
    } else {
      sessionHistory.forEach((s, i) => {
        const label = `Session ${i + 1}`;
        if (!s || typeof s !== 'object' || Array.isArray(s)) {
          errors.push(`${label}: must be an object.`);
          return;
        }
        if (typeof s.correct !== 'number' || s.correct < 0) errors.push(`${label}: "correct" must be a non-negative number.`);
        if (typeof s.incorrect !== 'number' || s.incorrect < 0) errors.push(`${label}: "incorrect" must be a non-negative number.`);
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateProfile };
