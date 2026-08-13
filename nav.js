(function () {
  "use strict";

  // Single source of truth for what tools exist on the site. Add an entry
  // here when a new tool is added, and it'll show up in the nav bar and
  // on the Tools landing page.
  var TOOLS = [
    {
      id: "exam",
      label: "Exam",
      href: "/tools/Exam/",
      description: "Run a practice exam from a JSON question bank, in study or test mode.",
    },
    {
      id: "income-calculator-simple",
      label: "Income Calculator (Simple)",
      href: "/tools/Finance/IncomeCalculatorSimple/",
      description: "Convert between salary and hourly pay, with real federal/state tax brackets and take-home breakdowns.",
    },
  ];

  window.ToolsRegistry = TOOLS;

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
      "</nav>";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNav);
  } else {
    renderNav();
  }
})();
