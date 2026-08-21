'use strict';

// Unit tests for the Math Facts Practice core logic — no server/DOM
// involved. The module is dual-usable (browser <script> + require()); this
// is the require() side.
const test = require('node:test');
const assert = require('node:assert/strict');
const MathFactsCore = require('../public/tools/MathFacts/mathFactsCore');

const {
  DIFFICULTY_PRESETS,
  RANGE_CAPS,
  generateFact,
  factKey,
  factFromKey,
  checkAnswer,
  allFactKeysForPreset,
  clampToRangeCap,
  difficultyMultiplierForRange,
  updateFactStats,
  classifyMastery,
  rankFacts,
  getRecommendedDifficulty,
  calculateSessionPoints,
  levelForPoints,
  updateStreak,
  evaluateBadges,
} = MathFactsCore;

test('generateFact', async (t) => {
  await t.test('addition stays within range and sums correctly', () => {
    for (let i = 0; i < 200; i++) {
      const fact = generateFact('add', { min: 0, max: 12 });
      assert.ok(fact.a >= 0 && fact.a <= 12);
      assert.ok(fact.b >= 0 && fact.b <= 12);
      assert.equal(fact.answer, fact.a + fact.b);
    }
  });

  await t.test('subtraction never produces a negative result', () => {
    for (let i = 0; i < 200; i++) {
      const fact = generateFact('sub', { min: 0, max: 12 });
      assert.ok(fact.a >= fact.b);
      assert.equal(fact.answer, fact.a - fact.b);
      assert.ok(fact.answer >= 0);
    }
  });

  await t.test('multiplication stays within range and multiplies correctly', () => {
    for (let i = 0; i < 200; i++) {
      const fact = generateFact('mul', { min: 0, max: 10 });
      assert.ok(fact.a >= 0 && fact.a <= 10);
      assert.ok(fact.b >= 0 && fact.b <= 10);
      assert.equal(fact.answer, fact.a * fact.b);
    }
  });

  await t.test('division is always exact (no remainders) and divisor is never 0', () => {
    for (let i = 0; i < 200; i++) {
      const fact = generateFact('div', { min: 1, max: 12 });
      assert.notEqual(fact.b, 0);
      assert.equal(fact.a % fact.b, 0);
      assert.equal(fact.answer, fact.a / fact.b);
      assert.ok(fact.answer >= 1 && fact.answer <= 12);
    }
  });

  await t.test('throws on an unknown operation', () => {
    assert.throws(() => generateFact('mod', { min: 0, max: 5 }));
  });
});

test('factKey', async (t) => {
  await t.test('addition and multiplication are commutative — order does not matter', () => {
    assert.equal(factKey('add', 3, 4), factKey('add', 4, 3));
    assert.equal(factKey('mul', 7, 8), factKey('mul', 8, 7));
  });

  await t.test('subtraction and division are order-sensitive', () => {
    assert.notEqual(factKey('sub', 9, 4), factKey('sub', 4, 9));
    assert.notEqual(factKey('div', 12, 3), factKey('div', 3, 12));
  });

  await t.test('key is prefixed with the operation', () => {
    assert.match(factKey('add', 1, 2), /^add:/);
    assert.match(factKey('div', 12, 4), /^div:/);
  });
});

test('factFromKey', async (t) => {
  await t.test('round-trips through factKey for every operation', () => {
    const cases = [
      generateFact('add', { min: 0, max: 12 }),
      generateFact('sub', { min: 0, max: 12 }),
      generateFact('mul', { min: 0, max: 12 }),
      generateFact('div', { min: 1, max: 12 }),
    ];
    cases.forEach((fact) => {
      const key = factKey(fact.operation, fact.a, fact.b);
      const parsed = factFromKey(key);
      assert.equal(parsed.operation, fact.operation);
      assert.equal(parsed.answer, fact.answer);
    });
  });

  await t.test('parses a known division key correctly', () => {
    const parsed = factFromKey('div:12/4');
    assert.deepEqual(parsed, { operation: 'div', a: 12, b: 4, answer: 3 });
  });
});

