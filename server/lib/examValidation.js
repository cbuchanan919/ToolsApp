'use strict';

// Ported 1:1 from the previous serve.py (validate_exam_schema / slugify /
// unique_filename / is_safe_exam_filename) — mirrors the client-side
// validator in tools/Exam/app.js, so a rejected upload reports every error
// at once instead of failing on the first one.

const VALID_TYPES = ['single', 'multiple'];

function validateExamSchema(obj) {
  const errors = [];

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ['Root of the file must be a JSON object.'] };
  }

  ['examTitle', 'questions'].forEach((key) => {
    if (!(key in obj)) errors.push(`Missing required top-level field "${key}".`);
  });

  if ('examTitle' in obj && typeof obj.examTitle !== 'string') {
    errors.push('"examTitle" must be a string.');
  }
  if ('domains' in obj && (typeof obj.domains !== 'object' || obj.domains === null || Array.isArray(obj.domains))) {
    errors.push('"domains" must be an object mapping domain name to weight.');
  }
  if ('author' in obj && obj.author !== null && typeof obj.author !== 'string') {
    errors.push('"author" must be a string if present.');
  }
  if ('dateCreated' in obj && obj.dateCreated !== null && typeof obj.dateCreated !== 'string') {
    errors.push('"dateCreated" must be a string if present.');
  }

  const questions = obj.questions;
  if (!Array.isArray(questions)) {
    errors.push('"questions" must be an array.');
    return { valid: false, errors };
  }
  if (questions.length === 0) {
    errors.push('"questions" array is empty — add at least one question.');
    return { valid: false, errors };
  }

  const seenIds = new Set();
  questions.forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (typeof q !== 'object' || q === null || Array.isArray(q)) {
      errors.push(`${label}: must be an object.`);
      return;
    }

    if (!('id' in q)) {
      errors.push(`${label}: missing "id".`);
    } else if (seenIds.has(q.id)) {
      errors.push(`${label}: duplicate "id" value (${q.id}).`);
    } else {
      seenIds.add(q.id);
    }

    if (typeof q.domain !== 'string' || !q.domain.trim()) {
      errors.push(`${label}: missing or invalid "domain".`);
    }
    if (!VALID_TYPES.includes(q.type)) {
      errors.push(`${label}: "type" must be "single" or "multiple".`);
    }
    if (typeof q.question !== 'string' || !q.question.trim()) {
      errors.push(`${label}: missing or empty "question" text.`);
    }

    const options = q.options;
    let optionLetters = [];
    if (!Array.isArray(options) || options.length < 2) {
      errors.push(`${label}: "options" must be an array of at least 2 items.`);
    } else {
      options.forEach((opt, oi) => {
        if (typeof opt !== 'object' || opt === null || Array.isArray(opt)) {
          errors.push(`${label}: option ${oi + 1} must be an object.`);
          return;
        }
        const letter = opt.letter;
        if (typeof letter !== 'string' || !letter.trim()) {
          errors.push(`${label}: option ${oi + 1} missing "letter".`);
        } else {
          optionLetters.push(letter);
        }
        if (typeof opt.text !== 'string' || !opt.text.trim()) {
          errors.push(`${label}: option ${oi + 1} missing "text".`);
        }
      });
      const dupes = [...new Set(optionLetters.filter((l) => optionLetters.filter((x) => x === l).length > 1))];
      if (dupes.length) {
        errors.push(`${label}: duplicate option letters (${dupes.sort().join(', ')}).`);
      }
    }

    const correct = q.correctAnswers;
    if (!Array.isArray(correct) || correct.length === 0) {
      errors.push(`${label}: "correctAnswers" must be a non-empty array.`);
    } else {
      const badRefs = correct.filter((a) => !optionLetters.includes(a));
      if (badRefs.length) {
        errors.push(`${label}: "correctAnswers" references unknown letters: ${badRefs.join(', ')}.`);
      }
      if (q.type === 'single' && correct.length !== 1) {
        errors.push(`${label}: type "single" must have exactly 1 correct answer.`);
      }
    }

    if ('explanation' in q && q.explanation !== null && typeof q.explanation !== 'string') {
      errors.push(`${label}: "explanation" must be a string.`);
    }
    if ('timeSensitive' in q && typeof q.timeSensitive !== 'boolean') {
      errors.push(`${label}: "timeSensitive" must be true or false.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function slugify(text, fallback = 'exam') {
  const cleaned = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

module.exports = { validateExamSchema, slugify };
