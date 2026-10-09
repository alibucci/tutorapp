#!/usr/bin/env bash
# Build here, ship the result, switch over. Run from the project root:
#
#   bash scripts/release.sh
#
# The server stopped building its own releases after five separate failures
# that only ever appeared there - a cold Turbopack cache, 2 GB of memory, HOME
# under systemd, a dropped SSH session, missing dev dependencies. None of them
# reproduce on a development machine, and each one took the site down while it
# was diagnosed. A standalone bundle needs no npm install and no build on the
# far side, so a release is a copy and a symlink.
#
# Secrets and lesson data live only on the server and are symlinked into each
# release. Nothing from this machine's data directory is ever shipped.

set -euo pipefail

HOST="${DEPLOY_HOST:-root@47.242.7.151}"
APP_DIR="${DEPLOY_DIR:-/opt/tutorapp}"
APP_USER="${DEPLOY_USER:-tutorapp}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tarball="/tmp/aloudli-${stamp}.tar.gz"

echo "==> checking"
npx tsc --noEmit
npx eslint src

echo "==> building"
rm -rf .next
npm run build

# server.js serves these only if they sit beside it; the build does not copy
# them because a CDN would normally handle them.
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

if [ -e .next/standalone/data ]; then
	echo "!!! the bundle contains a data directory - refusing to ship it" >&2
	exit 1
fi

echo "==> packaging"
tar -czf "$tarball" -C .next/standalone .
echo "    $(du -h "$tarball" | cut -f1)"

echo "==> uploading"
scp -q "$tarball" "$HOST:/tmp/release.tar.gz"
rm -f "$tarball"

echo "==> switching over"
ssh "$HOST" APP_DIR="$APP_DIR" APP_USER="$APP_USER" STAMP="$stamp" 'bash -s' <<'REMOTE'
set -euo pipefail

release="$APP_DIR/releases/$STAMP"
mkdir -p "$release"
tar -xzf /tmp/release.tar.gz -C "$release"
rm -f /tmp/release.tar.gz

# Secrets and the lesson store stay outside the release and are linked in, so
# a rollback never touches them and a release never carries them.
ln -sfn "$APP_DIR/.env.local" "$release/.env.local"
ln -sfn "$APP_DIR/data" "$release/data"
mkdir -p "$APP_DIR/data"

chown -R "$APP_USER:$APP_USER" "$release" "$APP_DIR/data"

previous="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
ln -sfn "$release" "$APP_DIR/current"

systemctl reset-failed tutorapp 2>/dev/null || true
systemctl restart tutorapp
sleep 3

code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3000/login || true)"
if [ "$code" != "200" ]; then
	echo "!!! new release answers $code - rolling back" >&2
	[ -n "$previous" ] && ln -sfn "$previous" "$APP_DIR/current"
	systemctl restart tutorapp
	exit 1
fi
echo "    serving $STAMP, HTTP $code"

# Keep the last three so a rollback is a symlink away.
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
REMOTE

echo "==> done"
