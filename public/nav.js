(function () {
  "use strict";

  // Renders the universal nav bar (and the theme toggle within it) on every
  // page that has a #tools-nav-root div.

  // Single source of truth for what tools exist on the site. Add an entry
  // here when a new tool is added, and it'll show up in the nav bar and
  // on the Tools landing page. `category` is optional — tools without one
  // are shown ungrouped on the landing page; the nav bar itself stays a
  // flat list regardless of category.
  var TOOLS = [
    {
      id: "exam",
      label: "Exam",
      href: "/tools/Exam/",
      description: "Run a practice exam from a JSON question bank, in study or test mode.",
      category: "Education",
    },
    {
      id: "math-facts",
      label: "Math Facts Practice",
      href: "/tools/MathFacts/",
      description: "Drill addition, subtraction, multiplication, and division facts with timed practice, mastery tracking, and points.",
      category: "Education",
    },
    {
      id: "income-calculator-simple",
      label: "Income Calculator (Simple)",
      href: "/tools/Finance/IncomeCalculatorSimple/",
      description: "Convert between salary and hourly pay, with real federal/state tax brackets and take-home breakdowns.",
      category: "Finance",
    },
    {
      id: "income-calculator-multi",
      label: "Income Calculator (Multi)",
      href: "/tools/Finance/IncomeCalculatorMulti/",
      description: "Model a whole household's pay across multiple people and jobs, with combined tax, credits, and per-job breakdowns.",
      category: "Finance",
    },
    {
      id: "investment-growth-calculator",
      label: "Investment Growth Calculator",
      href: "/tools/Finance/InvestmentGrowthCalculator/",
      description: "Project compound growth of a starting balance and recurring contributions, with a year-by-year chart and breakdown.",
      category: "Finance",
    },
    {
      id: "life-goals-calendar",
      label: "Life Goals Calendar",
      href: "/tools/Personal/LifeGoalsCalendar/",
      description: "Track daily progress on personal goals with a habit calendar, streaks, and per-goal history.",
      category: "Personal",
    },
  ];

  window.ToolsRegistry = TOOLS;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ---------- theme ----------
  // theme-init.js (loaded synchronously in <head>, before first paint) has
  // already applied any saved preference as a data-theme attribute on
  // <html>. This just needs to keep that in sync as the user toggles.
  var THEME_KEY = "tools-theme";

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore (private browsing / storage disabled) */
    }
    updateThemeToggleButton();
  }

  function updateThemeToggleButton() {
    var btn = document.getElementById("tools-theme-toggle");
    if (!btn) return;
    var theme = getTheme();
    btn.textContent = theme === "light" ? "☀ Light" : "☾ Dark";
    btn.setAttribute("aria-label", "Switch to " + (theme === "light" ? "dark" : "light") + " theme");
    btn.title = btn.getAttribute("aria-label");
  }

  // If the user has never explicitly chosen a theme (no saved preference),
  // keep following the OS setting live in case it changes while the tab is
  // open. Once they use the toggle, setTheme() saves a preference and this
  // stops applying.
  try {
    var mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)");
    if (mql) {
      mql.addEventListener("change", function (e) {
        var saved = null;
        try {
          saved = localStorage.getItem(THEME_KEY);
        } catch (err) {
          /* ignore */
        }
        if (saved === "light" || saved === "dark") return;
        document.documentElement.setAttribute("data-theme", e.matches ? "light" : "dark");
        updateThemeToggleButton();
      });
    }
  } catch (e) {
    /* ignore (unsupported matchMedia) */
  }

  function renderNav() {
    var root = document.getElementById("tools-nav-root");
    if (!root) return;

    var current = document.body.getAttribute("data-tool") || "";

    var links = TOOLS.map(function (tool) {
      var activeClass = tool.id === current ? " tools-nav-link--active" : "";
      return '<a class="tools-nav-link' + activeClass + '" href="' + tool.href + '">' + tool.label + "</a>";
    }).join("");

    root.innerHTML =
      '<nav class="tools-nav">' +
      '<a class="tools-nav-title" href="/">Tools</a>' +
      '<button type="button" class="tools-nav-menu-toggle" id="tools-nav-menu-toggle" ' +
      'aria-label="Open menu" aria-expanded="false" aria-controls="tools-nav-menu">☰</button>' +
      '<div class="tools-nav-menu" id="tools-nav-menu">' +
      '<div class="tools-nav-links">' + links + "</div>" +
      '<button type="button" class="tools-theme-toggle" id="tools-theme-toggle"></button>' +
      '<div class="tools-nav-auth" id="tools-nav-auth"></div>' +
      "</div>" +
      "</nav>";

    updateThemeToggleButton();
    document.getElementById("tools-theme-toggle").addEventListener("click", function () {
      setTheme(getTheme() === "light" ? "dark" : "light");
    });

    // ---------- responsive dropdown ----------
    // Below the CSS breakpoint, .tools-nav-menu is a hidden dropdown behind
    // this hamburger button instead of an inline row (see global.css).
    var menuToggle = document.getElementById("tools-nav-menu-toggle");
    var menu = document.getElementById("tools-nav-menu");

    function setMenuOpen(open) {
      menu.classList.toggle("tools-nav-menu--open", open);
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setMenuOpen(!menu.classList.contains("tools-nav-menu--open"));
    });

    document.addEventListener("click", function (e) {
      if (!menu.classList.contains("tools-nav-menu--open")) return;
      if (menu.contains(e.target) || menuToggle.contains(e.target)) return;
      setMenuOpen(false);
    });
  }

  // ---------- auth ----------
  // One login for the whole site — every tool page loads this same file,
  // so this is the natural single home for login state, the modal, and
  // window.ToolsAuth (the shared primitive tools call before a save/upload
  // while logged out). authUser is `undefined` until the initial
  // GET /api/auth/me resolves, then `null` (logged out) or {id, email}.
  var authUser;
  var authReadyResolve;
  var authReadyPromise = new Promise(function (resolve) { authReadyResolve = resolve; });

  var modalOpen = false;
  var modalMode = "login"; // "login" | "signup"
  var modalPrompt = "";
  var modalError = "";
  var modalBusy = false;
  var pendingLoginResolve = null;

  function renderAuthUI() {
    var root = document.getElementById("tools-nav-auth");
    if (!root || authUser === undefined) return; // not resolved yet — render nothing rather than guess
    if (authUser) {
      root.innerHTML =
        '<span class="tools-auth-user" title="' + esc(authUser.email) + '">' + esc(authUser.email) + '</span>' +
        '<button type="button" class="tools-theme-toggle" data-action="logout">Log out</button>';
    } else {
      root.innerHTML = '<button type="button" class="tools-theme-toggle" data-action="open-login">Log in</button>';
    }
    var logoutBtn = root.querySelector('[data-action="logout"]');
    if (logoutBtn) logoutBtn.addEventListener("click", doLogout);
    var loginBtn = root.querySelector('[data-action="open-login"]');
    if (loginBtn) loginBtn.addEventListener("click", function () { openModal(); });
  }

  function ensureModalRoot() {
    var root = document.getElementById("tools-auth-modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "tools-auth-modal-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function openModal(promptText) {
    modalOpen = true;
    modalMode = "login";
    modalPrompt = promptText || "";
    modalError = "";
    modalBusy = false;
    renderModal();
  }

  function closeModal() {
    modalOpen = false;
    // A cancelled login intentionally never resolves requireLogin()'s
    // promise — the caller (e.g. "save on session end") just doesn't
    // proceed, which is the correct behavior for a cancel.
    renderModal();
  }

  function renderModal() {
    var root = ensureModalRoot();
    if (!modalOpen) { root.innerHTML = ""; return; }

    var isSignup = modalMode === "signup";
    root.innerHTML =
      '<div class="tools-modal-backdrop" data-action="close-modal">' +
        '<div class="tools-modal" data-role="modal-box">' +
          '<button type="button" class="tools-modal-close" data-action="close-modal" aria-label="Close">✕</button>' +
          '<div class="tools-modal-eyebrow">' + (isSignup ? "create account" : "log in") + '</div>' +
          '<h2 class="tools-modal-title">' + (isSignup ? "Sign up" : "Log in") + '</h2>' +
          (modalPrompt ? '<p class="tools-modal-prompt">' + esc(modalPrompt) + '</p>' : '') +
          '<form data-role="auth-form">' +
            '<label class="tools-modal-label">Email' +
              '<input type="email" name="email" autocomplete="email" required /></label>' +
            '<label class="tools-modal-label">Password' +
              '<input type="password" name="password" autocomplete="' + (isSignup ? "new-password" : "current-password") + '" required /></label>' +
            (isSignup
              ? '<label class="tools-modal-label">Confirm password' +
                '<input type="password" name="confirmPassword" autocomplete="new-password" required /></label>'
              : '') +
            (modalError ? '<div class="tools-modal-error">' + esc(modalError) + '</div>' : '') +
            '<button type="submit" class="tools-modal-submit" ' + (modalBusy ? "disabled" : "") + '>' +
              (modalBusy ? "…" : (isSignup ? "Sign up" : "Log in")) +
            '</button>' +
          '</form>' +
          '<button type="button" class="tools-modal-switch" data-action="switch-mode">' +
            (isSignup ? "Already have an account? Log in" : "New here? Sign up") +
          '</button>' +
        '</div>' +
      '</div>';

    root.querySelector('[data-role="modal-box"]').addEventListener("click", function (e) { e.stopPropagation(); });
    var closeEls = root.querySelectorAll('[data-action="close-modal"]');
    for (var i = 0; i < closeEls.length; i++) closeEls[i].addEventListener("click", closeModal);
    var switchBtn = root.querySelector('[data-action="switch-mode"]');
    switchBtn.addEventListener("click", function () {
      modalMode = isSignup ? "login" : "signup";
      modalError = "";
      renderModal();
    });
    var form = root.querySelector('[data-role="auth-form"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitAuthForm(form);
    });
    var firstInput = root.querySelector('input[name="email"]');
    if (firstInput) firstInput.focus();
  }

  function submitAuthForm(form) {
    var email = form.email.value.trim();
    var password = form.password.value;
    if (modalMode === "signup" && password !== form.confirmPassword.value) {
      modalError = "Passwords don't match.";
      renderModal();
      return;
    }

    modalBusy = true;
    modalError = "";
    renderModal();

    var endpoint = modalMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (result) {
        modalBusy = false;
        if (!result.ok) {
          modalError = (result.body && result.body.errors && result.body.errors[0]) || "Something went wrong.";
          renderModal();
          return;
        }
        authUser = result.body;
        modalOpen = false;
        renderModal();
        renderAuthUI();
        window.dispatchEvent(new CustomEvent("tools:auth-changed", { detail: { user: authUser } }));
        if (pendingLoginResolve) {
          var resolve = pendingLoginResolve;
          pendingLoginResolve = null;
          resolve(authUser);
        }
      })
      .catch(function () {
        modalBusy = false;
        modalError = "Network error — try again.";
        renderModal();
      });
  }

  function requireLogin(promptText) {
    if (authUser) return Promise.resolve(authUser);
    return new Promise(function (resolve) {
      pendingLoginResolve = resolve;
      openModal(promptText);
    });
  }

  function doLogout() {
    fetch("/api/auth/logout", { method: "POST" }).catch(function () { /* clear client state regardless */ }).then(function () {
      authUser = null;
      renderAuthUI();
      window.dispatchEvent(new CustomEvent("tools:auth-changed", { detail: { user: null } }));
    });
  }

  function initAuth() {
    fetch("/api/auth/me")
      .then(function (res) { return res.json(); })
      .catch(function () { return null; })
      .then(function (user) {
        authUser = user;
        authReadyResolve(user);
        renderAuthUI();
      });
  }

  window.ToolsAuth = {
    ready: authReadyPromise,
    getUser: function () { return authUser || null; },
    requireLogin: requireLogin,
    logout: doLogout,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { renderNav(); initAuth(); });
  } else {
    renderNav();
    initAuth();
  }
})();
