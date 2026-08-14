(function () {
  "use strict";

  // Practice exam runner: pick an exam bank, work through it in study or
  // test mode, then review results by domain.

  // ---------- state ----------
  const state = {
    manifest: null,        // { exams: [{file, label, uploaded?}] }
    examCache: {},          // file -> parsed exam JSON (avoids refetching on select + start)
    examMeta: null,           // { file, label }
    exam: null,                 // full exam JSON currently loaded
    mode: null,                   // "study" | "test"
    currentIndex: 0,
    answers: [],                    // [{ selected: [], checked: bool }]
    timer: {
      elapsedSeconds: 0,
      intervalId: null,
      active: false,
    },
  };

  // ---------- element refs ----------
  const el = {
    statusDot: document.getElementById("exam-status-dot"),
    topbarRight: document.getElementById("exam-topbar-right"),
    topbarLeft: document.getElementById("exam-topbar-left"),

    screenStart: document.getElementById("exam-screen-start"),
    screenQuestion: document.getElementById("exam-screen-question"),
    screenResults: document.getElementById("exam-screen-results"),
    screenError: document.getElementById("exam-screen-error"),

    examSelect: document.getElementById("exam-select"),
    examMetaLine: document.getElementById("exam-meta-line"),
    modeOptions: document.getElementById("exam-mode-options"),
    startBtn: document.getElementById("exam-start-btn"),
    startError: document.getElementById("exam-start-error"),

    uploadInput: document.getElementById("exam-upload-input"),
    uploadStatus: document.getElementById("exam-upload-status"),
    uploadErrors: document.getElementById("exam-upload-errors"),
    uploadedList: document.getElementById("exam-uploaded-list"),

    progressText: document.getElementById("exam-progress-text"),
    progressDomain: document.getElementById("exam-progress-domain"),
    progressFill: document.getElementById("exam-progress-fill"),
    timer: document.getElementById("exam-timer"),

    multiHint: document.getElementById("exam-multi-hint"),
    questionText: document.getElementById("exam-question-text"),
    options: document.getElementById("exam-options"),

    feedback: document.getElementById("exam-feedback"),
    feedbackResult: document.getElementById("exam-feedback-result"),
    feedbackExplanation: document.getElementById("exam-feedback-explanation"),
    feedbackTimeSensitive: document.getElementById("exam-feedback-timesensitive"),

    backBtn: document.getElementById("exam-back-btn"),
    checkBtn: document.getElementById("exam-check-btn"),
    nextBtn: document.getElementById("exam-next-btn"),

    resultsScore: document.getElementById("exam-results-score"),
    resultsPct: document.getElementById("exam-results-pct"),
    resultsTime: document.getElementById("exam-results-time"),
    resultsVerdict: document.getElementById("exam-results-verdict"),
    domainList: document.getElementById("exam-domain-list"),
    reviewList: document.getElementById("exam-review-list"),
    retakeBtn: document.getElementById("exam-retake-btn"),

    globalErrorText: document.getElementById("exam-global-error-text"),
    errorRetryBtn: document.getElementById("exam-error-retry-btn"),
  };

  // ============================================================
  // Screen switching
  // ============================================================
  function showScreen(name) {
    [el.screenStart, el.screenQuestion, el.screenResults, el.screenError].forEach((s) =>
      s.classList.remove("exam-screen--active")
    );
    const map = { start: el.screenStart, question: el.screenQuestion, results: el.screenResults, error: el.screenError };
    map[name].classList.add("exam-screen--active");
  }

  function setTopbarStatus(mode) {
    if (mode === "live") {
      el.statusDot.className = "tools-status-dot tools-status-dot--live";
      el.topbarRight.textContent = "in progress";
    } else if (mode === "done") {
      el.statusDot.className = "tools-status-dot tools-status-dot--ok";
      el.topbarRight.textContent = "complete";
    } else {
      el.statusDot.className = "tools-status-dot";
      el.topbarRight.textContent = "idle";
    }
  }

  function showGlobalError(message) {
    el.globalErrorText.textContent = message;
    showScreen("error");
    setTopbarStatus("idle");
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ============================================================
  // Init: load manifest
  // ============================================================
  async function init() {
    setTopbarStatus("idle");
    await loadManifest();
    populateExamSelect();
    renderUploadedList();
  }

  // Falls back to an empty exam list (rather than leaving state.manifest
  // null) so the rest of the UI can render normally and just show nothing
  // selectable, instead of crashing on a null dereference.
  async function loadManifest() {
    try {
      const res = await fetch("exams/manifest.json?t=" + Date.now());
      if (!res.ok) throw new Error("manifest fetch failed: " + res.status);
      const manifest = await res.json();
      if (!manifest || !Array.isArray(manifest.exams)) {
        throw new Error("manifest is missing an \"exams\" array");
      }
      state.manifest = manifest;
      return true;
    } catch (err) {
      state.manifest = { exams: [] };
      showGlobalError(
        "Couldn't load the exam list (exams/manifest.json). " +
          (err && err.message ? err.message : "Unknown error") +
          " — check that the file exists and is valid JSON."
      );
      return false;
    }
  }

  function populateExamSelect() {
    const previousValue = el.examSelect.value;
    el.examSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an exam…";
    el.examSelect.appendChild(placeholder);

    const exams = (state.manifest && state.manifest.exams) || [];
    const builtIn = exams.filter((e) => !e.uploaded);
    const uploaded = exams.filter((e) => e.uploaded);

    if (builtIn.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Built-in";
      builtIn.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e.file;
        opt.textContent = e.label || e.file;
        group.appendChild(opt);
      });
      el.examSelect.appendChild(group);
    }

    if (uploaded.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Uploaded";
      uploaded.forEach((e) => {
        const opt = document.createElement("option");
        opt.value = e.file;
        opt.textContent = e.label || e.file;
        group.appendChild(opt);
      });
      el.examSelect.appendChild(group);
    }

    if (previousValue && exams.some((e) => e.file === previousValue)) {
      el.examSelect.value = previousValue;
    }
  }

  el.examSelect.addEventListener("change", async () => {
    el.examMetaLine.hidden = true;
    updateStartBtnState();
    const file = el.examSelect.value;
    if (!file) return;
    try {
      const exam = await getExamByFile(file);
      showMetaForExam(exam);
    } catch (err) {
      // Meta preview is best-effort; a real error will surface again on Start.
    }
  });

  // Caches by filename so switching the dropdown back and forth, or the
  // meta-preview-then-Start sequence, doesn't refetch the same exam twice.
  async function getExamByFile(file) {
    if (state.examCache[file]) return state.examCache[file];
    const res = await fetch("exams/" + file + "?t=" + Date.now());
    if (!res.ok) throw new Error("exam fetch failed: " + res.status);
    const exam = await res.json();
    const validation = validateExamSchema(exam);
    if (!validation.valid) {
      throw new Error("Exam file failed validation: " + validation.errors[0]);
    }
    state.examCache[file] = exam;
    return exam;
  }

  function showMetaForExam(exam) {
    const author = exam.author && String(exam.author).trim() ? exam.author : null;
    const dateCreated = exam.dateCreated && String(exam.dateCreated).trim() ? exam.dateCreated : null;

    const authorHtml = author ? "<strong>" + escapeHtml(author) + "</strong>" : '<span class="exam-meta-flag">author unknown</span>';
    const dateHtml = dateCreated ? "<strong>" + escapeHtml(dateCreated) + "</strong>" : '<span class="exam-meta-flag">date unknown</span>';

    el.examMetaLine.innerHTML =
      "By " + authorHtml + " · Created " + dateHtml + " · " + exam.questions.length + " questions";
    el.examMetaLine.hidden = false;
  }

  // ============================================================
  // Schema validation (client-side; server re-validates independently)
  // ============================================================
  const REQUIRED_TOP_LEVEL = ["examTitle", "questions"];
  const VALID_TYPES = ["single", "multiple"];

  function validateExamSchema(obj) {
    const errors = [];

    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      return { valid: false, errors: ["Root of the file must be a JSON object, not " + describeType(obj) + "."] };
    }

    REQUIRED_TOP_LEVEL.forEach((key) => {
      if (!(key in obj)) errors.push('Missing required top-level field "' + key + '".');
    });

    if (obj.examTitle !== undefined && typeof obj.examTitle !== "string") {
      errors.push('"examTitle" must be a string.');
    }

    if (obj.domains !== undefined && (typeof obj.domains !== "object" || Array.isArray(obj.domains) || obj.domains === null)) {
      errors.push('"domains" must be an object mapping domain name to weight (e.g. {"Cloud Concepts": "25%"}), not an array.');
    }

    if (obj.author !== undefined && obj.author !== null && typeof obj.author !== "string") {
      errors.push('"author" must be a string if present.');
    }
    if (obj.dateCreated !== undefined && obj.dateCreated !== null && typeof obj.dateCreated !== "string") {
      errors.push('"dateCreated" must be a string if present (e.g. "2026-08-13").');
    }

    if (!Array.isArray(obj.questions)) {
      errors.push('"questions" must be an array.');
      return { valid: false, errors };
    }
    if (obj.questions.length === 0) {
      errors.push('"questions" array is empty — add at least one question.');
      return { valid: false, errors };
    }

    if (
      obj.totalQuestions !== undefined &&
      typeof obj.totalQuestions === "number" &&
      obj.totalQuestions !== obj.questions.length
    ) {
      errors.push(
        '"totalQuestions" (' + obj.totalQuestions + ") doesn't match the number of questions in the array (" + obj.questions.length + "). This won't block loading, but fix it for accuracy."
      );
    }

    const seenIds = new Set();

    obj.questions.forEach((q, i) => {
      const label = "Question " + (i + 1) + (q && q.id !== undefined ? " (id " + q.id + ")" : "");

      if (typeof q !== "object" || q === null || Array.isArray(q)) {
        errors.push(label + ": must be an object.");
        return;
      }

      if (q.id === undefined) {
        errors.push(label + ': missing "id".');
      } else if (seenIds.has(q.id)) {
        errors.push(label + ': duplicate "id" value (' + q.id + ") — ids should be unique.");
      } else {
        seenIds.add(q.id);
      }

      if (typeof q.domain !== "string" || !q.domain.trim()) {
        errors.push(label + ': missing or invalid "domain" (string).');
      }

      if (!VALID_TYPES.includes(q.type)) {
        errors.push(label + ': "type" must be "single" or "multiple", got ' + describeType(q.type) + ".");
      }

      if (typeof q.question !== "string" || !q.question.trim()) {
        errors.push(label + ': missing or empty "question" text.');
      }

      let optionLetters = [];
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push(label + ': "options" must be an array of at least 2 items.');
      } else {
        q.options.forEach((opt, oi) => {
          if (typeof opt !== "object" || opt === null) {
            errors.push(label + ": option " + (oi + 1) + " must be an object with letter/text.");
            return;
          }
          if (typeof opt.letter !== "string" || !opt.letter.trim()) {
            errors.push(label + ": option " + (oi + 1) + ' missing "letter".');
          } else {
            optionLetters.push(opt.letter);
          }
          if (typeof opt.text !== "string" || !opt.text.trim()) {
            errors.push(label + ": option " + (oi + 1) + ' missing "text".');
          }
        });
        const dupLetters = optionLetters.filter((l, idx) => optionLetters.indexOf(l) !== idx);
        if (dupLetters.length > 0) {
          errors.push(label + ": duplicate option letters (" + [...new Set(dupLetters)].join(", ") + ").");
        }
      }

      if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
        errors.push(label + ': "correctAnswers" must be a non-empty array of option letters.');
      } else {
        const invalidRefs = q.correctAnswers.filter((a) => !optionLetters.includes(a));
        if (invalidRefs.length > 0) {
          errors.push(label + ': "correctAnswers" references letters not present in "options": ' + invalidRefs.join(", ") + ".");
        }
        if (q.type === "single" && q.correctAnswers.length !== 1) {
          errors.push(label + ': type is "single" but "correctAnswers" has ' + q.correctAnswers.length + " entries — it must have exactly 1.");
        }
      }

      if (q.explanation !== undefined && q.explanation !== null && typeof q.explanation !== "string") {
        errors.push(label + ': "explanation" must be a string.');
      }

      if (q.timeSensitive !== undefined && typeof q.timeSensitive !== "boolean") {
        errors.push(label + ': "timeSensitive" must be true or false.');
      }
    });

    return { valid: errors.length === 0, errors };
  }

  function describeType(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (Array.isArray(v)) return "an array";
    return typeof v;
  }

  // ============================================================
  // Upload — validated client-side, then saved server-side into exams/
  // ============================================================
  // Validates client-side first (instant feedback, no round trip for an
  // obviously-broken file), then POSTs to the server, which re-validates
  // independently and is the one that actually writes to disk.
  el.uploadInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    el.uploadStatus.hidden = true;
    el.uploadErrors.hidden = true;

    let text;
    try {
      text = await file.text();
    } catch (err) {
      showUploadErrors(["Couldn't read the file from disk. Try re-selecting it."]);
      el.uploadInput.value = "";
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      showUploadErrors(["File is not valid JSON: " + err.message]);
      el.uploadInput.value = "";
      return;
    }

    const result = validateExamSchema(parsed);
    if (!result.valid) {
      showUploadErrors(result.errors);
      el.uploadInput.value = "";
      return;
    }

    el.uploadStatus.textContent = "Saving to server …";
    el.uploadStatus.hidden = false;

    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, exam: parsed }),
      });

      let body;
      try {
        body = await res.json();
      } catch (parseErr) {
        throw new Error("server response wasn't JSON — is the Node server (npm start) running?");
      }

      if (!res.ok || !body.success) {
        showUploadErrors(body.errors || ["Server rejected the upload (status " + res.status + ")."]);
        el.uploadStatus.hidden = true;
        el.uploadInput.value = "";
        return;
      }

      // Saved on disk — refresh the manifest so the new file shows up.
      await loadManifest();
      populateExamSelect();
      renderUploadedList();
      state.examCache[body.file] = parsed;

      el.examSelect.value = body.file;
      showMetaForExam(parsed);
      updateStartBtnState();

      el.uploadStatus.textContent = 'Saved "' + body.file + '" to the server.';
      el.uploadStatus.hidden = false;
    } catch (err) {
      showUploadErrors([
        "Couldn't reach the server to save the file. " +
          (err && err.message ? err.message : "") +
          " Make sure the Node server is running (\"npm start\"), which is required for uploads to write to disk.",
      ]);
      el.uploadStatus.hidden = true;
    }
    el.uploadInput.value = "";
  });

  function showUploadErrors(errors) {
    const cap = errors.slice(0, 12);
    el.uploadErrors.innerHTML =
      "<div>Couldn't save that file — " + cap.length + (errors.length > cap.length ? "+" : "") + " issue(s):</div><ul>" +
      cap.map((e) => "<li>" + escapeHtml(e) + "</li>").join("") +
      "</ul>";
    el.uploadErrors.hidden = false;
  }

  function renderUploadedList() {
    el.uploadedList.innerHTML = "";
    const uploaded = ((state.manifest && state.manifest.exams) || []).filter((e) => e.uploaded);
    if (uploaded.length === 0) return;

    uploaded.forEach((u) => {
      const row = document.createElement("div");
      row.className = "exam-uploaded-row";

      const info = document.createElement("div");
      info.className = "exam-uploaded-row-info";
      const name = document.createElement("div");
      name.className = "exam-uploaded-row-name";
      name.textContent = u.label || u.file;
      const meta = document.createElement("div");
      meta.className = "exam-uploaded-row-meta";
      meta.textContent = "exams/" + u.file;
      info.appendChild(name);
      info.appendChild(meta);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "exam-uploaded-remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        removeBtn.disabled = true;
        removeBtn.textContent = "Removing…";
        try {
          const res = await fetch("/api/exams/" + encodeURIComponent(u.file), { method: "DELETE" });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.success) {
            throw new Error((body.errors && body.errors[0]) || "Server error");
          }
          delete state.examCache[u.file];
          if (el.examSelect.value === u.file) {
            el.examSelect.value = "";
            el.examMetaLine.hidden = true;
            updateStartBtnState();
          }
          await loadManifest();
          populateExamSelect();
          renderUploadedList();
        } catch (err) {
          removeBtn.disabled = false;
          removeBtn.textContent = "Remove";
          el.uploadStatus.hidden = true;
          showUploadErrors(["Couldn't remove " + u.file + ". " + (err && err.message ? err.message : "")]);
        }
      });

      row.appendChild(info);
      row.appendChild(removeBtn);
      el.uploadedList.appendChild(row);
    });
  }

  // ============================================================
  // Start screen: mode selection + start
  // ============================================================
  let selectedMode = null;

  el.modeOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".exam-mode-btn");
    if (!btn) return;
    selectedMode = btn.dataset.mode;
    Array.from(el.modeOptions.children).forEach((c) => c.classList.toggle("exam-mode-btn--selected", c === btn));
    updateStartBtnState();
  });

  function updateStartBtnState() {
    el.startBtn.disabled = !(el.examSelect.value && selectedMode);
  }

  el.startBtn.addEventListener("click", async () => {
    const file = el.examSelect.value;
    if (!file) return;
    const manifestEntry = (state.manifest.exams || []).find((e) => e.file === file);

    el.startError.hidden = true;
    el.startBtn.disabled = true;
    el.startBtn.textContent = "Loading…";

    try {
      const exam = await getExamByFile(file);
      state.examMeta = { file, label: manifestEntry ? manifestEntry.label : file };
      state.exam = exam;
      state.mode = selectedMode;
      state.currentIndex = 0;
      state.answers = exam.questions.map(() => ({ selected: [], checked: false }));
      startExam();
    } catch (err) {
      el.startError.textContent = "Couldn't load that exam. " + (err && err.message ? err.message : "Unknown error");
      el.startError.hidden = false;
    } finally {
      el.startBtn.textContent = "Start Exam";
      updateStartBtnState();
    }
  });

  // ============================================================
  // Timer — counts up only while the tab is focused and visible
  // ============================================================
  // The timer only counts up while this tab is visible and focused, so
  // switching away to look something up doesn't inflate the recorded time.
  function isPageActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function renderTimer() {
    if (el.timer) {
      el.timer.textContent = formatTime(state.timer.elapsedSeconds);
      el.timer.classList.toggle("exam-timer--paused", !state.timer.active);
    }
  }

  function startTimer() {
    stopTimer();
    state.timer.elapsedSeconds = 0;
    state.timer.active = isPageActive();
    renderTimer();
    state.timer.intervalId = setInterval(() => {
      state.timer.active = isPageActive();
      if (state.timer.active) {
        state.timer.elapsedSeconds += 1;
      }
      renderTimer();
    }, 1000);
  }

  function stopTimer() {
    if (state.timer.intervalId) {
      clearInterval(state.timer.intervalId);
      state.timer.intervalId = null;
    }
  }

  ["visibilitychange", "focus", "blur"].forEach((evt) => {
    window.addEventListener(evt, () => {
      state.timer.active = isPageActive();
      renderTimer();
    });
  });

  // ============================================================
  // Exam flow
  // ============================================================
  function startExam() {
    setTopbarStatus("live");
    showScreen("question");
    el.checkBtn.hidden = state.mode !== "study";
    startTimer();
    renderQuestion();
  }

  function currentQuestion() {
    return state.exam.questions[state.currentIndex];
  }

  function renderQuestion() {
    const q = currentQuestion();
    const total = state.exam.questions.length;
    const answer = state.answers[state.currentIndex];

    el.progressText.textContent = "Question " + (state.currentIndex + 1) + " of " + total;
    el.progressDomain.textContent = q.domain || "";
    el.progressFill.style.width = Math.round(((state.currentIndex + 1) / total) * 100) + "%";

    el.multiHint.hidden = q.type !== "multiple";
    el.questionText.textContent = q.question;

    el.backBtn.disabled = state.currentIndex === 0;

    const locked = state.mode === "study" && answer.checked;
    renderOptions(q, answer, locked);
    renderFeedback(q, answer, locked);
    updateNavButtons(q, answer, locked);
  }

  function renderOptions(q, answer, locked) {
    el.options.innerHTML = "";
    q.options.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "exam-option";
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", locked ? "-1" : "0");

      const isSelected = answer.selected.includes(opt.letter);
      if (isSelected) row.classList.add("exam-option--selected");

      if (locked) {
        row.classList.add("exam-option--locked");
        const isCorrect = q.correctAnswers.includes(opt.letter);
        if (isCorrect) {
          row.classList.remove("exam-option--selected");
          row.classList.add("exam-option--correct");
        } else if (isSelected && !isCorrect) {
          row.classList.remove("exam-option--selected");
          row.classList.add("exam-option--incorrect");
        }
      }

      const marker = document.createElement("div");
      marker.className = "exam-option-marker";
      marker.textContent = opt.letter;

      const text = document.createElement("div");
      text.className = "exam-option-text";
      text.textContent = opt.text;

      row.appendChild(marker);
      row.appendChild(text);

      if (!locked) {
        const activate = () => toggleSelect(q, opt.letter);
        row.addEventListener("click", activate);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        });
      }

      el.options.appendChild(row);
    });
  }

  // "single" questions replace the selection; "multiple" toggles the
  // clicked letter in/out of it.
  function toggleSelect(q, letter) {
    const answer = state.answers[state.currentIndex];
    if (q.type === "single") {
      answer.selected = [letter];
    } else {
      const idx = answer.selected.indexOf(letter);
      if (idx === -1) answer.selected.push(letter);
      else answer.selected.splice(idx, 1);
    }
    renderQuestion();
  }

  function renderFeedback(q, answer, locked) {
    if (state.mode !== "study" || !locked) {
      el.feedback.hidden = true;
      return;
    }
    el.feedback.hidden = false;
    const isCorrect = answersMatch(answer.selected, q.correctAnswers);
    el.feedbackResult.textContent = isCorrect ? "Correct" : "Incorrect";
    el.feedbackResult.className = "exam-feedback-result " + (isCorrect ? "exam-feedback-result--correct" : "exam-feedback-result--incorrect");
    el.feedbackExplanation.textContent = q.explanation || "";
    el.feedbackTimeSensitive.hidden = !q.timeSensitive;
  }

  // Study mode shows "Check" until answered, then swaps to "Next"; test
  // mode skips the check step entirely and just enables "Next" once
  // something's selected — this is where the two modes' flows diverge.
  function updateNavButtons(q, answer, locked) {
    const hasSelection = answer.selected.length > 0;
    const isLast = state.currentIndex === state.exam.questions.length - 1;

    if (state.mode === "study") {
      if (!answer.checked) {
        el.checkBtn.hidden = false;
        el.checkBtn.disabled = !hasSelection;
        el.nextBtn.hidden = true;
      } else {
        el.checkBtn.hidden = true;
        el.nextBtn.hidden = false;
        el.nextBtn.disabled = false;
        el.nextBtn.textContent = isLast ? "Finish Exam" : "Next";
      }
    } else {
      el.checkBtn.hidden = true;
      el.nextBtn.hidden = false;
      el.nextBtn.disabled = !hasSelection;
      el.nextBtn.textContent = isLast ? "Finish Exam" : "Next";
    }
  }

  el.checkBtn.addEventListener("click", () => {
    const answer = state.answers[state.currentIndex];
    if (answer.selected.length === 0) return;
    answer.checked = true;
    renderQuestion();
  });

  el.nextBtn.addEventListener("click", () => {
    const isLast = state.currentIndex === state.exam.questions.length - 1;
    if (isLast) {
      finishExam();
      return;
    }
    state.currentIndex += 1;
    renderQuestion();
  });

  el.backBtn.addEventListener("click", () => {
    if (state.currentIndex === 0) return;
    state.currentIndex -= 1;
    renderQuestion();
  });

  // Order shouldn't matter for multi-select questions, so both arrays are
  // sorted before comparing.
  function answersMatch(selected, correct) {
    if (selected.length !== correct.length) return false;
    const a = [...selected].sort();
    const b = [...correct].sort();
    return a.every((v, i) => v === b[i]);
  }

  // ============================================================
  // Results
  // ============================================================
  // Tallies the overall score and a per-domain breakdown in one pass over
  // the answered questions, then hands off to the results/review renderers.
  function finishExam() {
    stopTimer();
    setTopbarStatus("done");
    const questions = state.exam.questions;
    let correctCount = 0;
    const domainTally = {};

    questions.forEach((q, i) => {
      const answer = state.answers[i];
      const isCorrect = answersMatch(answer.selected, q.correctAnswers);
      if (isCorrect) correctCount += 1;

      const d = q.domain || "General";
      if (!domainTally[d]) domainTally[d] = { correct: 0, total: 0 };
      domainTally[d].total += 1;
      if (isCorrect) domainTally[d].correct += 1;
    });

    const total = questions.length;
    const pct = Math.round((correctCount / total) * 100);

    el.resultsScore.textContent = correctCount + " / " + total;
    el.resultsPct.textContent = pct + "%";
    el.resultsTime.textContent = "Time: " + formatTime(state.timer.elapsedSeconds);
    el.resultsVerdict.textContent = pct >= 70 ? "Passing range" : "Below target";
    el.resultsVerdict.className = "exam-results-verdict " + (pct >= 70 ? "exam-results-verdict--pass" : "exam-results-verdict--fail");

    renderDomainBreakdown(domainTally);
    renderReview(questions);
    showScreen("results");
  }

  function renderDomainBreakdown(domainTally) {
    el.domainList.innerHTML = "";
    Object.keys(domainTally).forEach((domain) => {
      const { correct, total } = domainTally[domain];
      const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

      const row = document.createElement("div");
      row.className = "exam-domain-row";

      const top = document.createElement("div");
      top.className = "exam-domain-row-top";
      const label = document.createElement("span");
      label.textContent = domain;
      const score = document.createElement("span");
      score.className = "exam-domain-row-score";
      score.textContent = correct + "/" + total + " (" + pct + "%)";
      top.appendChild(label);
      top.appendChild(score);

      const track = document.createElement("div");
      track.className = "exam-domain-track";
      const fill = document.createElement("div");
      fill.className = "exam-domain-fill";
      fill.style.width = pct + "%";
      track.appendChild(fill);

      row.appendChild(top);
      row.appendChild(track);
      el.domainList.appendChild(row);
    });
  }

  function renderReview(questions) {
    el.reviewList.innerHTML = "";
    questions.forEach((q, i) => {
      const answer = state.answers[i];
      const isCorrect = answersMatch(answer.selected, q.correctAnswers);

      const item = document.createElement("div");
      item.className = "exam-review-item " + (isCorrect ? "exam-review-item--correct" : "exam-review-item--incorrect");

      const top = document.createElement("div");
      top.className = "exam-review-top";
      const domainSpan = document.createElement("span");
      domainSpan.textContent = "Q" + (i + 1) + " — " + (q.domain || "");
      const badge = document.createElement("span");
      badge.className = "exam-review-badge " + (isCorrect ? "exam-review-badge--correct" : "exam-review-badge--incorrect");
      badge.textContent = isCorrect ? "Correct" : "Incorrect";
      top.appendChild(domainSpan);
      top.appendChild(badge);

      const questionText = document.createElement("p");
      questionText.className = "exam-review-question";
      questionText.textContent = q.question;

      const answersDiv = document.createElement("div");
      answersDiv.className = "exam-review-answers";

      const optionLookup = {};
      q.options.forEach((o) => (optionLookup[o.letter] = o.text));

      const yourAnswerText = answer.selected.length > 0
        ? answer.selected.map((l) => l + ". " + optionLookup[l]).join("; ")
        : "(no answer selected)";
      const correctAnswerText = q.correctAnswers.map((l) => l + ". " + optionLookup[l]).join("; ");

      const yourLine = document.createElement("div");
      const yourLabel = document.createElement("span");
      yourLabel.className = "exam-review-answers-label";
      yourLabel.textContent = "Your answer: ";
      const yourValue = document.createElement("span");
      yourValue.className = isCorrect ? "exam-review-your-answer--right" : "exam-review-your-answer--wrong";
      yourValue.textContent = yourAnswerText;
      yourLine.appendChild(yourLabel);
      yourLine.appendChild(yourValue);

      const correctLine = document.createElement("div");
      const correctLabel = document.createElement("span");
      correctLabel.className = "exam-review-answers-label";
      correctLabel.textContent = "Correct answer: ";
      const correctValue = document.createElement("span");
      correctValue.className = "exam-review-correct-answer";
      correctValue.textContent = correctAnswerText;
      correctLine.appendChild(correctLabel);
      correctLine.appendChild(correctValue);

      answersDiv.appendChild(yourLine);
      answersDiv.appendChild(correctLine);

      const explanation = document.createElement("p");
      explanation.className = "exam-review-explanation";
      explanation.textContent = q.explanation || "";

      item.appendChild(top);
      item.appendChild(questionText);
      item.appendChild(answersDiv);
      item.appendChild(explanation);

      if (q.timeSensitive) {
        const ts = document.createElement("div");
        ts.className = "exam-review-timesensitive";
        ts.textContent = "⚠ This detail may change over time — verify against current docs.";
        item.appendChild(ts);
      }

      el.reviewList.appendChild(item);
    });
  }

  // ============================================================
  // Retake / reset
  // ============================================================
  el.retakeBtn.addEventListener("click", resetToStart);
  el.errorRetryBtn.addEventListener("click", async () => {
    await loadManifest();
    populateExamSelect();
    renderUploadedList();
    showScreen("start");
    setTopbarStatus("idle");
  });

  function resetToStart() {
    stopTimer();
    state.examMeta = null;
    state.exam = null;
    state.mode = null;
    state.currentIndex = 0;
    state.answers = [];
    state.timer.elapsedSeconds = 0;
    selectedMode = null;

    el.examSelect.value = "";
    el.examMetaLine.hidden = true;
    Array.from(el.modeOptions.children).forEach((c) => c.classList.remove("exam-mode-btn--selected"));
    updateStartBtnState();
    showScreen("start");
    setTopbarStatus("idle");
  }

  el.topbarLeft.addEventListener("click", () => {
    const examInProgress = el.screenQuestion.classList.contains("exam-screen--active");
    if (examInProgress && !window.confirm("Close this exam and return to the selection screen? Your progress will be lost.")) {
      return;
    }
    resetToStart();
  });

  // ============================================================
  // Go
  // ============================================================
  init();
})();
