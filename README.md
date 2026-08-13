# Tools

A local, static site hosting a small suite of single-page tools, behind a
shared "Tools" landing page and top nav bar. Currently:

- **Exam** (`tools/Exam/`) — a practice exam runner. Load a bank of
  multiple-choice questions, take it in **study** mode (instant feedback) or
  **test** mode (scored at the end), and review results by domain.
- **Income Calculator (Simple)** (`tools/Finance/IncomeCalculatorSimple/`) —
  converts between salary and hourly pay using real federal/state tax
  brackets, with a pay breakdown, offer comparator, and PTO value calculator.
  `tools/Finance/` is a category folder — expect sibling calculators
  (e.g. a multi-person version) alongside it later.

## Running it

```
python serve.py            # http://localhost:8000
python serve.py 8080       # custom port
```

Standard library only — no pip installs required. Run it with `serve.py`
rather than `python -m http.server` if you want the exam tool's in-app
upload feature to save files to `tools/Exam/exams/` (see below).

## Site structure

- `index.html` / `global.css` — the Tools landing page: shared design
  tokens, the universal nav bar, and a card grid linking to each tool.
- `nav.js` — single source of truth for the tools registry (id, label,
  href, description). Injects the nav bar into any page with a
  `<div id="tools-nav-root"></div>`, and the landing page reads the same
  registry to render its card grid. Shared assets (`global.css`, `nav.js`)
  are referenced with root-absolute paths (`/global.css`, `/nav.js`) so
  they resolve correctly no matter how deep a tool's folder is nested.
- `tools/<ToolName>/` — one folder per tool, e.g. `tools/Exam/index.html`,
  `app.js`, `styles.css`, plus any tool-owned data (`tools/Exam/exams/`).
  The folder is the namespace, so tool-owned files don't need prefixing.
  When a group of tools are related (e.g. multiple finance calculators),
  nest them under a category folder instead:
  `tools/<Category>/<ToolName>/index.html`, as with
  `tools/Finance/IncomeCalculatorSimple/`.
- Each tool is free to bring its own visual design (fonts, colors, layout)
  rather than conform to the dark ops-console look — the universal nav bar
  is the only thing guaranteed to look the same everywhere. If a tool's
  own styles clash with something global.css applies site-wide (e.g. the
  shared focus-ring color), override it locally in the tool's own
  stylesheet rather than changing global.css.

### Adding a new tool

1. Create `tools/<ToolName>/index.html` (or `tools/<Category>/<ToolName>/index.html`
   if it belongs to a group) with `<body data-tool="<id>">`, a
   `<div id="tools-nav-root"></div>` right after `<body>`, and
   `<link rel="stylesheet" href="/global.css">` before the tool's own
   stylesheet. Load `<script src="/nav.js"></script>` before the tool's
   own script. Also include the IBM Plex Mono Google Fonts `<link>` tags
   (copy them from `tools/Exam/index.html`) even if the tool's own design
   uses a different font — the nav bar's font-family is pinned to IBM Plex
   Mono in `global.css`, but the font still has to be loaded on every page
   for it to actually render that way instead of falling back to a system
   mono font.
2. Give the tool its own `app.js` / `styles.css` inside its folder —
   plain relative filenames are fine since the folder is the namespace.
3. Add an entry to the `TOOLS` array in `nav.js` (`id`, `label`,
   `href: "/tools/<ToolName>/"`, `description`).

## Adding an exam

Exam banks are JSON files in `tools/Exam/exams/`, listed in
`tools/Exam/exams/manifest.json`:

```json
{
  "exams": [
    { "file": "az900-practice-exam.json", "label": "AZ-900 Practice Exam" }
  ]
}
```

You can either:
- Drop a `.json` file in `tools/Exam/exams/` and add an entry to the
  manifest by hand, or
- Use the **Upload exam** control on the start screen — the server validates
  the file, writes it to `tools/Exam/exams/`, and adds a manifest entry
  automatically (flagged `"uploaded": true`, which is what lets it be
  deleted again from the UI).

## Exam file format

```json
{
  "examTitle": "string (required)",
  "description": "string (optional — description of the test. Give overview and categories with their weights / percentages of the test)",
  "author": "string (optional — shown as 'author unknown' if omitted)",
  "dateCreated": "string (optional — shown as 'date unknown' if omitted, suggest YYYY-MM-DD)",
  "totalQuestions": 30,
  "domains": {
    "Domain Name": "weight as a string, e.g. \"25%\"",
    "Another Domain": "35%"
  },
  "questions": [
    {
      "id": 1,
      "domain": "Domain Name",
      "type": "single",
      "question": "The question text goes here?",
      "options": [
        { "letter": "A", "text": "First option" },
        { "letter": "B", "text": "Second option" },
        { "letter": "C", "text": "Third option" },
        { "letter": "D", "text": "Fourth option" }
      ],
      "correctAnswers": ["A"],
      "explanation": "Why A is correct (and/or why the others aren't).",
      "timeSensitive": false
    }
  ]
}
```

### Top-level fields

| Field            | Required | Type   | Notes |
|------------------|----------|--------|-------|
| `examTitle`      | yes      | string | |
| `questions`      | yes      | array  | Must be non-empty. |
| `author`         | no       | string \| null | |
| `dateCreated`    | no       | string \| null | Free-form, e.g. `"2026-08-13"`. |
| `totalQuestions` | no       | number | Purely informational — flagged as a (non-blocking) warning if it doesn't match `questions.length`. |
| `domains`        | no       | object | Maps domain name → weight string, used for the domain breakdown on the results screen. Not validated against the domains actually used in `questions`. |

### Question object

| Field            | Required | Type    | Notes |
|------------------|----------|---------|-------|
| `id`             | yes      | any     | Must be unique across the file. |
| `domain`         | yes      | string  | Non-empty. Should match a key in `domains` if you want accurate results grouping. |
| `type`           | yes      | string  | `"single"` or `"multiple"`. |
| `question`       | yes      | string  | Non-empty. |
| `options`        | yes      | array   | At least 2 items. |
| `correctAnswers` | yes      | array   | Non-empty array of option letters. Every letter must exist in `options`. `type: "single"` requires exactly 1 entry; `"multiple"` requires 1+. |
| `explanation`    | no       | string \| null | Shown after answering (study mode) or in the results review. |
| `timeSensitive`  | no       | boolean | Marks content that may go stale (e.g. pricing, service limits) — shown with a warning badge in the review list. |

### Option object

| Field    | Required | Type   | Notes |
|----------|----------|--------|-------|
| `letter` | yes      | string | Unique within the question (e.g. `"A"`, `"B"`, ...). |
| `text`   | yes      | string | Non-empty. |

Both the browser (on upload) and `serve.py` (on save) validate against this
schema and report every error at once, so a rejected upload will tell you
exactly which question/field is wrong.
