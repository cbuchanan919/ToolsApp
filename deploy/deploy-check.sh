#!/bin/bash
# Polls origin/main for new commits; pulls and restarts the app service if
# there are any. Run on a timer by toolsapp-deploy.timer (see that file).
set -euo pipefail

cd "$(dirname "$0")/.."

# systemd units get a minimal PATH (no .bashrc/.profile sourced) — this only
# finds npm if Node was installed system-wide (apt, NodeSource; matches the
# /usr/bin/node assumed in toolsapp.service). nvm installs live under $HOME
# and won't be on this PATH, so fail loud here instead of letting `npm ci`
# below die with an opaque "command not found".
if ! command -v npm >/dev/null 2>&1; then
    echo "$(date -Iseconds) ERROR: npm not found on PATH ($PATH)." >&2
    echo "Install Node system-wide (separate from any nvm install you use interactively) — see the prerequisite note at the top of toolsapp.service for the exact Debian/NodeSource commands." >&2
    exit 1
fi

git fetch origin main -q
target="$(git rev-parse origin/main)"

# Tracks the last commit that was FULLY deployed (pulled, installed, AND
# restarted) — deliberately not the same thing as "git pull already ran".
# `git rev-parse HEAD` is the wrong gate for that: `git pull` moves HEAD
# immediately, so if `npm ci` or the restart failed after a successful
# pull, HEAD == origin/main on the very next poll even though the running
# process is still stale — the timer would see "nothing to do" forever and
# never retry. This file (gitignored — it's local deploy state, not
# source) only gets written at the very end, once every step below has
# actually succeeded, so a partial failure keeps retrying on subsequent
# polls instead of silently getting stuck.
last_deployed_file="$(dirname "$0")/.last-deployed"
last_deployed=""
[ -f "$last_deployed_file" ] && last_deployed="$(cat "$last_deployed_file")"

if [ "$last_deployed" != "$target" ]; then
    git pull origin main -q
    # Only inside this block (i.e. only when there's actually a deploy to
    # do) — npm ci wipes and reinstalls node_modules every time it runs, so
    # it'd be wasteful to run it on every 5-minute poll regardless of
    # whether anything changed.
    npm ci --omit=dev -q
    sudo systemctl restart toolsapp
    echo "$target" > "$last_deployed_file"
    echo "$(date -Iseconds) deployed $(git rev-parse --short HEAD)"
fi
