# Tools

A local, static site hosting a small suite of single-page tools, behind a
shared "Tools" landing page and top nav bar. Currently:

- **Exam** (`public/tools/Exam/`) — a practice exam runner. Load a bank of
  multiple-choice questions, take it in **study** mode (instant feedback) or
  **test** mode (scored at the end), and review results by domain. Anyone
  can browse/take the bundled exams without an account; uploading your own
  exam bank requires logging in (see "Accounts" below) and is private to you.
- **Math Facts Practice** (`public/tools/MathFacts/`) — drills addition,
  subtraction, multiplication, and division facts in a timed-drill or
  fixed-set session, with a numeric keypad for touch. Tracks per-fact
  accuracy/response time to rank which facts are and aren't mastered yet
  (weakest-first, also used by an optional Focus Mode), and layers on
  points, levels, badges, and daily streaks. Works fully without an account
  (practice is never blocked), but saving progress across visits requires
  logging in — profile data (points, streak, badges, per-fact stats) is
  stored server-side (`GET`/`PUT /api/math-facts-profiles/me`, see below).
  All the fact-generation/scoring/mastery logic lives in
  `public/tools/MathFacts/mathFactsCore.js`, a dual-usable module
  (`<script>`-tagged in the browser, `require()`d directly by
  `test/mathFacts.test.js`) so it's unit-tested without a browser.
- **Income Calculator (Simple)** (`public/tools/Finance/IncomeCalculatorSimple/`) —
  converts between salary and hourly pay using real federal/state tax
  brackets, with a pay breakdown, offer comparator, and PTO value calculator.
- **Income Calculator (Multi)** (`public/tools/Finance/IncomeCalculatorMulti/`) —
  models a whole household's pay across multiple people and jobs each with
  their own filing status, deductions, and dependents, with combined
  household tax and per-job breakdowns.
- **Investment Growth Calculator** (`public/tools/Finance/InvestmentGrowthCalculator/`) —
  projects compound growth of a starting balance plus recurring
  contributions, with a year-by-year chart/breakdown and a live "money left
  over" estimate after taxes.
- **Life Goals Calendar** (`public/tools/Personal/LifeGoalsCalendar/`) — a
  habit-tracking calendar: define goals, mark days done, and see current/
  best streaks. The calendar UI works without an account, but saving is
  per-user and requires logging in — calendar data is stored server-side
  (`GET`/`PUT /api/calendars/me`, see below).

`public/tools/Finance/` and `public/tools/Personal/` are category folders —
tools within them share the folder and are grouped under that heading on the
landing page (see below).

## Running it

```
npm install
npm start                  # http://localhost:8000
node server/index.js 8080  # custom port
npm test                   # runs test/ via Node's built-in test runner
```

The frontend itself is still plain HTML/CSS/JS with no build step — the
Node/Express server (`server/`) exists to serve it plus a small API for
reference data shared across tools and the exam upload feature (see below).

## Server / API

- `server/index.js` / `server/app.js` — the app: serves `public/` as static
  content, mounts the API routes below, and creates
  `public/tools/Exam/exams/` if it doesn't exist yet. Static serving is
  scoped to `public/` specifically (not the repo root) so `server/`,
  `test/`, `deploy/`, `package.json`, etc. are never reachable over HTTP.
- `server/data/` — the single source of truth for federal/state tax
  brackets and each state's cost-of-living index. Both Finance tools fetch
  from here (once, on page load) instead of hardcoding their own copies.
- `GET /api/states`, `GET /api/federal` — raw reference data (state tax
  brackets + cost-of-living index; federal brackets/deductions/FICA
  constants). Fetched once per page load; tools compute locally/instantly
  from the response rather than round-tripping on every interaction.
- `POST /api/tax-estimate` — `{ income, state?, filingStatus? }` →
  `{ federalTax, stateTax, ficaTax, totalTax, netAnnual, ... }`. The one
  endpoint an interactive control calls live (debounced, with
  `AbortController` cancelling stale requests) — used by the Investment
  Growth Calculator's secondary "money left over" line, where a network
  round-trip doesn't cost any perceived responsiveness.
- `server/middleware/auth.js` — `attachUser` resolves the session cookie
  into `req.user` (`null` if logged out) for every route; mounted globally
  in `server/app.js`, before any route. `requireAuth` rejects with 401 if
  `req.user` is unset — applied at the router level for calendars/math-facts
  profiles (every route there needs a logged-in user), and per-route in
  `routes/exams.js` (browsing exams stays open; only upload/delete require
  it). See "Accounts" below.
