(function () {
  "use strict";

  // Points at this browser's calendar on the server — the calendar's actual
  // data (goals/entries) no longer lives in localStorage, only this id does.
  const CALENDAR_ID_KEY = "life-goals-calendar-id";
  const COLOR_POOL = ["#e8a94c", "#4fa3e0", "#e2735a", "#9b8cf2", "#52c9a0", "#e0c14f", "#6ba8ff", "#f2789f"];
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DEFAULT_DATA = {
    goals: [
      { id: "spanish", name: "Spanish", color: COLOR_POOL[0] },
      { id: "coding", name: "Coding", color: COLOR_POOL[1] },
      { id: "job-hunting", name: "Job hunting", color: COLOR_POOL[2] },
    ],
    entries: {},
    selectedGoalId: "spanish",
  };

  function pad(n) { return String(n).padStart(2, "0"); }
  function toKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function nextColor(goals) {
    const used = new Set(goals.map((g) => g.color));
    const free = COLOR_POOL.find((c) => !used.has(c));
    return free || COLOR_POOL[goals.length % COLOR_POOL.length];
  }
  function buildGrid(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }
  function computeStreaks(doneSet) {
    if (doneSet.size === 0) return { current: 0, best: 0 };
    let cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!doneSet.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let current = 0;
    while (doneSet.has(toKey(cursor))) { current++; cursor.setDate(cursor.getDate() - 1); }
    const sorted = Array.from(doneSet).sort();
    let best = 0, run = 0, prevDate = null;
    for (const key of sorted) {
      const d = new Date(key + "T00:00:00");
      if (prevDate) {
        const diff = Math.round((d - prevDate) / 86400000);
        run = diff === 1 ? run + 1 : 1;
      } else run = 1;
      if (run > best) best = run;
      prevDate = d;
    }
    return { current, best };
  }

  // ---------- status bar ----------
  // Mirrors Exam's setTopbarStatus (.tools-status-dot / --live / --ok) —
  // meaningful here for the first time on a Finance/Personal-style tool
  // since this one actually has async server round trips to reflect.
  const statusDot = document.getElementById("ledger-status-dot");
  const statusRight = document.getElementById("ledger-status-right");
  function setStatus(mode) {
    if (mode === "saving") {
      statusDot.className = "tools-status-dot tools-status-dot--live";
      statusRight.textContent = "saving…";
    } else if (mode === "synced") {
      statusDot.className = "tools-status-dot tools-status-dot--ok";
      statusRight.textContent = "synced";
    } else if (mode === "error") {
      statusDot.className = "tools-status-dot";
      statusRight.textContent = "save failed";
    } else {
      statusDot.className = "tools-status-dot";
      statusRight.textContent = "idle";
    }
  }

  // ---------- server-backed calendar ----------
  let calendarId = null;
  let serverCalendarCount = null;

  async function fetchCalendarCount() {
    try {
      const res = await fetch("/api/calendars");
      if (!res.ok) return null;
      const all = await res.json();
      return Array.isArray(all) ? all.length : null;
    } catch (e) {
      return null;
    }
  }

  async function createCalendar(initial) {
    const res = await fetch("/api/calendars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initial),
    });
    if (!res.ok) throw new Error("create calendar failed: " + res.status);
    return res.json();
  }

  async function loadOwnCalendar() {
    const storedId = localStorage.getItem(CALENDAR_ID_KEY);
    if (storedId) {
      try {
        const res = await fetch("/api/calendars/" + storedId);
        if (res.ok) return res.json();
        // 404 (or invalid id) — the stored pointer is stale; fall through
        // and create a fresh calendar below instead of failing outright.
      } catch (e) {
        // network hiccup on the lookup — still try to create fresh below
      }
    }
    const created = await createCalendar(DEFAULT_DATA);
    localStorage.setItem(CALENDAR_ID_KEY, created.id);
    return created;
  }

  let saveFlagTimeout = null;
  function flashSave(msg) {
    const el = document.getElementById("save-flag");
    if (!el) return;
    el.textContent = msg;
    clearTimeout(saveFlagTimeout);
    saveFlagTimeout = setTimeout(() => { if (el) el.textContent = ""; }, 1200);
  }

  // Optimistic: updates local state and re-renders immediately (so the UI
  // feels as instant as the old localStorage version), then persists to the
  // server in the background. Callers don't need to await this.
  async function saveData(next) {
    data = next;
    render();
    setStatus("saving");
    try {
      const res = await fetch("/api/calendars/" + calendarId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: next.goals, entries: next.entries, selectedGoalId: next.selectedGoalId }),
      });
      if (!res.ok) throw new Error("save failed: " + res.status);
      setStatus("synced");
      flashSave("✓ saved");
    } catch (e) {
      setStatus("error");
      flashSave("save failed");
    }
  }

  let data = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let managing = false;
  let editingId = null;
  let confirmRemoveId = null;

  function render() {
    const app = document.getElementById("app");
    const goals = data.goals;
    const selectedGoal = goals.find((g) => g.id === data.selectedGoalId) || goals[0] || null;
    const doneMap = (selectedGoal && data.entries[selectedGoal.id]) || {};
    const doneSet = new Set(Object.keys(doneMap).filter((k) => doneMap[k]));
    const streaks = computeStreaks(doneSet);
    const totalDone = doneSet.size;

    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    const isFutureMonth = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());
    const daysInDisplayedMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthDenom = isCurrentMonth ? today.getDate() : (isFutureMonth ? 0 : daysInDisplayedMonth);
    const markedInMonth = Array.from(doneSet).filter((k) => k.startsWith(viewYear + "-" + pad(viewMonth + 1))).length;
    const monthPct = monthDenom ? Math.round((markedInMonth / monthDenom) * 100) : null;
    const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString("default", { month: "long" });
    const accent = selectedGoal ? selectedGoal.color : "var(--tools-muted)";

    const tabsHtml = goals.map((g) => {
      const active = selectedGoal && g.id === selectedGoal.id ? "active" : "";
      return '<button class="tab ' + active + '" style="border-color:' + (active ? g.color : 'var(--tools-line)') + '" data-action="select-goal" data-id="' + g.id + '"><span class="dot" style="background:' + g.color + '"></span>' + esc(g.name) + '</button>';
    }).join("") + '<button class="tab ghost" data-action="toggle-manage">' + (managing ? "Close" : "+ Manage goals") + '</button>';

    let manageHtml = "";
    if (managing) {
      const rows = goals.map((g) => {
        const nameCell = editingId === g.id
          ? '<input type="text" data-role="edit-input" data-id="' + g.id + '" value="' + esc(g.name) + '" style="flex:1" />'
          : '<span class="name">' + esc(g.name) + '</span>';
        const rightBtns = editingId === g.id
          ? '<button class="btn" data-action="save-edit" data-id="' + g.id + '">Save</button>'
          : '<button class="btn" data-action="start-edit" data-id="' + g.id + '">Rename</button>';
        const removeBtns = confirmRemoveId === g.id
          ? '<button class="btn danger" data-action="do-remove" data-id="' + g.id + '">Confirm</button><button class="btn" data-action="cancel-remove">Cancel</button>'
          : '<button class="btn" data-action="confirm-remove" data-id="' + g.id + '">Remove</button>';
        return '<div class="goal-row"><span class="dot" style="background:' + g.color + '"></span>' + nameCell + rightBtns + removeBtns + '</div>';
      }).join("");
      manageHtml = '<div class="manage-panel">' + rows +
        '<div class="add-row"><input type="text" id="new-goal-input" data-role="new-goal-input" placeholder="new goal name" /><button class="btn primary" data-action="add-goal">Add</button></div>' +
        '</div>';
    }

    let bodyHtml = "";
    if (!selectedGoal) {
      bodyHtml = '<div class="empty-state">No goals yet — open "Manage goals" above and add your first one.</div>';
    } else {
      const cells = buildGrid(viewYear, viewMonth);
      const cellsHtml = cells.map((day, i) => {
        if (day === null) return '<div class="cell empty"></div>';
        const d = new Date(viewYear, viewMonth, day);
        d.setHours(0, 0, 0, 0);
        const key = toKey(d);
        const marked = doneSet.has(key);
        const isFuture = d > today;
        const isToday = key === toKey(today);
        const cls = ["cell", isFuture ? "future" : "", isToday ? "today" : ""].filter(Boolean).join(" ");
        return '<button class="' + cls + '" data-action="toggle-day" data-day="' + day + '" ' + (isFuture ? "disabled" : "") + '>' +
          '<span class="daynum">' + day + '</span>' +
          (marked ? '<span class="pip" style="background:' + selectedGoal.color + '"></span>' : "") +
          '</button>';
      }).join("");

      bodyHtml =
        '<div class="stats-row">' +
          '<div class="stat"><div class="stat-label">Current streak</div><div class="stat-value" style="color:' + accent + '">' + streaks.current + 'd</div></div>' +
          '<div class="stat"><div class="stat-label">Best streak</div><div class="stat-value">' + streaks.best + 'd</div></div>' +
          '<div class="stat"><div class="stat-label">This month</div><div class="stat-value">' + (monthPct === null ? "—" : monthPct + "%") + '</div></div>' +
          '<div class="stat"><div class="stat-label">Total days</div><div class="stat-value">' + totalDone + '</div></div>' +
        '</div>' +
        '<div class="month-nav">' +
          '<button class="nav-btn" data-action="prev-month">‹</button>' +
          '<div class="month-label">' + monthLabel + ' ' + viewYear + '</div>' +
          (!isCurrentMonth ? '<button class="btn" data-action="jump-today">Today</button>' : '') +
          '<button class="nav-btn" data-action="next-month">›</button>' +
        '</div>' +
        '<div class="weekday-row">' + WEEKDAYS.map((w) => "<span>" + w + "</span>").join("") + '</div>' +
        '<div class="cal-grid">' + cellsHtml + '</div>';
    }

    const serverCountHtml = serverCalendarCount === null ? "" :
      '<div class="server-count">' + serverCalendarCount + (serverCalendarCount === 1 ? " calendar" : " calendars") + ' tracked on this server</div>';

    app.innerHTML =
      '<div class="header-row">' +
        '<div><div class="eyebrow">life goals // daily ledger</div><div class="title">Progress Ledger</div>' + serverCountHtml + '</div>' +
        '<div class="save-flag" id="save-flag"></div>' +
      '</div>' +
      '<div class="tabs">' + tabsHtml + '</div>' +
      manageHtml +
      bodyHtml;

    if (editingId) {
      const input = app.querySelector('[data-role="edit-input"][data-id="' + editingId + '"]');
      if (input) { input.focus(); input.select(); }
    }
  }

  function addGoal() {
    const input = document.getElementById("new-goal-input");
    const name = input ? input.value.trim() : "";
    if (!name) return;
    const id = "g-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const goal = { id: id, name: name, color: nextColor(data.goals) };
    const nextGoals = data.goals.concat([goal]);
    saveData(Object.assign({}, data, { goals: nextGoals, selectedGoalId: data.selectedGoalId || id }));
  }
  function saveEdit(id) {
    const input = document.querySelector('[data-role="edit-input"][data-id="' + id + '"]');
    const name = input ? input.value.trim() : "";
    editingId = null;
    if (!name) { render(); return; }
    const nextGoals = data.goals.map((g) => (g.id === id ? Object.assign({}, g, { name: name }) : g));
    saveData(Object.assign({}, data, { goals: nextGoals }));
  }
  function removeGoal(id) {
    const nextGoals = data.goals.filter((g) => g.id !== id);
    const nextEntries = Object.assign({}, data.entries);
    delete nextEntries[id];
    const nextSelected = data.selectedGoalId === id ? (nextGoals[0] ? nextGoals[0].id : null) : data.selectedGoalId;
    confirmRemoveId = null;
    saveData(Object.assign({}, data, { goals: nextGoals, entries: nextEntries, selectedGoalId: nextSelected }));
  }
  function toggleDay(day) {
    const goals = data.goals;
    const selectedGoal = goals.find((g) => g.id === data.selectedGoalId) || goals[0] || null;
    if (!selectedGoal) return;
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0, 0, 0, 0);
    if (d > today) return;
    const key = toKey(d);
    const goalEntries = Object.assign({}, data.entries[selectedGoal.id] || {});
    if (goalEntries[key]) delete goalEntries[key]; else goalEntries[key] = true;
    const nextEntries = Object.assign({}, data.entries);
    nextEntries[selectedGoal.id] = goalEntries;
    saveData(Object.assign({}, data, { entries: nextEntries }));
  }
  function changeMonth(delta) {
    let y = viewYear, m = viewMonth + delta;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    viewYear = y; viewMonth = m;
    render();
  }

  document.getElementById("app").addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === "select-goal") { saveData(Object.assign({}, data, { selectedGoalId: id })); }
    else if (action === "toggle-manage") { managing = !managing; render(); }
    else if (action === "start-edit") { editingId = id; render(); }
    else if (action === "save-edit") { saveEdit(id); }
    else if (action === "confirm-remove") { confirmRemoveId = id; render(); }
    else if (action === "cancel-remove") { confirmRemoveId = null; render(); }
    else if (action === "do-remove") { removeGoal(id); }
    else if (action === "add-goal") { addGoal(); }
    else if (action === "prev-month") { changeMonth(-1); }
    else if (action === "next-month") { changeMonth(1); }
    else if (action === "jump-today") { viewYear = today.getFullYear(); viewMonth = today.getMonth(); render(); }
    else if (action === "toggle-day") { toggleDay(parseInt(el.dataset.day, 10)); }
  });

  document.getElementById("app").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const role = e.target.dataset ? e.target.dataset.role : null;
    if (role === "new-goal-input") { addGoal(); }
    else if (role === "edit-input") { saveEdit(e.target.dataset.id); }
  });

  async function init() {
    document.getElementById("app").innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      const [calendar, count] = await Promise.all([loadOwnCalendar(), fetchCalendarCount()]);
      data = calendar;
      calendarId = calendar.id;
      serverCalendarCount = count;
      setStatus("synced");
    } catch (e) {
      data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      setStatus("error");
      document.getElementById("app").innerHTML = '<div class="empty-state">Couldn’t reach the server to load your calendar. Check your connection and reload the page.</div>';
      return;
    }
    render();
  }

  init();
})();