test('checkAnswer', async (t) => {
  const fact = { answer: 7 };

  await t.test('accepts a matching number', () => {
    assert.equal(checkAnswer(fact, 7), true);
  });

  await t.test('accepts a matching numeric string', () => {
    assert.equal(checkAnswer(fact, '7'), true);
  });

  await t.test('rejects a wrong answer', () => {
    assert.equal(checkAnswer(fact, 8), false);
  });

  await t.test('rejects empty/non-numeric input instead of throwing', () => {
    assert.equal(checkAnswer(fact, ''), false);
    assert.equal(checkAnswer(fact, 'seven'), false);
    assert.equal(checkAnswer(fact, undefined), false);
  });
});

test('allFactKeysForPreset', async (t) => {
  await t.test('addition 0-2 has one entry per unordered pair', () => {
    const keys = allFactKeysForPreset('add', { min: 0, max: 2 });
    // (0,0) (0,1) (0,2) (1,1) (1,2) (2,2) = 6
    assert.equal(keys.length, 6);
    assert.equal(new Set(keys).size, 6);
  });

  await t.test('division 1-3 only includes exact quotient/divisor pairs', () => {
    const keys = allFactKeysForPreset('div', { min: 1, max: 3 });
    assert.equal(keys.length, 9); // 3 divisors x 3 quotients
  });
});

test('clampToRangeCap', async (t) => {
  await t.test('leaves an in-bounds value alone', () => {
    assert.equal(clampToRangeCap('add', 20), 20);
  });

  await t.test('clamps below the floor up to the operation minimum', () => {
    assert.equal(clampToRangeCap('div', 0), 1); // division can never allow a 0 divisor
    assert.equal(clampToRangeCap('add', -5), 0);
  });

  await t.test('clamps above the ceiling down to the operation cap', () => {
    assert.equal(clampToRangeCap('mul', 999), RANGE_CAPS.mul.max);
  });

  await t.test('non-numeric input falls back to the operation minimum', () => {
    assert.equal(clampToRangeCap('add', 'abc'), RANGE_CAPS.add.min);
  });

  await t.test('rounds fractional input', () => {
    assert.equal(clampToRangeCap('add', 4.6), 5);
  });
});

test('difficultyMultiplierForRange', async (t) => {
  await t.test('is 1x at or below the easy ceiling', () => {
    assert.equal(difficultyMultiplierForRange('add', { min: 0, max: 5 }), 1);
    assert.equal(difficultyMultiplierForRange('add', { min: 0, max: 3 }), 1);
  });

  await t.test('scales up as the range grows toward the cap', () => {
    const mid = difficultyMultiplierForRange('add', { min: 0, max: 50 });
    const high = difficultyMultiplierForRange('add', { min: 0, max: 90 });
    assert.ok(mid > 1 && mid < high);
  });

  await t.test('is at its maximum at the operation range cap', () => {
    const atCap = difficultyMultiplierForRange('mul', { min: 0, max: RANGE_CAPS.mul.max });
    assert.equal(atCap, 3);
  });

  await t.test('never exceeds the maximum even past the cap', () => {
    const overCap = difficultyMultiplierForRange('mul', { min: 0, max: 999 });
    assert.equal(overCap, 3);
  });
});

test('updateFactStats', async (t) => {
  await t.test('starts fresh from null', () => {
    const stats = updateFactStats(null, { correct: true, elapsedMs: 2000, now: '2026-08-21T00:00:00.000Z' });
    assert.equal(stats.attempts, 1);
    assert.equal(stats.correct, 1);
    assert.equal(stats.avgTimeMs, 2000);
  });

  await t.test('accumulates and averages across attempts', () => {
    let stats = updateFactStats(null, { correct: true, elapsedMs: 1000 });
    stats = updateFactStats(stats, { correct: false, elapsedMs: 3000 });
    assert.equal(stats.attempts, 2);
    assert.equal(stats.correct, 1);
    assert.equal(stats.avgTimeMs, 2000);
  });

  await t.test('negative elapsed time is clamped to 0, not subtracted', () => {
    const stats = updateFactStats(null, { correct: true, elapsedMs: -500 });
    assert.equal(stats.totalTimeMs, 0);
  });
});

