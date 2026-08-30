(function () {
  "use strict";
  // Loaded as a blocking <script src> in <head>, before any CSS paints, so
  // the correct theme is applied on first render — no flash of the wrong
  // theme while nav.js (which loads later, near the end of <body>) catches
  // up. A saved preference (from the nav bar toggle) always wins; absent
  // one, fall back to the OS/browser preference, and absent that too,
  // dark (global.css's default) applies on its own.
  try {
    var saved = localStorage.getItem("tools-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {
    /* ignore (private browsing / storage disabled) — falls back to dark */
  }
})();
