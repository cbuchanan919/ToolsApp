(function () {
  "use strict";

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
  ];

  window.ToolsRegistry = TOOLS;

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
      '<div class="tools-nav-links">' + links + "</div>" +
      '<button type="button" class="tools-theme-toggle" id="tools-theme-toggle"></button>' +
      "</nav>";

    updateThemeToggleButton();
    document.getElementById("tools-theme-toggle").addEventListener("click", function () {
      setTheme(getTheme() === "light" ? "dark" : "light");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNav);
  } else {
    renderNav();
  }
})();
