# Practice Exam Console

A local, single-page practice exam runner. Load a bank of multiple-choice
questions, take it in **study** mode (instant feedback) or **test** mode
(scored at the end), and review results by domain.

## Running it

```
python serve.py            # http://localhost:8000
python serve.py 8080       # custom port
```

Standard library only — no pip installs required. Run it with `serve.py`
rather than `python -m http.server` if you want the in-app upload feature to
save files to `exams/` (see below).

## Adding an exam

Exam banks are JSON files in `exams/`, listed in `exams/manifest.json`:

```json
{
  "exams": [
    { "file": "az900-practice-exam.json", "label": "AZ-900 Practice Exam" }
  ]
}
```

You can either:
- Drop a `.json` file in `exams/` and add an entry to the manifest by hand, or
- Use the **Upload exam** control on the start screen — the server validates
  the file, writes it to `exams/`, and adds a manifest entry automatically
  (flagged `"uploaded": true`, which is what lets it be deleted again from
  the UI).

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
