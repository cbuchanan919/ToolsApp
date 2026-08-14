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

if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    git pull origin main -q
    # Only inside this block (i.e. only when there's actually a new commit
    # to deploy) — npm ci wipes and reinstalls node_modules every time it
    # runs, so it'd be wasteful to run it on every 5-minute poll regardless
    # of whether anything changed.
    npm ci --omit=dev -q
    sudo systemctl restart toolsapp
    echo "$(date -Iseconds) deployed $(git rev-parse --short HEAD)"
fi
