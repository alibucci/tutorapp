#!/usr/bin/env bash
# Nightly snapshot of everything the app owns.
#
# `data/` holds lesson recordings, transcripts and notes about children. It sits
# on one disk with no replication, so without this a failed volume loses the lot
# with no way back. Restoring is `tar xzf` over an empty data directory.
#
#   0 3 * * *  /opt/tutorapp/deploy/backup.sh >> /var/log/tutorapp-backup.log 2>&1

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tutorapp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tutorapp}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# Optional: an rclone remote, e.g. "b2:tutorsignal-backups". A backup on the
# same machine survives a bad deploy but not a dead disk.
REMOTE="${BACKUP_REMOTE:-}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${BACKUP_DIR}/tutorapp-${stamp}.tar.gz"

mkdir -p "$BACKUP_DIR"

if [ ! -d "${APP_DIR}/data" ]; then
	echo "$(date -u +%FT%TZ) no data directory at ${APP_DIR}/data" >&2
	exit 1
fi

# The env file carries the session secret and the API key. Losing it locks
# every tutor out, so it goes in the archive - which is why the archive must
# not be world readable.
tar -czf "$archive" -C "$APP_DIR" data $([ -f "${APP_DIR}/.env.local" ] && echo ".env.local")
chmod 600 "$archive"

size="$(du -h "$archive" | cut -f1)"
echo "$(date -u +%FT%TZ) wrote ${archive} (${size})"

# Verify rather than assume: a silently truncated archive is worse than none.
if ! tar -tzf "$archive" > /dev/null; then
	echo "$(date -u +%FT%TZ) ARCHIVE IS UNREADABLE - ${archive}" >&2
	exit 1
fi

if [ -n "$REMOTE" ]; then
	rclone copy "$archive" "$REMOTE" && \
		echo "$(date -u +%FT%TZ) copied offsite to ${REMOTE}"
fi

find "$BACKUP_DIR" -name 'tutorapp-*.tar.gz' -mtime "+${KEEP_DAYS}" -delete
echo "$(date -u +%FT%TZ) kept $(find "$BACKUP_DIR" -name 'tutorapp-*.tar.gz' | wc -l | tr -d ' ') archives"
