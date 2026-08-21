# Prompt: Add a "Math Facts Practice" tool

Add a new tool, **Math Facts Practice**, to the `Education` category (alongside the existing Exam tool). It drills addition, subtraction, multiplication, and division facts, tracks per-fact response time and accuracy to rank which facts are and aren't mastered, and layers on points/levels, badges, and streaks for motivation.

## Placement & registration
- New folder: `public/tools/MathFacts/` (flat, like `public/tools/Exam/` — category is a landing-page grouping label, not a folder requirement).
- Register in `public/nav.js`'s `TOOLS` array: `id: "math-facts"`, `label: "Math Facts Practice"`, `href: "/tools/MathFacts/"`, `category: "Education"`, plus a one-line description.
- Follow the README's "Adding a new tool" checklist exactly: `<body data-tool="math-facts">`, `<div id="tools-nav-root"></div>` right after `<body>`, `theme-init.js` before any CSS, the IBM Plex Mono font links, and `styles.css` built only from `global.css`'s `--tools-*` tokens (no bespoke palette).
- Add a README section for the tool and document the new endpoints in the "Server / API" section, matching the existing bullet style.

## Testable core logic
Put all pure logic (no DOM) in one module co-located with the tool, e.g. `public/tools/MathFacts/mathFactsCore.js`, written as a dual-usable module (`module.exports` guarded by `typeof module !== 'undefined'`, like a UMD-lite) so it can be `<script>`-tagged in the browser *and* `require()`d directly from a Node test file — no server/lib duplication. Cover with `test/mathFacts.test.js` using Node's built-in test runner (`npm test`). Functions needed:

- `generateFact(operation, range)` → `{ operation, a, b, answer }`. Division facts must always resolve to whole numbers (generate from a multiplication pair, no remainders).
- `factKey(operation, a, b)` → stable id (e.g. `"mult:7x8"`), commutative-aware for `+`/`×` so `3+4` and `4+3` share a key.
- `checkAnswer(fact, userAnswer)` → boolean.
- `updateFactStats(existingStats, { correct, elapsedMs })` → new `{ attempts, correct, totalTimeMs, avgTimeMs, lastPracticedAt }` (rolling average, not just latest).
- `classifyMastery(stats, operation)` → `"new" | "learning" | "practiced" | "mastered"`, thresholds on accuracy % and avg response time (mastery time threshold can vary slightly by operation, e.g. tighter for addition than division).
- `rankFacts(factStatsMap)` → all practiced facts sorted weakest → strongest (combine accuracy and avg time into one priority score) — powers both the results-screen ranking table and "Focus Mode" (below).
- `calculateSessionPoints({ correct, incorrect, avgResponseMs, difficulty })` → speed-weighted points for one session.
- `levelForPoints(totalPoints)` → level number/title.
- `updateStreak(lastPracticeDateStr, todayDateStr, currentStreak, longestStreak)` → new `{ current, longest }`, using local calendar-date strings (not timestamps) so same-day repeats don't double-count and one skipped day resets `current`.
- `evaluateBadges(profileStats)` → array of newly-earned badge ids, given a seed set: first session completed, session avg <2s, 100% accuracy in a 10+ session, an operation fully mastered at a given difficulty, 7-day streak, 30-day streak, 100 lifetime correct answers.
- `getRecommendedDifficulty(profileStats, operation)` → the highest preset that operation's mastery supports (next preset is recommended once ~80% of the current preset's facts reach `"mastered"`). All presets stay selectable — this only flags a suggestion, it doesn't gate the dropdown.

## Data model & persistence (server-backed, like Life Goals Calendar)
- Anonymous profile id (`mf-<20 hex chars>`) generated client-side on first visit and kept in `localStorage`; actual data lives server-side as one JSON file per profile.
- `server/data/mathFactsProfiles/` — gitignored (add the entry to `.gitignore` with a comment matching the existing `server/data/calendars/` one).
- Profile shape:
  ```
  {
    id, userId: null, createdAt, updatedAt,
    totalPoints, level,
    streak: { current, longest, lastPracticeDate },
    badges: [{ id, earnedAt }],
    factStats: { "<factKey>": { attempts, correct, totalTimeMs, avgTimeMs, lastPracticedAt } },
    sessionHistory: [{ date, operation, difficulty, mode, correct, incorrect, accuracy, avgResponseMs, pointsEarned }]
  }
  ```
- `server/lib/mathFactsValidation.js` — a `validateProfile(payload)` mirroring `calendarValidation.js`'s shape/style; unit-test it in `test/mathFactsValidation.test.js`.
- `server/routes/mathFacts.js` — mirror `calendars.js`: id-format regex guard against path traversal, `GET /api/math-facts-profiles/:id`, `POST /api/math-facts-profiles`, `PUT /api/math-facts-profiles/:id`. Mount in `server/app.js` behind `requireAuth` like the other routes. Add route smoke tests to `test/routes.test.js`.

## Frontend flow
1. **Setup**: pick operation(s) (addition/subtraction/multiplication/division, or mixed = interleaved); pick a difficulty preset per operation from a dropdown (e.g. easy/medium/hard number ranges — all always selectable, with the mastery-recommended one flagged per `getRecommendedDifficulty`); pick session mode — **timed drill** (30/60/120s, answer as many as possible) or **fixed set** (10/20/50 facts, self-paced, each individually timed) — both selectable; optional **Focus Mode** toggle that weights fact selection toward the profile's weakest-ranked facts instead of uniform random.
2. **Practice**: one fact at a time, large numeric input, Enter/submit auto-advances, brief non-blocking correct/incorrect flash, running points + timer visible. Numeric keypad-friendly and usable on touch (on-screen number pad) since this is likely used by a kid on a tablet.
3. **Results**: accuracy, avg response time, points earned this session, updated total points/level, streak update, any newly-earned badges (small celebratory treatment), and a **fact mastery ranking table** for facts touched this session (and a link to the full lifetime ranking).
4. **Dashboard** (a tab or section, not necessarily a separate page): total points/level, current & longest streak, badges earned vs. locked, and the full lifetime fact-mastery ranking, filterable by operation — this is what actually answers "which facts still need work."

## Explicitly out of scope for v1
Negative numbers, fractions/decimals, and multi-digit long-form arithmetic — keep to single-digit-range whole-number facts per the configured preset. No multi-user auth (that's the deferred `userId` field's job later). No leaderboard against other users.

## Testing bar
`npm test` must cover: fact generation staying in range and division always exact; mastery classification thresholds; points/level math; streak edge cases (same day twice, one skipped day, date-boundary correctness using local date strings); badge evaluation; unlock logic; profile payload validation (malformed/missing/oversized rejected); and route smoke tests for the three new endpoints.
