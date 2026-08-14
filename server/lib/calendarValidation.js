'use strict';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Mirrors the shape the frontend already builds (see
// LifeGoalsCalendar/app.js): a list of goals, each with a unique id and a
// display color, plus a per-goal map of "date key -> true" entries.
function validateCalendar(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Body must be an object.'] };
  }

  const { goals, entries, selectedGoalId } = payload;

  let goalIds = null;
  if (!Array.isArray(goals)) {
    errors.push('"goals" must be an array.');
  } else {
    goalIds = new Set();
    goals.forEach((g, i) => {
      const label = `Goal ${i + 1}`;
      if (!g || typeof g !== 'object') {
        errors.push(`${label}: must be an object.`);
        return;
      }
      if (typeof g.id !== 'string' || !g.id.trim()) {
        errors.push(`${label}: missing "id".`);
      } else if (goalIds.has(g.id)) {
        errors.push(`${label}: duplicate "id" (${g.id}).`);
      } else {
        goalIds.add(g.id);
      }
      if (typeof g.name !== 'string' || !g.name.trim()) {
        errors.push(`${label}: missing "name".`);
      }
      if (typeof g.color !== 'string' || !HEX_COLOR_RE.test(g.color)) {
        errors.push(`${label}: "color" must be a hex string like "#e8a94c".`);
      }
    });
  }

  if (entries !== undefined && entries !== null) {
    if (typeof entries !== 'object' || Array.isArray(entries)) {
      errors.push('"entries" must be an object mapping goal id to a map of date keys.');
    } else {
      Object.keys(entries).forEach((goalId) => {
        if (goalIds && !goalIds.has(goalId)) {
          errors.push(`"entries" references unknown goal id "${goalId}".`);
        }
        const dayMap = entries[goalId];
        if (!dayMap || typeof dayMap !== 'object' || Array.isArray(dayMap)) {
          errors.push(`"entries.${goalId}" must be an object mapping date keys to true.`);
        }
      });
    }
  }

  if (selectedGoalId !== undefined && selectedGoalId !== null && typeof selectedGoalId !== 'string') {
    errors.push('"selectedGoalId" must be a string or null.');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCalendar };
