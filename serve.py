#!/usr/bin/env python3
"""
Practice Exam Console — local server.

Serves the app (same as `python -m http.server`) AND handles exam uploads:
  POST   /api/exams        body: {"fileName": "...", "exam": {...}}  -> writes tools/Exam/exams/<file>.json, updates manifest.json
  DELETE /api/exams/<file>                                            -> removes an uploaded exam + its manifest entry

Only exams the server itself added (flagged "uploaded": true in manifest.json) can be deleted this way.
Standard library only — no pip installs required.

Usage:
    python serve.py            # serves on http://localhost:8000
    python serve.py 8080       # custom port
"""

import http.server
import json
import os
import re
import sys
import functools

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXAMS_DIR = os.path.join(BASE_DIR, "tools", "Exam", "exams")
MANIFEST_PATH = os.path.join(EXAMS_DIR, "manifest.json")

VALID_TYPES = ("single", "multiple")


# ---------------------------------------------------------------------------
# Exam schema validation (mirrors the client-side validator in tools/Exam/app.js)
# ---------------------------------------------------------------------------
def validate_exam_schema(obj):
    errors = []

    if not isinstance(obj, dict):
        return False, ["Root of the file must be a JSON object."]

    for key in ("examTitle", "questions"):
        if key not in obj:
            errors.append('Missing required top-level field "{}".'.format(key))

    if "examTitle" in obj and not isinstance(obj["examTitle"], str):
        errors.append('"examTitle" must be a string.')

    if "domains" in obj and not isinstance(obj["domains"], dict):
        errors.append('"domains" must be an object mapping domain name to weight.')

    if "author" in obj and obj["author"] is not None and not isinstance(obj["author"], str):
        errors.append('"author" must be a string if present.')

    if "dateCreated" in obj and obj["dateCreated"] is not None and not isinstance(obj["dateCreated"], str):
        errors.append('"dateCreated" must be a string if present.')

    questions = obj.get("questions")
    if not isinstance(questions, list):
        errors.append('"questions" must be an array.')
        return False, errors
    if len(questions) == 0:
        errors.append('"questions" array is empty — add at least one question.')
        return False, errors

    seen_ids = set()
    for i, q in enumerate(questions):
        label = "Question {}".format(i + 1)
        if not isinstance(q, dict):
            errors.append(label + ": must be an object.")
            continue

        if "id" not in q:
            errors.append(label + ': missing "id".')
        elif q["id"] in seen_ids:
            errors.append(label + ': duplicate "id" value ({}).'.format(q["id"]))
        else:
            seen_ids.add(q["id"])

        if not isinstance(q.get("domain"), str) or not q.get("domain", "").strip():
            errors.append(label + ': missing or invalid "domain".')

        if q.get("type") not in VALID_TYPES:
            errors.append(label + ': "type" must be "single" or "multiple".')

        if not isinstance(q.get("question"), str) or not q.get("question", "").strip():
            errors.append(label + ': missing or empty "question" text.')

        options = q.get("options")
        option_letters = []
        if not isinstance(options, list) or len(options) < 2:
            errors.append(label + ': "options" must be an array of at least 2 items.')
        else:
            for oi, opt in enumerate(options):
                if not isinstance(opt, dict):
                    errors.append(label + ": option {} must be an object.".format(oi + 1))
                    continue
                letter = opt.get("letter")
                if not isinstance(letter, str) or not letter.strip():
                    errors.append(label + ": option {} missing \"letter\".".format(oi + 1))
                else:
                    option_letters.append(letter)
                if not isinstance(opt.get("text"), str) or not opt.get("text", "").strip():
                    errors.append(label + ": option {} missing \"text\".".format(oi + 1))
            dupes = {l for l in option_letters if option_letters.count(l) > 1}
            if dupes:
                errors.append(label + ": duplicate option letters ({}).".format(", ".join(sorted(dupes))))

        correct = q.get("correctAnswers")
        if not isinstance(correct, list) or len(correct) == 0:
            errors.append(label + ': "correctAnswers" must be a non-empty array.')
        else:
            bad_refs = [a for a in correct if a not in option_letters]
            if bad_refs:
                errors.append(label + ': "correctAnswers" references unknown letters: {}.'.format(", ".join(bad_refs)))
            if q.get("type") == "single" and len(correct) != 1:
                errors.append(label + ': type "single" must have exactly 1 correct answer.')

        if "explanation" in q and q["explanation"] is not None and not isinstance(q["explanation"], str):
            errors.append(label + ': "explanation" must be a string.')

        if "timeSensitive" in q and not isinstance(q["timeSensitive"], bool):
            errors.append(label + ': "timeSensitive" must be true or false.')

    return (len(errors) == 0), errors


