'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExamSchema, slugify } = require('../server/lib/examValidation');

function minimalValidExam() {
  return {
    examTitle: 'Sample Exam',
    questions: [
      {
        id: 1,
        domain: 'General',
        type: 'single',
        question: 'What is 2+2?',
        options: [{ letter: 'A', text: '3' }, { letter: 'B', text: '4' }],
        correctAnswers: ['B']
      }
    ]
  };
}

test('validateExamSchema', async (t) => {
  await t.test('a well-formed minimal exam is valid', () => {
    const { valid, errors } = validateExamSchema(minimalValidExam());
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
  });

  await t.test('rejects a non-object root (array)', () => {
    const { valid, errors } = validateExamSchema([]);
    assert.equal(valid, false);
    assert.match(errors[0], /must be a JSON object/);
  });

  await t.test('rejects a non-object root (null)', () => {
    const { valid } = validateExamSchema(null);
    assert.equal(valid, false);
  });

  await t.test('reports missing examTitle and questions together, not just the first', () => {
    const { valid, errors } = validateExamSchema({});
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('examTitle')));
    assert.ok(errors.some((e) => e.includes('questions')));
  });

  await t.test('rejects an empty questions array', () => {
    const exam = minimalValidExam();
    exam.questions = [];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.match(errors[0], /empty/);
  });

  await t.test('rejects duplicate question ids and names the duplicate', () => {
    const exam = minimalValidExam();
    exam.questions.push({ ...minimalValidExam().questions[0], id: 1 });
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('duplicate "id" value (1)')));
  });

  await t.test('rejects duplicate option letters within one question', () => {
    const exam = minimalValidExam();
    exam.questions[0].options = [{ letter: 'A', text: 'x' }, { letter: 'A', text: 'y' }];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('duplicate option letters (A)')));
  });

  await t.test('rejects correctAnswers referencing a letter that does not exist', () => {
    const exam = minimalValidExam();
    exam.questions[0].correctAnswers = ['Z'];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('unknown letters: Z')));
  });

  await t.test('rejects "single" type with more than one correct answer', () => {
    const exam = minimalValidExam();
    exam.questions[0].correctAnswers = ['A', 'B'];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('exactly 1 correct answer')));
  });

  await t.test('allows "multiple" type with more than one correct answer', () => {
    const exam = minimalValidExam();
    exam.questions[0].type = 'multiple';
    exam.questions[0].correctAnswers = ['A', 'B'];
    const { valid } = validateExamSchema(exam);
    assert.equal(valid, true);
  });

  await t.test('rejects an invalid "type" value', () => {
    const exam = minimalValidExam();
    exam.questions[0].type = 'essay';
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('"type" must be')));
  });

  await t.test('rejects fewer than 2 options', () => {
    const exam = minimalValidExam();
    exam.questions[0].options = [{ letter: 'A', text: 'only one' }];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('at least 2 items')));
  });

  await t.test('rejects a non-string, non-null "explanation"', () => {
    const exam = minimalValidExam();
    exam.questions[0].explanation = 42;
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('"explanation" must be a string')));
  });

  await t.test('allows a null "explanation"', () => {
    const exam = minimalValidExam();
    exam.questions[0].explanation = null;
    const { valid } = validateExamSchema(exam);
    assert.equal(valid, true);
  });

  await t.test('rejects a non-boolean "timeSensitive"', () => {
    const exam = minimalValidExam();
    exam.questions[0].timeSensitive = 'yes';
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('"timeSensitive" must be true or false')));
  });

  await t.test('rejects "domains" that is an array instead of an object', () => {
    const exam = minimalValidExam();
    exam.domains = ['General'];
    const { valid, errors } = validateExamSchema(exam);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('"domains" must be an object')));
  });
});

test('slugify', async (t) => {
  await t.test('lowercases and hyphenates', () => {
    assert.equal(slugify('AZ-900 Practice Exam'), 'az-900-practice-exam');
  });

  await t.test('strips leading/trailing hyphens produced by punctuation at the edges', () => {
    assert.equal(slugify('  ¡Hola!  '), 'hola');
  });

  await t.test('falls back to the default when the result would be empty', () => {
    assert.equal(slugify('!!!'), 'exam');
  });

  await t.test('falls back to a custom fallback when given one', () => {
    assert.equal(slugify('', 'untitled'), 'untitled');
  });

  await t.test('handles undefined/null input without throwing', () => {
    assert.equal(slugify(undefined), 'exam');
    assert.equal(slugify(null), 'exam');
  });

  await t.test('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    assert.equal(slugify('A///B   C'), 'a-b-c');
  });
});
