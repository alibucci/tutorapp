#!/usr/bin/env bash
# Pull, rebuild, restart. Run as root:
#
#   systemd-run --unit=tutorapp-update --collect bash /opt/tutorapp/deploy/update.sh
#   journalctl -u tutorapp-update -f          # Ctrl-C only stops watching
#
# Run it that way rather than in the foreground. The build takes about two
# minutes on this box, and a dropped SSH session SIGHUPs anything running in
# it: the build dies between stopping the app and restoring it, and the site
# stays down until someone notices. As a transient unit it survives the
# disconnect, and `recover` below puts things back if it dies anyway.
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

# Anything that kills this script between stopping the app and starting it
# again leaves the site down with its build moved aside. Put it back.
recover() {
	echo "!!! interrupted - restoring the previous build" >&2
	rm -rf "$APP_DIR/.next"
	[ -d "$APP_DIR/.next.prev" ] && mv "$APP_DIR/.next.prev" "$APP_DIR/.next"
	chown -R "$APP_USER:$APP_USER" "$APP_DIR" 2>/dev/null || true
	systemctl start tutorapp || true
	exit 1
}
trap recover HUP INT TERM

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

# Building beside a running app on a 2 GB box puts both into swap and takes the
# site down for the length of the build. Stopping first gives the build the
# whole machine and makes the outage short and predictable instead of long and
# mysterious.
echo "==> stopping app for the build"
systemctl stop tutorapp || true

# Turbopack caches compiled chunks, and a build that failed on a missing module
# leaves one behind that keeps failing with the same chunk hash long after the
# module is installed. Move the old build aside rather than delete it, so a
# failed build can be rolled back to something that runs.
echo "==> building"
rm -rf .next.prev
[ -d .next ] && mv .next .next.prev

# Cap the heap: unbounded, Node grows until the box swaps and the build crawls.
if NODE_OPTIONS="--max-old-space-size=1536" npm run build; then
	rm -rf .next.prev
else
	echo "!!! build failed - restoring the previous build" >&2
	rm -rf .next
	[ -d .next.prev ] && mv .next.prev .next
	chown -R "$APP_USER:$APP_USER" "$APP_DIR"
	systemctl start tutorapp || true
	exit 1
fi

# data/ belongs to the service and must stay writable by it; everything else
# only needs to be readable.
echo "==> fixing ownership"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> starting"
systemctl start tutorapp
sleep 3
systemctl is-active --quiet tutorapp || { journalctl -u tutorapp -n 30 --no-pager; exit 1; }

code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)"
echo "==> local check: HTTP $code"
[ "$code" = "200" ] || { journalctl -u tutorapp -n 30 --no-pager; exit 1; }

echo "==> done, running $after"
