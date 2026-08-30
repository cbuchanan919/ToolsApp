(function () {
  "use strict";

  var C = window.MathFactsCore;

  // Pre-login, this pointed at an anonymous profile on the server; now that
  // saving requires an account, it's kept only so a returning user's old
  // anonymous progress can be claimed onto their new account once (see
  // tryClaimLegacyAnonymousData below), then it's discarded.
  var ANON_PROFILE_ID_KEY = "math-facts-profile-id";

  var DEFAULT_PROFILE = { totalPoints: 0, streak: { current: 0, longest: 0, lastPracticeDate: null }, badges: [], factStats: {}, sessionHistory: [] };

  var BADGE_ICONS = {
    "first-session": "🎯", "speedster": "⚡", "perfect-round": "💯",
    "streak-7": "🔥", "streak-30": "🏆", "century-club": "💪",
    "addition-ace": "➕", "subtraction-star": "➖", "multiplication-master": "✖️", "division-dynamo": "➗",
  };
  var MASTERY_LABELS = { new: "New", learning: "Learning", practiced: "Practiced", mastered: "Mastered" };
  var TIMED_DURATIONS = [30, 60, 120];
  var FIXED_COUNTS = [10, 20, 50];

  function pad(n) { return String(n).padStart(2, "0"); }
  function todayDateStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function formatFactDisplay(fact) {
    return fact.a + " " + C.OPERATION_SYMBOLS[fact.operation] + " " + fact.b;
  }
  function formatFactKeyLabel(key) {
    return formatFactDisplay(C.factFromKey(key));
  }
  function formatSeconds(total) {
    var m = Math.floor(total / 60), s = total % 60;
    return m + ":" + pad(s);
  }
  function pct(n) { return Math.round((n || 0) * 100) + "%"; }

  // ---------- status bar (mirrors Life Goals Calendar's setStatus) ----------
  var statusDot = document.getElementById("mf-status-dot");
  var statusRight = document.getElementById("mf-status-right");
  function setStatus(mode) {
    if (mode === "saving") { statusDot.className = "tools-status-dot tools-status-dot--live"; statusRight.textContent = "saving…"; }
    else if (mode === "synced") { statusDot.className = "tools-status-dot tools-status-dot--ok"; statusRight.textContent = "synced"; }
    else if (mode === "save-error") { statusDot.className = "tools-status-dot"; statusRight.textContent = "save failed"; }
    else if (mode === "load-error") { statusDot.className = "tools-status-dot"; statusRight.textContent = "load failed"; }
    else if (mode === "guest") { statusDot.className = "tools-status-dot"; statusRight.textContent = "guest — log in to save"; }
    else { statusDot.className = "tools-status-dot"; statusRight.textContent = "idle"; }
  }

  // ---------- server-backed profile ----------
  // Every route here requires login (see server/routes/mathFacts.js) — no
  // login means no server round trip at all, just an in-memory profile
  // (see loadForCurrentAuthState below).
  async function describeFailedResponse(res) {
    try {
      var body = await res.json();
      if (Array.isArray(body.errors) && body.errors.length) return body.errors.join("; ");
    } catch (e) { /* body wasn't JSON */ }
    return res.status + " " + res.statusText;
  }

  async function fetchMyProfile() {
    var res = await fetch("/api/math-facts-profiles/me");
    if (!res.ok) throw new Error("GET /api/math-facts-profiles/me failed: " + await describeFailedResponse(res));
    return res.json();
  }

  // If this browser still has a pre-login anonymous profile id (from
  // before accounts existed), try to attach it to the now-logged-in
  // account once. Succeeds, is refused (409 — account already has real
  // progress), or the guest record is simply gone (404): either way
  // there's nothing more this key can do, so it's discarded after one
  // attempt. A network hiccup leaves it in place to retry on the next load.
  async function tryClaimLegacyAnonymousData() {
    var anonId = localStorage.getItem(ANON_PROFILE_ID_KEY);
    if (!anonId) return null;
    try {
      var res = await fetch("/api/math-facts-profiles/claim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymousId: anonId }),
      });
      localStorage.removeItem(ANON_PROFILE_ID_KEY);
      return res.ok ? res.json() : null;
    } catch (e) {
      console.warn("Math Facts Practice: couldn't claim legacy guest data (will retry next load) —", e);
      return null;
    }
  }

  // Set right before a save-triggered login prompt, so the tools:auth-changed
  // listener (which reloads from the server) doesn't race the save this
  // same login was for — see onAuthChanged below.
  var suppressNextAuthReload = false;

  // Prompts to log in first if needed — this is the "modal before save"
  // behavior for this tool, triggered once a practice session ends.
  async function saveProfileToServer(next) {
    if (!window.ToolsAuth.getUser()) {
      suppressNextAuthReload = true;
      try {
        await window.ToolsAuth.requireLogin("Log in to save your Math Facts progress");
      } catch (e) {
        suppressNextAuthReload = false;
        return; // modal was cancelled — nothing to save
      }
      // Claimed here as a side effect (attaches any legacy guest data to
      // the account); the PUT below always writes `next` — the session
      // just played — right after, so it's never lost to whatever claim
      // returns.
      await tryClaimLegacyAnonymousData();
    }

    setStatus("saving");
    try {
      var res = await fetch("/api/math-facts-profiles/me", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalPoints: next.totalPoints, streak: next.streak, badges: next.badges,
          factStats: next.factStats, sessionHistory: next.sessionHistory,
        }),
      });
      if (!res.ok) throw new Error("PUT /api/math-facts-profiles/me failed: " + await describeFailedResponse(res));
      setStatus("synced");
    } catch (e) {
      console.error("Math Facts Practice: save failed —", e);
      setStatus("save-error");
    }
  }

  // ---------- state ----------
  var profile = null;
  var screen = "setup"; // setup | practice | results | dashboard

  var selectedOperations = ["add"];
  var rangeByOp = {
    add: Object.assign({}, C.DIFFICULTY_PRESETS.add.easy),
    sub: Object.assign({}, C.DIFFICULTY_PRESETS.sub.easy),
    mul: Object.assign({}, C.DIFFICULTY_PRESETS.mul.easy),
    div: Object.assign({}, C.DIFFICULTY_PRESETS.div.easy),
  };
  var sessionMode = "timed"; // timed | fixed
  var timedSeconds = 60;
  var fixedCount = 20;
  var focusMode = false;

  var dashboardFilter = "all";

  // practice runtime
  var sessionActive = false;
  var currentFact = null;
  var factStartedAt = 0;
  var correctCount = 0, incorrectCount = 0;
  var factAttempts = []; // [{factKey, elapsedMs, correct}]
  var sessionFactStatsDelta = {};
  var lastResult = null; // "correct" | "incorrect" | null
  var submitting = false;
  var remainingSeconds = 0;
  var questionIndex = 0;
  var timerHandle = null;

  var lastSessionSummary = null;
  var newBadgesEarned = [];
  var rankedSessionFacts = [];

  function attemptedFactCount() { return Object.keys(profile.factStats || {}).length; }
  function focusModeAvailable() { return attemptedFactCount() >= 5; }

  function sessionMultiplierForScoring() {
    var best = 1;
    selectedOperations.forEach(function (op) {
      var m = C.difficultyMultiplierForRange(op, rangeByOp[op]);
      if (m > best) best = m;
    });
    return best;
  }

  // ---------- setup screen actions ----------
  function toggleOperation(op) {
    var idx = selectedOperations.indexOf(op);
    if (idx === -1) selectedOperations.push(op); else selectedOperations.splice(idx, 1);
    render();
  }
  function applyPreset(op, level) {
    rangeByOp[op] = Object.assign({}, C.DIFFICULTY_PRESETS[op][level]);
    render();
  }
  function setRangeMin(op, rawValue) {
    var clamped = C.clampToRangeCap(op, rawValue);
    var range = rangeByOp[op];
    rangeByOp[op] = { min: clamped, max: Math.max(clamped, range.max) };
    render();
  }
  function setRangeMax(op, rawValue) {
    var clamped = C.clampToRangeCap(op, rawValue);
    var range = rangeByOp[op];
    rangeByOp[op] = { min: Math.min(clamped, range.min), max: clamped };
    render();
  }
  function setSessionMode(mode) { sessionMode = mode; render(); }
  function setTimedSeconds(s) { timedSeconds = parseInt(s, 10); render(); }
  function setFixedCount(n) { fixedCount = parseInt(n, 10); render(); }
  function toggleFocusMode() { if (focusModeAvailable()) focusMode = !focusMode; render(); }

  // ---------- practice ----------
  function pickOperationForNextFact() {
    return selectedOperations[Math.floor(Math.random() * selectedOperations.length)];
  }

  function nextFact() {
    if (!sessionActive) return;
    var op = pickOperationForNextFact();
    var range = rangeByOp[op];
    var fact = null;

    if (focusMode) {
      var weak = C.rankFacts(profile.factStats).filter(function (f) {
        return f.operation === op && f.masteryLevel !== "mastered";
      }).slice(0, 10);
      if (weak.length) fact = C.factFromKey(weak[Math.floor(Math.random() * weak.length)].factKey);
    }
    if (!fact) fact = C.generateFact(op, range);

    currentFact = fact;
    factStartedAt = Date.now();
    lastResult = null;
    submitting = false;
    render();
    var input = document.getElementById("mf-answer-input");
    if (input) { input.value = ""; input.disabled = false; input.focus({ preventScroll: true }); }
  }

  function startSession() {
    if (!selectedOperations.length) return;
    correctCount = 0; incorrectCount = 0; factAttempts = []; sessionFactStatsDelta = {};
    lastResult = null; submitting = false;
    sessionActive = true;
    if (sessionMode === "timed") {
      remainingSeconds = timedSeconds;
      clearInterval(timerHandle);
      timerHandle = setInterval(tickTimer, 1000);
    } else {
      questionIndex = 0;
    }
    screen = "practice";
    nextFact();
    if (window.innerWidth <= 480) window.scrollTo(0, 0);
  }

  function tickTimer() {
    if (!sessionActive) { clearInterval(timerHandle); return; }
    remainingSeconds -= 1;
    var el = document.getElementById("mf-timer");
    if (el) el.textContent = formatSeconds(Math.max(0, remainingSeconds));
    if (remainingSeconds <= 0) { clearInterval(timerHandle); endSession(); }
  }

  function submitAnswer() {
    if (!sessionActive || !currentFact || submitting) return;
    var input = document.getElementById("mf-answer-input");
    var raw = input ? input.value : "";
    if (raw.trim() === "") return;

    submitting = true;
    if (input) input.disabled = true;

    var elapsedMs = Date.now() - factStartedAt;
    var correct = C.checkAnswer(currentFact, raw);
    var key = C.factKey(currentFact.operation, currentFact.a, currentFact.b);
    var baseline = sessionFactStatsDelta[key] || (profile.factStats && profile.factStats[key]) || null;
    sessionFactStatsDelta[key] = C.updateFactStats(baseline, { correct: correct, elapsedMs: elapsedMs });

    if (correct) correctCount += 1; else incorrectCount += 1;
    factAttempts.push({ factKey: key, elapsedMs: elapsedMs, correct: correct });
    lastResult = correct ? "correct" : "incorrect";

    var reachedFixedEnd = sessionMode === "fixed" && (questionIndex + 1) >= fixedCount;
    if (sessionMode === "fixed") questionIndex += 1;

    render();

    if (reachedFixedEnd) {
      setTimeout(function () { if (sessionActive) endSession(); }, 350);
    } else {
      setTimeout(function () { if (sessionActive) nextFact(); }, 350);
    }
  }

  function keypadPress(digit) {
    var input = document.getElementById("mf-answer-input");
    if (!input || input.disabled) return;
    input.value += digit;
    input.focus({ preventScroll: true });
  }
  function keypadBackspace() {
    var input = document.getElementById("mf-answer-input");
    if (!input || input.disabled) return;
    input.value = input.value.slice(0, -1);
    input.focus({ preventScroll: true });
  }

  function endSession() {
    if (!sessionActive) return;
    sessionActive = false;
    clearInterval(timerHandle);

    var totalAnswered = correctCount + incorrectCount;
    var avgResponseMs = factAttempts.length
      ? Math.round(factAttempts.reduce(function (s, a) { return s + a.elapsedMs; }, 0) / factAttempts.length)
      : 0;
    var accuracy = totalAnswered ? correctCount / totalAnswered : 0;
    var difficultyMultiplier = sessionMultiplierForScoring();
    var pointsEarned = C.calculateSessionPoints({ correct: correctCount, incorrect: incorrectCount, avgResponseMs: avgResponseMs, difficultyMultiplier: difficultyMultiplier });

    var mergedFactStats = Object.assign({}, profile.factStats, sessionFactStatsDelta);
    var newStreak = C.updateStreak(profile.streak.lastPracticeDate, todayDateStr(), profile.streak.current, profile.streak.longest);
    var ranges = {};
    selectedOperations.forEach(function (op) { ranges[op] = rangeByOp[op]; });
    var sessionRecord = {
      date: todayDateStr(), operations: selectedOperations.slice(), ranges: ranges, difficultyMultiplier: difficultyMultiplier, mode: sessionMode,
      correct: correctCount, incorrect: incorrectCount, accuracy: accuracy, avgResponseMs: avgResponseMs, pointsEarned: pointsEarned,
    };
    var newSessionHistory = profile.sessionHistory.concat([sessionRecord]).slice(-500);

    var candidate = Object.assign({}, profile, {
      factStats: mergedFactStats, totalPoints: profile.totalPoints + pointsEarned,
      streak: newStreak, sessionHistory: newSessionHistory,
    });
    var newBadgeIds = C.evaluateBadges(candidate);
    var newBadgeObjects = newBadgeIds.map(function (id) { return { id: id, earnedAt: new Date().toISOString() }; });
    candidate.badges = profile.badges.concat(newBadgeObjects);

    profile = candidate;
    lastSessionSummary = {
      correct: correctCount, incorrect: incorrectCount, accuracy: accuracy, avgResponseMs: avgResponseMs,
      pointsEarned: pointsEarned, difficultyMultiplier: difficultyMultiplier, mode: sessionMode, operations: selectedOperations.slice(),
    };
    newBadgesEarned = newBadgeIds.map(function (id) { return C.BADGE_DEFINITIONS.find(function (b) { return b.id === id; }); });
    rankedSessionFacts = C.rankFacts(sessionFactStatsDelta);

    screen = "results";
    render();
    saveProfileToServer(profile);
  }

  function endSessionEarly() { if (sessionActive) endSession(); }

  // ---------- render ----------
  function render() {
    var app = document.getElementById("app");
    if (screen === "setup") app.innerHTML = renderSetup();
    else if (screen === "practice") app.innerHTML = renderPractice();
    else if (screen === "results") app.innerHTML = renderResults();
    else if (screen === "dashboard") app.innerHTML = renderDashboard();
  }

  function renderProfileSummaryBar() {
    var level = C.levelForPoints(profile.totalPoints);
    return '<div class="mf-summary-row">' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Level</div><div class="mf-summary-value">' + level.level + ' · ' + level.title + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Points</div><div class="mf-summary-value">' + profile.totalPoints + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Streak</div><div class="mf-summary-value">🔥 ' + profile.streak.current + 'd</div></div>' +
      '<button class="mf-btn mf-btn--ghost" data-action="show-dashboard">Dashboard</button>' +
      '</div>';
  }

  function renderSetup() {
    var opsHtml = C.OPERATIONS.map(function (op) {
      var checked = selectedOperations.indexOf(op) !== -1;
      var recommended = C.getRecommendedDifficulty(profile, op);
      var range = rangeByOp[op];
      var caps = C.RANGE_CAPS[op];

      var presetHtml = C.DIFFICULTY_ORDER.map(function (level) {
        var preset = C.DIFFICULTY_PRESETS[op][level];
        var isActive = range.min === preset.min && range.max === preset.max;
        var isRecommended = level === recommended;
        return '<button type="button" class="mf-preset-btn' + (isActive ? " mf-preset-btn--active" : "") + '" ' +
          'data-action="apply-preset" data-op="' + op + '" data-level="' + level + '" ' +
          (isRecommended ? 'title="Recommended based on your mastery so far"' : '') + '>' +
          level.charAt(0).toUpperCase() + level.slice(1) + (isRecommended ? " ★" : "") + '</button>';
      }).join("");

      var rangeHtml = '<div class="mf-range-inputs">' +
        '<input type="number" class="mf-range-input" data-role="range-min" data-op="' + op + '" min="' + caps.min + '" max="' + caps.max + '" value="' + range.min + '" /> ' +
        '<span class="mf-range-to">to</span> ' +
        '<input type="number" class="mf-range-input" data-role="range-max" data-op="' + op + '" min="' + caps.min + '" max="' + caps.max + '" value="' + range.max + '" />' +
        '</div>';

      return '<div class="mf-op-row">' +
        '<label class="mf-op-check"><input type="checkbox" data-role="op-toggle" data-op="' + op + '" ' + (checked ? "checked" : "") + ' /> ' + C.OPERATION_LABELS[op] + '</label>' +
        (checked ? '<div class="mf-range-controls"><div class="mf-preset-row">' + presetHtml + '</div>' + rangeHtml + '</div>' : '') +
        '</div>';
    }).join("");

    var timedSelected = sessionMode === "timed";
    var durationOptions = TIMED_DURATIONS.map(function (s) {
      return '<option value="' + s + '" ' + (timedSeconds === s ? "selected" : "") + '>' + s + 's</option>';
    }).join("");
    var countOptions = FIXED_COUNTS.map(function (n) {
      return '<option value="' + n + '" ' + (fixedCount === n ? "selected" : "") + '>' + n + ' facts</option>';
    }).join("");

    var focusAvailable = focusModeAvailable();
    var focusHint = focusAvailable
      ? "Weight questions toward your weakest facts instead of pure random."
      : "Practice at least 5 facts first to unlock Focus Mode.";

    var canStart = selectedOperations.length > 0;

    return renderProfileSummaryBar() +
      '<div class="mf-card">' +
      '<div class="mf-eyebrow">education // practice</div>' +
      '<h1 class="mf-title">Math Facts Practice</h1>' +
      '<p class="mf-sub">Pick operations, a difficulty, and a session style, then drill.</p>' +

      '<div class="mf-field-label">Operations</div>' +
      '<div class="mf-op-list">' + opsHtml + '</div>' +

      '<div class="mf-field-label">Session</div>' +
      '<div class="mf-mode-row">' +
      '<label class="mf-radio"><input type="radio" name="mf-mode" data-role="mode" value="timed" ' + (timedSelected ? "checked" : "") + ' /> Timed drill</label>' +
      (timedSelected ? '<select class="mf-select" data-role="timed-seconds">' + durationOptions + '</select>' : '') +
      '</div>' +
      '<div class="mf-mode-row">' +
      '<label class="mf-radio"><input type="radio" name="mf-mode" data-role="mode" value="fixed" ' + (!timedSelected ? "checked" : "") + ' /> Fixed set</label>' +
      (!timedSelected ? '<select class="mf-select" data-role="fixed-count">' + countOptions + '</select>' : '') +
      '</div>' +

      '<div class="mf-field-label">Focus Mode</div>' +
      '<label class="mf-radio ' + (focusAvailable ? "" : "mf-radio--disabled") + '">' +
      '<input type="checkbox" data-role="focus-toggle" ' + (focusMode ? "checked" : "") + ' ' + (focusAvailable ? "" : "disabled") + ' /> Practice my weakest facts</label>' +
      '<div class="mf-hint">' + focusHint + '</div>' +

      '<button class="mf-btn mf-btn--primary mf-start-btn" data-action="start-session" ' + (canStart ? "" : "disabled") + '>Start practice</button>' +
      (canStart ? "" : '<div class="mf-hint">Pick at least one operation to start.</div>') +
      '</div>';
  }

  function renderPractice() {
    if (!currentFact) return '<div class="mf-card"><div class="mf-empty">Loading…</div></div>';
    var progressHtml = sessionMode === "timed"
      ? '<span id="mf-timer">' + formatSeconds(remainingSeconds) + '</span> remaining'
      : "Question " + (questionIndex + 1) + " of " + fixedCount;

    var flashClass = lastResult === "correct" ? "mf-fact-card--correct" : lastResult === "incorrect" ? "mf-fact-card--incorrect" : "";
    var feedbackHtml = lastResult === "correct" ? '<div class="mf-feedback mf-feedback--correct">✓ Correct!</div>'
      : lastResult === "incorrect" ? '<div class="mf-feedback mf-feedback--incorrect">✗ Answer: ' + currentFact.answer + '</div>' : "";

    var keypadHtml = ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(function (d) {
      return '<button class="mf-key" data-action="keypad" data-digit="' + d + '">' + d + '</button>';
    }).join("") +
      '<button class="mf-key" data-action="keypad-backspace">⌫</button>' +
      '<button class="mf-key" data-action="keypad" data-digit="0">0</button>' +
      '<button class="mf-key mf-key--submit" data-action="submit-answer">↵</button>';

    return '<div class="mf-practice-top">' +
      '<div class="mf-progress">' + progressHtml + '</div>' +
      '<div class="mf-live-score">✓ ' + correctCount + ' &nbsp; ✗ ' + incorrectCount + '</div>' +
      '<button class="mf-btn mf-btn--ghost" data-action="end-session-early">End session</button>' +
      '</div>' +
      '<div class="mf-fact-card ' + flashClass + '">' +
      '<div class="mf-fact">' + formatFactDisplay(currentFact) + ' = ?</div>' +
      '<input type="tel" inputmode="none" autocomplete="off" readonly id="mf-answer-input" class="mf-answer-input" placeholder="?" />' +
      feedbackHtml +
      '</div>' +
      '<div class="mf-keypad">' + keypadHtml + '</div>';
  }

  function renderResults() {
    var s = lastSessionSummary;
    var level = C.levelForPoints(profile.totalPoints);
    var badgesHtml = newBadgesEarned.length
      ? '<div class="mf-field-label">New badges!</div><div class="mf-badge-row">' +
        newBadgesEarned.map(function (b) {
          return '<div class="mf-badge mf-badge--earned" title="' + b.description + '"><span class="mf-badge-icon">' + (BADGE_ICONS[b.id] || "🏅") + '</span>' + b.label + '</div>';
        }).join("") + '</div>'
      : "";

    var rankedHtml = rankedSessionFacts.length
      ? '<div class="mf-field-label">This session\'s facts</div><div class="mf-table-wrap"><table class="mf-table">' +
        '<thead><tr><th>Fact</th><th>Mastery</th><th>Accuracy</th><th>Avg time</th></tr></thead><tbody>' +
        rankedSessionFacts.map(function (f) {
          return '<tr><td>' + formatFactKeyLabel(f.factKey) + '</td>' +
            '<td><span class="mf-pill mf-pill--' + f.masteryLevel + '">' + MASTERY_LABELS[f.masteryLevel] + '</span></td>' +
            '<td>' + pct(f.attempts ? f.correct / f.attempts : 0) + '</td>' +
            '<td>' + (f.avgTimeMs / 1000).toFixed(1) + 's</td></tr>';
        }).join("") + '</tbody></table></div>'
      : "";

    return '<div class="mf-card">' +
      '<div class="mf-eyebrow">session // complete</div>' +
      '<h1 class="mf-title">Nice work!</h1>' +
      '<div class="mf-summary-row">' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Correct</div><div class="mf-summary-value">' + s.correct + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Accuracy</div><div class="mf-summary-value">' + pct(s.accuracy) + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Avg time</div><div class="mf-summary-value">' + (s.avgResponseMs / 1000).toFixed(1) + 's</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Points earned</div><div class="mf-summary-value">+' + s.pointsEarned + '</div></div>' +
      '</div>' +
      '<div class="mf-hint">Now level ' + level.level + ' · ' + level.title + ' (' + profile.totalPoints + ' total points) · 🔥 ' + profile.streak.current + '-day streak</div>' +
      badgesHtml +
      rankedHtml +
      '<div class="mf-btn-row">' +
      '<button class="mf-btn mf-btn--primary" data-action="setup-again">Practice again</button>' +
      '<button class="mf-btn mf-btn--ghost" data-action="show-dashboard">View dashboard</button>' +
      '</div>' +
      '</div>';
  }

  function renderDashboard() {
    var level = C.levelForPoints(profile.totalPoints);
    var badgesHtml = C.BADGE_DEFINITIONS.map(function (b) {
      var earned = profile.badges.find(function (eb) { return eb.id === b.id; });
      return '<div class="mf-badge ' + (earned ? "mf-badge--earned" : "mf-badge--locked") + '" title="' + b.description + '">' +
        '<span class="mf-badge-icon">' + (BADGE_ICONS[b.id] || "🏅") + '</span>' + b.label + '</div>';
    }).join("");

    var filterOptions = ['all'].concat(C.OPERATIONS).map(function (op) {
      var label = op === "all" ? "All operations" : C.OPERATION_LABELS[op];
      return '<option value="' + op + '" ' + (dashboardFilter === op ? "selected" : "") + '>' + label + '</option>';
    }).join("");

    var ranked = C.rankFacts(profile.factStats).filter(function (f) {
      return dashboardFilter === "all" || f.operation === dashboardFilter;
    });

    var rankedHtml = ranked.length
      ? '<div class="mf-table-wrap"><table class="mf-table"><thead><tr><th>Fact</th><th>Mastery</th><th>Attempts</th><th>Accuracy</th><th>Avg time</th></tr></thead><tbody>' +
        ranked.slice(0, 100).map(function (f) {
          return '<tr><td>' + formatFactKeyLabel(f.factKey) + '</td>' +
            '<td><span class="mf-pill mf-pill--' + f.masteryLevel + '">' + MASTERY_LABELS[f.masteryLevel] + '</span></td>' +
            '<td>' + f.attempts + '</td>' +
            '<td>' + pct(f.attempts ? f.correct / f.attempts : 0) + '</td>' +
            '<td>' + (f.avgTimeMs / 1000).toFixed(1) + 's</td></tr>';
        }).join("") + '</tbody></table></div>' +
        (ranked.length > 100 ? '<div class="mf-hint">Showing the 100 weakest of ' + ranked.length + ' practiced facts.</div>' : "")
      : '<div class="mf-empty">No facts practiced yet — start a session to build your mastery ranking.</div>';

    return '<div class="mf-card">' +
      '<div class="mf-eyebrow">education // dashboard</div>' +
      '<h1 class="mf-title">Your progress</h1>' +
      '<div class="mf-summary-row">' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Level</div><div class="mf-summary-value">' + level.level + ' · ' + level.title + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Points</div><div class="mf-summary-value">' + profile.totalPoints + '</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Current streak</div><div class="mf-summary-value">🔥 ' + profile.streak.current + 'd</div></div>' +
      '<div class="mf-summary-stat"><div class="mf-summary-label">Best streak</div><div class="mf-summary-value">' + profile.streak.longest + 'd</div></div>' +
      '</div>' +
      '<div class="mf-field-label">Badges</div>' +
      '<div class="mf-badge-row">' + badgesHtml + '</div>' +
      '<div class="mf-field-label">Fact mastery ranking (weakest first)</div>' +
      '<select class="mf-select" data-role="dashboard-filter">' + filterOptions + '</select>' +
      rankedHtml +
      '<div class="mf-btn-row"><button class="mf-btn mf-btn--primary" data-action="setup-again">Back to practice</button></div>' +
      '</div>';
  }

  // ---------- event delegation ----------
  document.getElementById("app").addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.dataset.action;
    if (action === "start-session") startSession();
    else if (action === "submit-answer") submitAnswer();
    else if (action === "keypad") keypadPress(el.dataset.digit);
    else if (action === "keypad-backspace") keypadBackspace();
    else if (action === "end-session-early") endSessionEarly();
    else if (action === "setup-again") { screen = "setup"; render(); }
    else if (action === "show-dashboard") { screen = "dashboard"; render(); }
    else if (action === "apply-preset") applyPreset(el.dataset.op, el.dataset.level);
  });

  document.getElementById("app").addEventListener("change", function (e) {
    var role = e.target.dataset ? e.target.dataset.role : null;
    if (role === "op-toggle") toggleOperation(e.target.dataset.op);
    else if (role === "range-min") setRangeMin(e.target.dataset.op, e.target.value);
    else if (role === "range-max") setRangeMax(e.target.dataset.op, e.target.value);
    else if (role === "mode") setSessionMode(e.target.value);
    else if (role === "timed-seconds") setTimedSeconds(e.target.value);
    else if (role === "fixed-count") setFixedCount(e.target.value);
    else if (role === "focus-toggle") toggleFocusMode();
    else if (role === "dashboard-filter") { dashboardFilter = e.target.value; render(); }
  });

  document.getElementById("app").addEventListener("keydown", function (e) {
    if (!e.target || e.target.id !== "mf-answer-input") return;
    if (e.key === "Enter") { submitAnswer(); return; }
    if (e.key === "Backspace") { e.preventDefault(); keypadBackspace(); return; }
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); keypadPress(e.key); }
  });

  // ---------- init ----------
  // Logged in: load (and opportunistically claim legacy guest data into)
  // this user's real profile. Logged out: skip the network entirely and
  // run on a blank in-memory profile — nothing persists until they log in
  // (saveProfileToServer prompts for that itself, at end of session).
  async function loadForCurrentAuthState() {
    if (!window.ToolsAuth.getUser()) {
      profile = Object.assign({ id: null, userId: null }, JSON.parse(JSON.stringify(DEFAULT_PROFILE)));
      setStatus("guest");
      screen = "setup";
      render();
      return;
    }
    try {
      profile = (await tryClaimLegacyAnonymousData()) || (await fetchMyProfile());
      setStatus("synced");
    } catch (e) {
      console.error("Math Facts Practice: couldn't load your profile —", e);
      profile = Object.assign({ id: null, userId: null }, JSON.parse(JSON.stringify(DEFAULT_PROFILE)));
      setStatus("load-error");
    }
    screen = "setup";
    render();
  }

  function onAuthChanged() {
    if (suppressNextAuthReload) { suppressNextAuthReload = false; return; }
    loadForCurrentAuthState();
  }

  async function init() {
    document.getElementById("app").innerHTML = '<div class="mf-card"><div class="mf-empty">Loading…</div></div>';
    await window.ToolsAuth.ready;
    window.addEventListener("tools:auth-changed", onAuthChanged);
    await loadForCurrentAuthState();
  }

  init();
})();
