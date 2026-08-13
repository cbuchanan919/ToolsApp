(function () {
  "use strict";
  // Loaded as a blocking <script src> in <head>, before any CSS paints, so
  // the correct theme is applied on first render — no flash of the wrong
  // theme while nav.js (which loads later, near the end of <body>) catches
  // up. Absence of the attribute means dark, which is global.css's default.
  try {
    var saved = localStorage.getItem("tools-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {
    /* ignore (private browsing / storage disabled) — falls back to dark */
  }
})();
