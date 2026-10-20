#!/usr/bin/env bash
# Pull the newest server backup onto this machine.
#
# The server keeps its own nightly copies, but they live on the same disk as
# the thing they protect. This is the copy in a second place, run by hand:
#
#   npm run backup:pull
#
# It lands in ./backups, which is gitignored - the archive holds the session
# secret, the API key and children's names, and must never reach a repository.

set -euo pipefail

HOST="${DEPLOY_HOST:-admin@47.238.158.217}"
REMOTE_DIR="${BACKUP_DIR:-/var/backups/tutorapp}"
LOCAL_DIR="${LOCAL_BACKUP_DIR:-./backups}"

mkdir -p "$LOCAL_DIR"

newest="$(ssh "$HOST" "sudo ls -1t ${REMOTE_DIR}/tutorapp-*.tar.gz 2>/dev/null | head -1")"
if [ -z "$newest" ]; then
	echo "No backup on the server yet. Is the nightly job installed?" >&2
	exit 1
fi

name="$(basename "$newest")"
# The archives are chmod 600 and owned by root, so they are read through sudo
# rather than copied directly.
ssh "$HOST" "sudo cat '$newest'" > "${LOCAL_DIR}/${name}"
chmod 600 "${LOCAL_DIR}/${name}"

tar -tzf "${LOCAL_DIR}/${name}" > /dev/null
echo "pulled ${LOCAL_DIR}/${name} ($(du -h "${LOCAL_DIR}/${name}" | cut -f1)), archive reads cleanly"