test('classifyMastery', async (t) => {
  await t.test('no attempts is "new"', () => {
    assert.equal(classifyMastery(null, 'add'), 'new');
    assert.equal(classifyMastery({ attempts: 0 }, 'add'), 'new');
  });

  await t.test('few attempts is "learning" even if all correct', () => {
    const stats = { attempts: 2, correct: 2, avgTimeMs: 1000 };
    assert.equal(classifyMastery(stats, 'add'), 'learning');
  });

  await t.test('low accuracy is "learning" regardless of attempt count', () => {
    const stats = { attempts: 10, correct: 4, avgTimeMs: 1000 };
    assert.equal(classifyMastery(stats, 'add'), 'learning');
  });

  await t.test('high accuracy but slow is "practiced", not "mastered"', () => {
    const stats = { attempts: 10, correct: 10, avgTimeMs: 5000 };
    assert.equal(classifyMastery(stats, 'add'), 'practiced');
  });

  await t.test('high accuracy and fast is "mastered"', () => {
    const stats = { attempts: 10, correct: 10, avgTimeMs: 1500 };
    assert.equal(classifyMastery(stats, 'add'), 'mastered');
  });

  await t.test('mastery time threshold is looser for multiplication/division', () => {
    const stats = { attempts: 10, correct: 10, avgTimeMs: 3500 };
    assert.equal(classifyMastery(stats, 'add'), 'practiced');
    assert.equal(classifyMastery(stats, 'mul'), 'mastered');
  });
});

test('rankFacts', async (t) => {
  await t.test('sorts weakest fact first', () => {
    const map = {
      'add:1+1': { attempts: 10, correct: 10, avgTimeMs: 1000 }, // mastered, low priority
      'add:9+9': { attempts: 10, correct: 3, avgTimeMs: 6000 }, // weak, high priority
    };
    const ranked = rankFacts(map);
    assert.equal(ranked[0].factKey, 'add:9+9');
    assert.equal(ranked[1].factKey, 'add:1+1');
  });

  await t.test('attaches operation and masteryLevel to each entry', () => {
    const ranked = rankFacts({ 'mul:2x2': { attempts: 5, correct: 5, avgTimeMs: 1000 } });
    assert.equal(ranked[0].operation, 'mul');
    assert.equal(ranked[0].masteryLevel, 'mastered');
  });

  await t.test('an empty map returns an empty array', () => {
    assert.deepEqual(rankFacts({}), []);
    assert.deepEqual(rankFacts(undefined), []);
  });
});

test('getRecommendedDifficulty', async (t) => {
  await t.test('recommends easy for a brand-new profile', () => {
    const recommended = getRecommendedDifficulty({ factStats: {} }, 'add');
    assert.equal(recommended, 'easy');
  });

  await t.test('recommends medium once the easy preset is mostly mastered', () => {
    const factStats = {};
    allFactKeysForPresetHelper('add', DIFFICULTY_PRESETS.add.easy).forEach((key) => {
      factStats[key] = { attempts: 10, correct: 10, avgTimeMs: 1000 };
    });
    const recommended = getRecommendedDifficulty({ factStats }, 'add');
    assert.equal(recommended, 'medium');
  });

  function allFactKeysForPresetHelper(operation, range) {
    return MathFactsCore.allFactKeysForPreset(operation, range);
  }
});

test('calculateSessionPoints', async (t) => {
  await t.test('no correct answers earns 0 points', () => {
    assert.equal(calculateSessionPoints({ correct: 0, incorrect: 5, avgResponseMs: 1000, difficultyMultiplier: 1 }), 0);
  });

  await t.test('a higher difficulty multiplier earns more points for the same correct count', () => {
    const easy = calculateSessionPoints({ correct: 10, incorrect: 0, avgResponseMs: 4000, difficultyMultiplier: 1 });
    const hard = calculateSessionPoints({ correct: 10, incorrect: 0, avgResponseMs: 4000, difficultyMultiplier: 3 });
    assert.ok(hard > easy);
  });

  await t.test('faster average response earns a speed bonus', () => {
    const slow = calculateSessionPoints({ correct: 10, incorrect: 0, avgResponseMs: 4000, difficultyMultiplier: 1.5 });
    const fast = calculateSessionPoints({ correct: 10, incorrect: 0, avgResponseMs: 1000, difficultyMultiplier: 1.5 });
    assert.ok(fast > slow);
  });

  await t.test('a missing multiplier defaults to 1x rather than throwing', () => {
    assert.equal(calculateSessionPoints({ correct: 10, incorrect: 0, avgResponseMs: 4000 }), 100);
  });
});

