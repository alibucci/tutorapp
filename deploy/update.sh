#!/usr/bin/env bash
# Pull, rebuild, restart. Run as root:  sudo bash /opt/tutorapp/deploy/update.sh
#
# The ownership shuffle is the point. The app runs as `tutorapp`, but git and
# npm have to run as root, and every one of them leaves files owned by whoever
# ran it. Doing this by hand gets it wrong in one direction or the other, and
# the failure is a wall of `Operation not permitted` or a service that cannot
# read its own build.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tutorapp}"
APP_USER="${APP_USER:-tutorapp}"

if [ "$(id -u)" -ne 0 ]; then
	echo "Run this as root: sudo bash $0" >&2
	exit 1
fi

cd "$APP_DIR"

# git refuses to touch a repository owned by someone else.
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "==> pulling"
before="$(git rev-parse --short HEAD)"
git pull --ff-only
after="$(git rev-parse --short HEAD)"

if [ "$before" = "$after" ]; then
	echo "    already at $after"
else
	echo "    $before -> $after"
fi

# Not --omit=dev: the build needs Tailwind's PostCSS plugin and TypeScript,
# and both live in devDependencies. Omitting them fails at the CSS step with a
# missing-module error that points at globals.css rather than at the install.
echo "==> installing"
npm ci --no-audit --no-fund

echo "==> building"
npm run build

# data/ belongs to the service and must stay writable by it; everything else
# only needs to be readable.
echo "==> fixing ownership"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> restarting"
systemctl restart tutorapp
sleep 3
systemctl is-active --quiet tutorapp || { journalctl -u tutorapp -n 30 --no-pager; exit 1; }

code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)"
echo "==> local check: HTTP $code"
[ "$code" = "200" ] || { journalctl -u tutorapp -n 30 --no-pager; exit 1; }

echo "==> done, running $after"
