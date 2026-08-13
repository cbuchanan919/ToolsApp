#!/bin/bash
# Polls origin/main for new commits; pulls and restarts the app service if
# there are any. Run on a timer by toolsapp-deploy.timer (see that file).
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch origin main -q

if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    git pull origin main -q
    sudo systemctl restart toolsapp
    echo "$(date -Iseconds) deployed $(git rev-parse --short HEAD)"
fi
