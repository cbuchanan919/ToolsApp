// Pure logic for the Math Facts Practice tool — no DOM access, so this file
// is loaded two ways: as a plain <script> in the browser (see index.html)
// and via require() from test/mathFacts.test.js. Keeping it framework-free
// like this means the fact generation/scoring/mastery rules only exist in
// one place instead of being reimplemented for tests.
(function (root) {
  'use strict';

  var OPERATIONS = ['add', 'sub', 'mul', 'div'];
  var OPERATION_LABELS = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };
  var OPERATION_SYMBOLS = { add: '+', sub: '−', mul: '×', div: '÷' };

  var DIFFICULTY_PRESETS = {
    add: { easy: { min: 0, max: 5 }, medium: { min: 0, max: 12 }, hard: { min: 0, max: 20 } },
    sub: { easy: { min: 0, max: 5 }, medium: { min: 0, max: 12 }, hard: { min: 0, max: 20 } },
    mul: { easy: { min: 0, max: 5 }, medium: { min: 0, max: 10 }, hard: { min: 0, max: 12 } },
    div: { easy: { min: 1, max: 5 }, medium: { min: 1, max: 10 }, hard: { min: 1, max: 12 } },
  };
  var DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

  // Outer bounds a custom range's min/max can be dragged to per operation —
  // generous enough for real practice while keeping fact cards/scoring sane.
  // div's min is floored at 1 so a divisor of 0 is never selectable.
  var RANGE_CAPS = {
    add: { min: 0, max: 100 },
    sub: { min: 0, max: 100 },
    mul: { min: 0, max: 25 },
    div: { min: 1, max: 25 },
  };

  // Average response time (ms) under which a fact counts as "fast enough"
  // to be mastered, alongside the accuracy bar in classifyMastery().
  var MASTERY_TIME_THRESHOLD_MS = { add: 3000, sub: 3000, mul: 4000, div: 4000 };
  var MASTERY_FACT_THRESHOLD = 15; // facts mastered before an operation-mastery badge fires
  var RECOMMENDATION_MASTERY_RATIO = 0.8; // fraction of the easier preset mastered before the next one is recommended

  var MAX_DIFFICULTY_MULTIPLIER = 3; // points multiplier at each operation's range cap
  var POINTS_PER_LEVEL = 500;
  var LEVEL_TITLES = [
    'Counting Cadet', 'Number Novice', 'Fact Finder', 'Arithmetic Ace', 'Calculation Captain',
    'Math Whiz', 'Equation Expert', 'Numbers Ninja', 'Calculation Commander', 'Math Legend',
  ];

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // ---------- fact generation ----------

  function generateFact(operation, range) {
    var min = range.min, max = range.max;
    if (operation === 'add') {
      var a = randInt(min, max), b = randInt(min, max);
      return { operation: operation, a: a, b: b, answer: a + b };
    }
    if (operation === 'sub') {
      // b first, then a >= b, so the result is always a non-negative whole number.
      var subB = randInt(min, max);
      var subA = randInt(subB, max);
      return { operation: operation, a: subA, b: subB, answer: subA - subB };
    }
    if (operation === 'mul') {
      var mulA = randInt(min, max), mulB = randInt(min, max);
      return { operation: operation, a: mulA, b: mulB, answer: mulA * mulB };
    }
    if (operation === 'div') {
      // Built from a divisor/quotient pair so the division is always exact —
      // this is a facts drill, not long division with remainders.
      var divisor = randInt(Math.max(min, 1), max);
      var quotient = randInt(min, max);
      return { operation: operation, a: divisor * quotient, b: divisor, answer: quotient };
    }
    throw new Error('Unknown operation: ' + operation);
  }

  function factKey(operation, a, b) {
    if (operation === 'add' || operation === 'mul') {
      var lo = Math.min(a, b), hi = Math.max(a, b);
      var sym = operation === 'add' ? '+' : 'x';
      return operation + ':' + lo + sym + hi;
    }
    var opSym = operation === 'sub' ? '-' : '/';
    return operation + ':' + a + opSym + b;
  }

  function operationFromFactKey(key) {
    return String(key).split(':')[0];
  }

  // Inverse of factKey() — reconstructs {operation, a, b, answer} from a
  // stored key. Used by Focus Mode to re-drill a specific weak fact rather
  // than only ever generating fresh random ones.
  function factFromKey(key) {
    var operation = operationFromFactKey(key);
    var sym = operation === 'add' ? '+' : operation === 'mul' ? 'x' : operation === 'sub' ? '-' : '/';
    var rest = String(key).slice(operation.length + 1);
    var idx = rest.indexOf(sym);
    var a = parseInt(rest.slice(0, idx), 10);
    var b = parseInt(rest.slice(idx + 1), 10);
    var answer;
    if (operation === 'add') answer = a + b;
    else if (operation === 'mul') answer = a * b;
    else if (operation === 'sub') answer = a - b;
    else answer = a / b;
    return { operation: operation, a: a, b: b, answer: answer };
  }

  function checkAnswer(fact, userAnswer) {
    var num = typeof userAnswer === 'number' ? userAnswer : parseFloat(userAnswer);
    return Number.isFinite(num) && num === fact.answer;
  }

  // Every unique fact in a preset's range, for computing mastery ratios
  // (getRecommendedDifficulty) without depending on what's actually been
  // attempted yet.
  function allFactKeysForPreset(operation, range) {
    var min = range.min, max = range.max;
    var keys = [];
    var a, b;
    if (operation === 'add' || operation === 'mul') {
      for (a = min; a <= max; a++) {
        for (b = a; b <= max; b++) keys.push(factKey(operation, a, b));
      }
    } else if (operation === 'sub') {
      for (b = min; b <= max; b++) {
        for (a = b; a <= max; a++) keys.push(factKey('sub', a, b));
      }
    } else if (operation === 'div') {
      var divisorMin = Math.max(min, 1);
      for (var divisor = divisorMin; divisor <= max; divisor++) {
        for (var quotient = min; quotient <= max; quotient++) {
          keys.push(factKey('div', divisor * quotient, divisor));
        }
      }
    }
    return keys;
  }

  // Clamps a single min/max value into an operation's allowed range-cap
  // bounds. Ordering (min <= max) is the caller's job, since which side
  // should give way depends on which field the person just edited.
  function clampToRangeCap(operation, value) {
    var caps = RANGE_CAPS[operation];
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) n = caps.min;
    return Math.min(caps.max, Math.max(caps.min, n));
  }

  // Points multiplier for a custom range: 1x at that operation's "easy"
  // ceiling, scaling continuously up to MAX_DIFFICULTY_MULTIPLIER at its
  // range cap, so scoring stays meaningful for any range chosen rather than
  // only for the three named presets.
  function difficultyMultiplierForRange(operation, range) {
    var baseline = DIFFICULTY_PRESETS[operation].easy.max;
    var cap = RANGE_CAPS[operation].max;
    if (range.max <= baseline || cap <= baseline) return 1;
    var ratio = Math.min(1, Math.max(0, (range.max - baseline) / (cap - baseline)));
    return 1 + ratio * (MAX_DIFFICULTY_MULTIPLIER - 1);
  }

  // ---------- per-fact stats & mastery ----------

  function updateFactStats(existing, attempt) {
    var prev = existing || { attempts: 0, correct: 0, totalTimeMs: 0, avgTimeMs: 0, lastPracticedAt: null };
    var attempts = prev.attempts + 1;
    var correct = prev.correct + (attempt.correct ? 1 : 0);
    var totalTimeMs = prev.totalTimeMs + Math.max(0, attempt.elapsedMs || 0);
    return {
      attempts: attempts,
      correct: correct,
      totalTimeMs: totalTimeMs,
      avgTimeMs: Math.round(totalTimeMs / attempts),
      lastPracticedAt: attempt.now || new Date().toISOString(),
    };
  }

  function classifyMastery(stats, operation) {
    if (!stats || !stats.attempts) return 'new';
    var accuracy = stats.correct / stats.attempts;
    if (stats.attempts < 5 || accuracy < 0.7) return 'learning';
    var threshold = MASTERY_TIME_THRESHOLD_MS[operation] || 3000;
    if (accuracy >= 0.95 && stats.avgTimeMs <= threshold) return 'mastered';
    return 'practiced';
  }

  function priorityScore(stats) {
    var accuracy = stats.attempts ? stats.correct / stats.attempts : 0;
    return (1 - accuracy) * 5000 + (stats.avgTimeMs || 0);
  }

  // Weakest-first ranking across every fact that's been attempted at least
  // once — drives both the results-screen table and Focus Mode selection.
  function rankFacts(factStatsMap) {
    var map = factStatsMap || {};
    return Object.keys(map).map(function (key) {
      var stats = map[key];
      var operation = operationFromFactKey(key);
      return Object.assign({}, stats, {
        factKey: key,
        operation: operation,
        masteryLevel: classifyMastery(stats, operation),
        priorityScore: priorityScore(stats),
      });
    }).sort(function (a, b) { return b.priorityScore - a.priorityScore; });
  }

  // Every difficulty is always selectable — this just says which one the
  // profile's mastery actually supports, so the UI can flag it as a
  // suggestion rather than gating anything.
  function getRecommendedDifficulty(profile, operation) {
    var presets = DIFFICULTY_PRESETS[operation];
    var factStats = (profile && profile.factStats) || {};
    var recommended = 'easy';
    for (var i = 1; i < DIFFICULTY_ORDER.length; i++) {
      var prevPreset = presets[DIFFICULTY_ORDER[i - 1]];
      var keys = allFactKeysForPreset(operation, prevPreset);
      var masteredCount = keys.filter(function (k) {
        return classifyMastery(factStats[k], operation) === 'mastered';
      }).length;
      var ratio = keys.length ? masteredCount / keys.length : 0;
      if (ratio >= RECOMMENDATION_MASTERY_RATIO) recommended = DIFFICULTY_ORDER[i];
      else break;
    }
    return recommended;
  }

  // ---------- points, levels, streaks ----------

  function calculateSessionPoints(session) {
    var correct = session.correct || 0;
    var multiplier = Number.isFinite(session.difficultyMultiplier) ? session.difficultyMultiplier : 1;
    var basePoints = correct * 10 * multiplier;
    var speedBonus = 0;
    if (correct > 0 && Number.isFinite(session.avgResponseMs)) {
      if (session.avgResponseMs < 1500) speedBonus = correct * 5 * multiplier;
      else if (session.avgResponseMs < 3000) speedBonus = correct * 2 * multiplier;
    }
    return Math.round(basePoints + speedBonus);
  }

  function levelForPoints(totalPoints) {
    var points = totalPoints || 0;
    var level = Math.min(LEVEL_TITLES.length, Math.floor(points / POINTS_PER_LEVEL) + 1);
    var pointsToNextLevel = level < LEVEL_TITLES.length ? (level * POINTS_PER_LEVEL) - points : 0;
    return { level: level, title: LEVEL_TITLES[level - 1], pointsToNextLevel: pointsToNextLevel };
  }

  function daysBetween(dateStrA, dateStrB) {
    var a = new Date(dateStrA + 'T00:00:00');
    var b = new Date(dateStrB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  // Dates are local "YYYY-MM-DD" strings, not timestamps, so practicing
  // twice in one day doesn't double-count and exactly one skipped day
  // resets the current streak (rather than being timezone/clock sensitive).
  function updateStreak(lastPracticeDateStr, todayDateStr, currentStreak, longestStreak) {
    var current = currentStreak || 0;
    var longest = longestStreak || 0;
    if (!lastPracticeDateStr) {
      current = 1;
    } else {
      var diff = daysBetween(lastPracticeDateStr, todayDateStr);
      if (diff === 1) current += 1;
      else if (diff > 1) current = 1;
      // diff === 0 (same day again) or diff < 0 (clock skew): leave current as-is.
    }
    if (current > longest) longest = current;
    return { current: current, longest: longest, lastPracticeDate: todayDateStr };
  }

  // ---------- badges ----------

  function totalLifetimeCorrect(profile) {
    var factStats = (profile && profile.factStats) || {};
    return Object.keys(factStats).reduce(function (sum, k) { return sum + (factStats[k].correct || 0); }, 0);
  }

  function masteredFactCount(profile, operation) {
    var factStats = (profile && profile.factStats) || {};
    return Object.keys(factStats).filter(function (k) {
      return operationFromFactKey(k) === operation && classifyMastery(factStats[k], operation) === 'mastered';
    }).length;
  }

  var OPERATION_MASTERY_BADGES = {
    add: { id: 'addition-ace', label: 'Addition Ace', description: 'Master ' + MASTERY_FACT_THRESHOLD + ' addition facts.' },
    sub: { id: 'subtraction-star', label: 'Subtraction Star', description: 'Master ' + MASTERY_FACT_THRESHOLD + ' subtraction facts.' },
    mul: { id: 'multiplication-master', label: 'Multiplication Master', description: 'Master ' + MASTERY_FACT_THRESHOLD + ' multiplication facts.' },
    div: { id: 'division-dynamo', label: 'Division Dynamo', description: 'Master ' + MASTERY_FACT_THRESHOLD + ' division facts.' },
  };

  var BADGE_DEFINITIONS = [
    { id: 'first-session', label: 'First Steps', description: 'Complete your first practice session.',
      check: function (p) { return (p.sessionHistory || []).length >= 1; } },
    { id: 'speedster', label: 'Speedster', description: 'Average under 2 seconds per fact in a session.',
      check: function (p) { return (p.sessionHistory || []).some(function (s) { return s.avgResponseMs < 2000; }); } },
    { id: 'perfect-round', label: 'Perfect Round', description: '100% accuracy in a session of 10+ facts.',
      check: function (p) { return (p.sessionHistory || []).some(function (s) { return s.accuracy === 1 && (s.correct + s.incorrect) >= 10; }); } },
    { id: 'streak-7', label: 'Week Warrior', description: 'Practice 7 days in a row.',
      check: function (p) { return (p.streak && p.streak.longest || 0) >= 7; } },
    { id: 'streak-30', label: 'Streak Champion', description: 'Practice 30 days in a row.',
      check: function (p) { return (p.streak && p.streak.longest || 0) >= 30; } },
    { id: 'century-club', label: 'Century Club', description: 'Answer 100 facts correctly, lifetime.',
      check: function (p) { return totalLifetimeCorrect(p) >= 100; } },
  ].concat(OPERATIONS.map(function (op) {
    var def = OPERATION_MASTERY_BADGES[op];
    return Object.assign({}, def, { check: function (p) { return masteredFactCount(p, op) >= MASTERY_FACT_THRESHOLD; } });
  }));

  function evaluateBadges(profile) {
    var earnedIds = {};
    (profile.badges || []).forEach(function (b) { earnedIds[b.id] = true; });
    return BADGE_DEFINITIONS.filter(function (b) { return !earnedIds[b.id] && b.check(profile); })
      .map(function (b) { return b.id; });
  }

  var MathFactsCore = {
    OPERATIONS: OPERATIONS,
    OPERATION_LABELS: OPERATION_LABELS,
    OPERATION_SYMBOLS: OPERATION_SYMBOLS,
    DIFFICULTY_PRESETS: DIFFICULTY_PRESETS,
    DIFFICULTY_ORDER: DIFFICULTY_ORDER,
    RANGE_CAPS: RANGE_CAPS,
    BADGE_DEFINITIONS: BADGE_DEFINITIONS,
    generateFact: generateFact,
    factKey: factKey,
    operationFromFactKey: operationFromFactKey,
    factFromKey: factFromKey,
    checkAnswer: checkAnswer,
    allFactKeysForPreset: allFactKeysForPreset,
    clampToRangeCap: clampToRangeCap,
    difficultyMultiplierForRange: difficultyMultiplierForRange,
    updateFactStats: updateFactStats,
    classifyMastery: classifyMastery,
    rankFacts: rankFacts,
    getRecommendedDifficulty: getRecommendedDifficulty,
    calculateSessionPoints: calculateSessionPoints,
    levelForPoints: levelForPoints,
    updateStreak: updateStreak,
    evaluateBadges: evaluateBadges,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathFactsCore;
  } else {
    root.MathFactsCore = MathFactsCore;
  }
})(typeof window !== 'undefined' ? window : this);