test('levelForPoints', async (t) => {
  await t.test('starts at level 1', () => {
    assert.equal(levelForPoints(0).level, 1);
    assert.equal(levelForPoints(499).level, 1);
  });

  await t.test('advances a level every 500 points', () => {
    assert.equal(levelForPoints(500).level, 2);
    assert.equal(levelForPoints(1000).level, 3);
  });

  await t.test('caps at the top title instead of running off the list', () => {
    const level = levelForPoints(1000000);
    assert.equal(level.level, 10);
    assert.equal(level.title, 'Math Legend');
    assert.equal(level.pointsToNextLevel, 0);
  });
});

test('updateStreak', async (t) => {
  await t.test('first ever session starts a streak of 1', () => {
    const streak = updateStreak(null, '2026-08-21', 0, 0);
    assert.equal(streak.current, 1);
    assert.equal(streak.longest, 1);
  });

  await t.test('practicing again the same day does not change the streak', () => {
    const streak = updateStreak('2026-08-21', '2026-08-21', 3, 5);
    assert.equal(streak.current, 3);
  });

  await t.test('practicing the very next day increments the streak', () => {
    const streak = updateStreak('2026-08-20', '2026-08-21', 3, 5);
    assert.equal(streak.current, 4);
    assert.equal(streak.longest, 5);
  });

  await t.test('a new current streak that beats the record raises longest too', () => {
    const streak = updateStreak('2026-08-20', '2026-08-21', 5, 5);
    assert.equal(streak.current, 6);
    assert.equal(streak.longest, 6);
  });

  await t.test('skipping a day resets the current streak but keeps the record', () => {
    const streak = updateStreak('2026-08-18', '2026-08-21', 10, 10);
    assert.equal(streak.current, 1);
    assert.equal(streak.longest, 10);
  });
});

test('evaluateBadges', async (t) => {
  await t.test('a blank profile earns nothing', () => {
    const badges = evaluateBadges({ sessionHistory: [], factStats: {}, badges: [], streak: { longest: 0 } });
    assert.deepEqual(badges, []);
  });

  await t.test('first completed session earns "first-session"', () => {
    const badges = evaluateBadges({
      sessionHistory: [{ correct: 5, incorrect: 0, accuracy: 1, avgResponseMs: 2500 }],
      factStats: {}, badges: [], streak: { longest: 0 },
    });
    assert.ok(badges.includes('first-session'));
  });

  await t.test('already-earned badges are not re-awarded', () => {
    const badges = evaluateBadges({
      sessionHistory: [{ correct: 5, incorrect: 0, accuracy: 1, avgResponseMs: 2500 }],
      factStats: {}, badges: [{ id: 'first-session', earnedAt: '2026-08-01T00:00:00.000Z' }],
      streak: { longest: 0 },
    });
    assert.ok(!badges.includes('first-session'));
  });

  await t.test('a 7-day streak earns "streak-7"', () => {
    const badges = evaluateBadges({ sessionHistory: [], factStats: {}, badges: [], streak: { longest: 7 } });
    assert.ok(badges.includes('streak-7'));
  });

  await t.test('mastering enough facts in an operation earns its mastery badge', () => {
    const factStats = {};
    for (let i = 0; i < 15; i++) {
      factStats[`mul:${i}x${i}`] = { attempts: 10, correct: 10, avgTimeMs: 1000 };
    }
    const badges = evaluateBadges({ sessionHistory: [], factStats, badges: [], streak: { longest: 0 } });
    assert.ok(badges.includes('multiplication-master'));
  });
});