def slugify(text, fallback="exam"):
    text = (text or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def unique_filename(desired_stem):
    stem = desired_stem
    candidate = stem + ".json"
    n = 1
    while os.path.exists(os.path.join(EXAMS_DIR, candidate)):
        n += 1
        candidate = "{}-{}.json".format(stem, n)
    return candidate


def load_manifest():
    if not os.path.exists(MANIFEST_PATH):
        return {"exams": []}
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_manifest(manifest):
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")


def is_safe_exam_filename(filename):
    # Must be a bare filename (no path separators / traversal) ending in .json,
    # and must resolve to a real path inside EXAMS_DIR.
    if not filename or "/" in filename or "\\" in filename or filename in (".", ".."):
        return False
    if not filename.endswith(".json"):
        return False
    resolved = os.path.realpath(os.path.join(EXAMS_DIR, filename))
    return resolved.startswith(os.path.realpath(EXAMS_DIR) + os.sep)


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/exams":
            self._send_json(404, {"success": False, "errors": ["Unknown endpoint."]})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"success": False, "errors": ["Request body is not valid JSON: {}".format(e)]})
            return

        exam = payload.get("exam")
        requested_name = payload.get("fileName") or ""

        valid, errors = validate_exam_schema(exam)
        if not valid:
            self._send_json(400, {"success": False, "errors": errors})
            return

        os.makedirs(EXAMS_DIR, exist_ok=True)

        stem = slugify(os.path.splitext(requested_name)[0]) if requested_name else slugify(exam.get("examTitle"))
        filename = unique_filename(stem)

        try:
            with open(os.path.join(EXAMS_DIR, filename), "w", encoding="utf-8") as f:
                json.dump(exam, f, indent=2)
                f.write("\n")

            manifest = load_manifest()
            manifest.setdefault("exams", [])
            label = (exam.get("examTitle") or filename) + " (uploaded)"
            manifest["exams"].append({"file": filename, "label": label, "uploaded": True})
            save_manifest(manifest)
        except Exception as e:
            self._send_json(500, {"success": False, "errors": ["Server couldn't save the file: {}".format(e)]})
            return

        self._send_json(200, {"success": True, "file": filename, "label": label})

    def do_DELETE(self):
        prefix = "/api/exams/"
        if not self.path.startswith(prefix):
            self._send_json(404, {"success": False, "errors": ["Unknown endpoint."]})
            return

        filename = self.path[len(prefix):]
        import urllib.parse
        filename = urllib.parse.unquote(filename)

        if not is_safe_exam_filename(filename):
            self._send_json(400, {"success": False, "errors": ["Invalid filename."]})
            return

        manifest = load_manifest()
        entries = manifest.get("exams", [])
        match = next((e for e in entries if e.get("file") == filename), None)

        if not match:
            self._send_json(404, {"success": False, "errors": ["No such exam in manifest."]})
            return
        if not match.get("uploaded"):
            self._send_json(403, {"success": False, "errors": ["Only uploaded exams can be removed this way."]})
            return

        manifest["exams"] = [e for e in entries if e.get("file") != filename]
        try:
            save_manifest(manifest)
            file_path = os.path.join(EXAMS_DIR, filename)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            self._send_json(500, {"success": False, "errors": ["Server couldn't remove the file: {}".format(e)]})
            return

        self._send_json(200, {"success": True})

    def log_message(self, format, *args):
        # Slightly quieter default logging
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Port must be a number, e.g. python serve.py 8080")
            sys.exit(1)

    os.makedirs(EXAMS_DIR, exist_ok=True)
    handler_cls = functools.partial(Handler, directory=BASE_DIR)
    with http.server.ThreadingHTTPServer(("", port), handler_cls) as httpd:
        print("Practice Exam Console running at http://localhost:{}".format(port))
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