- `GET /api/exams` (open) — merged exam list: bundled exams (always) plus
  the caller's own uploads (only if logged in), each tagged
  `source: "bundled" | "mine"`. `GET /api/exams/mine/:filename` (login
  required) serves one of *your own* uploads' content — directory-scoped to
  your account, so there's no way to fetch someone else's upload. Bundled
  exam content is still fetched directly from its static path in
  `public/tools/Exam/exams/`, unchanged. `POST /api/exams` (login required)
  saves into `server/data/examUploads/<your user id>/` (gitignored, private
  to you — no longer inside `public/`); `DELETE /api/exams/:filename` (login
  required) removes one of your own uploads. Ported from the previous
  Python server with the same schema validation/safety checks, now with
  per-user storage layered on top.
- `GET /api/calendars/me`, `PUT /api/calendars/me` (login required) — Life
  Goals Calendar's storage, one calendar per account. Each calendar is a
  JSON file (`{ id, userId, goals, entries, selectedGoalId, createdAt,
  updatedAt }`) under `server/data/calendars/` (gitignored), named by user
  id. The frontend loads on login and `PUT`s the full calendar after every
  change (goal added/renamed/removed, day toggled); logged out, the tool
  runs on an in-memory calendar and prompts to log in the moment you try to
  save (see "Accounts" below). `POST /api/calendars/claim` (login required,
  `{ anonymousId }`) attaches an old pre-account anonymous calendar (if
  this browser still has one in `localStorage` from before accounts
  existed) to your account — only if your account doesn't already have
  real saved content.
- `GET /api/math-facts-profiles/me`, `PUT /api/math-facts-profiles/me`
  (login required) — Math Facts Practice's storage, same shape of pattern
  as calendars above. Each profile is a JSON file (`{ id, userId,
  totalPoints, streak, badges, factStats, sessionHistory, createdAt,
  updatedAt }`) under `server/data/mathFactsProfiles/` (gitignored), named
  by user id. Autosaves once per completed practice session (not per
  keystroke). `POST /api/math-facts-profiles/claim` mirrors calendars'
  claim endpoint above.

## Accounts

Simple, self-serve accounts — email + password, one login for the whole
site. Basic functionality never requires an account (practicing math facts,
using the calendar UI, browsing/taking any exam); only *saving/uploading*
does, prompted via a shared login modal (`window.ToolsAuth`, in `nav.js`)
the moment you try to. OAuth is a deliberate future item, not implemented.

- `server/lib/passwords.js` — hashes with Node's async `crypto.scrypt`
  (explicit cost params stored alongside the hash). `server/lib/
  authValidation.js` — email/password rules (email is a practical
  shape-check, not full RFC 5322 validation — no verification email is
  ever sent). `server/lib/userStore.js` — accounts, one JSON object keyed
  by lowercased email at `server/data/users.json` (gitignored).
  `server/lib/sessionStore.js` — sessions, persisted (not just in-memory)
  at `server/data/sessions.json` (gitignored) so logins survive a deploy
  restart, keyed by a random token set as an `httpOnly` cookie.
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me` — the only auth routes reachable while logged out.
  Login/signup failures are deliberately generic ("Incorrect email or
  password") so they can't be used to enumerate registered emails.
- **Known, accepted limitations** (fine for a small personal/family site,
  not appropriate to scale up without revisiting): no rate limiting or
  lockout on login attempts; session tokens are stored in plaintext in
  `sessions.json`; the `claim` endpoints' only "ownership" proof is knowing
  the old anonymous id string itself (low risk given its entropy, but real).

## Site structure

Everything under `public/` is served as static content by
`express.static()` — nothing outside it is (see the Server / API section
above). Root-absolute paths like `/global.css` therefore resolve relative
to `public/`, not the repo root.

- `public/index.html` / `public/global.css` — the Tools landing page:
  shared design tokens, the universal nav bar, and a card grid linking to
  each tool.
- `public/nav.js` — single source of truth for the tools registry (id,
  label, href, description). Injects the nav bar into any page with a
  `<div id="tools-nav-root"></div>`, and the landing page reads the same
  registry to render its card grid. Shared assets (`global.css`, `nav.js`)
  are referenced from tool pages with root-absolute paths (`/global.css`,
  `/nav.js`) so they resolve correctly no matter how deep a tool's folder
  is nested.
- `public/tools/<ToolName>/` — one folder per tool, e.g.
  `public/tools/Exam/index.html`, `app.js`, `styles.css`, plus any
  tool-owned data (`public/tools/Exam/exams/`). The folder is the
  namespace, so tool-owned files don't need prefixing. When a group of
  tools are related (e.g. multiple finance calculators), nest them under a
  category folder instead: `public/tools/<Category>/<ToolName>/index.html`,
  as with `public/tools/Finance/IncomeCalculatorSimple/`.
- Every tool shares one visual design via the `--tools-*` custom properties
  defined in `global.css` (see "Theming" below) — a tool's own `styles.css`
  should style layout/components using those tokens, not introduce its own
  color palette or font stack. This is what lets the whole site (nav bar
  included) respond consistently to the light/dark toggle.

### Adding a new tool

1. Create `public/tools/<ToolName>/index.html` (or
   `public/tools/<Category>/<ToolName>/index.html` if it belongs to a
   group) with `<body data-tool="<id>">`, a
   `<div id="tools-nav-root"></div>` right after `<body>`, and, in this
   order in `<head>`: `<script src="/theme-init.js"></script>` (must run
   before any CSS paints — see "Theming"), the IBM Plex Mono Google Fonts
   `<link>` tags (copy from `public/tools/Exam/index.html` — the nav bar's
   font is pinned to IBM Plex Mono in `global.css`, but the font still has
   to be loaded on every page for that to actually render instead of
   falling back to a system mono font), then
   `<link rel="stylesheet" href="/global.css">` before the tool's own
   stylesheet. Load `<script src="/nav.js"></script>` before the tool's
   own script.
2. Give the tool its own `app.js` / `styles.css` inside its folder —
   plain relative filenames are fine since the folder is the namespace.
   Style it using `var(--tools-*)` tokens (see "Theming") rather than
   hardcoded colors, so it inherits the site's light/dark toggle for free.
3. Add an entry to the `TOOLS` array in `nav.js` (`id`, `label`,
   `href: "/tools/<ToolName>/"`, `description`). If it belongs to a group
   of related tools, add a matching `category` string (e.g. `"Finance"`)
   to each entry in that group — the landing page groups cards under a
   heading per category automatically; the nav bar itself stays a flat
   list regardless.

## Theming

The whole site — nav bar and every tool — shares one set of design tokens
defined as CSS custom properties in `global.css`:

```
--tools-bg, --tools-panel, --tools-panel-alt, --tools-line, --tools-text,
--tools-muted, --tools-ok, --tools-warn, --tools-info, --tools-danger,
--tools-idle, --tools-accent, --tools-accent-contrast, --tools-mono,
--tools-content-width
```

`--tools-content-width` (960px) is the shared max-width for each page's
main content wrapper — the landing grid's `.tools-home-main`, Exam's
`.exam-main`, and each Finance tool's `.wrap`. Use it there rather than a
one-off pixel value, so the page doesn't visibly change width as you
navigate between tools.

Dark is the default palette, defined on bare `:root`. A full light palette
is defined under `:root[data-theme="light"]`, which activates when
`<html>` has that attribute. There's no `prefers-color-scheme` media query
involved — this is a manual toggle, not a system-preference follower.

`--tools-accent-contrast` is paired with `--tools-accent`: use it for text
that sits on top of a solid `--tools-accent` fill (e.g. a primary button).
The two are defined together per-theme because dark mode's accent is
bright enough for dark text on it, while light mode's accent is darkened
for contrast against a white page — so it needs light text instead.

For translucent color washes (a faint tinted background behind a colored
border), use `color-mix(in srgb, var(--tools-X) N%, transparent)` rather
than a hardcoded `rgba(...)` — a literal rgba value bakes in one theme's
hex value and won't adapt when the palette switches.

**Avoiding a flash of the wrong theme:** `theme-init.js` reads the saved
preference from `localStorage` (`tools-theme`) and sets `data-theme` on
`<html>` before any stylesheet paints. It must be loaded as a classic
(non-deferred, non-async) `<script src>` early in `<head>`, before the
page can render — that's why every page's `<head>` includes it ahead of
the stylesheet links. `nav.js` renders the actual toggle button (in the
universal nav bar) and keeps `localStorage` in sync as the user clicks it;
`theme-init.js` only handles the initial paint.

## Adding an exam

**Bundled exams** (shared, visible to everyone, no login needed) are JSON
files in `public/tools/Exam/exams/`, listed in
`public/tools/Exam/exams/manifest.json`:

```json
{
  "exams": [
    { "file": "az900-practice-exam.json", "label": "AZ-900 Practice Exam" }
  ]
}
```

Drop a `.json` file in `public/tools/Exam/exams/` and add an entry to the
manifest by hand to add one.

**Your own uploads** are different: use the **Upload exam** control on the
start screen (prompts to log in if you aren't already) — the server
validates the file and saves it privately to `server/data/examUploads/<your
user id>/`, not into `public/`, so only you ever see it in your exam list or
can fetch its content. `manifest.json` is never touched by uploads.

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

Both the browser (on upload) and the server (`server/lib/examValidation.js`,
on save) validate against this schema and report every error at once, so a
rejected upload will tell you exactly which question/field is wrong.
