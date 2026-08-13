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
