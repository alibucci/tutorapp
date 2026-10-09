# Deploying

A VPS with a persistent disk. Not Vercel or any other serverless host: the app
writes to the filesystem, and there the filesystem does not survive between
requests, so it fails as a matter of correctness rather than performance.

For a pilot in mainland China, put the box in Hong Kong with CN2 GIA routing —
Hong Kong is outside the mainland, so no ICP filing, and the route is what
decides whether the app loads at eight in the evening.

## Setup

Ubuntu's own `nodejs` package is 18.19, and Next needs 20.9 or newer — the
build fails with a version error rather than anything informative, so take Node
from NodeSource.

```bash
# swap first: 2 GB of RAM is tight for a Next build and it will be killed
# mid-compile with nothing in the log to explain it
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git

# Caddy, from its own repo
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

git clone https://github.com/alibucci/tutorapp /opt/tutorapp
cd /opt/tutorapp
npm ci
cp .env.example .env.local   # fill in all four required values
npm run build
```

Run it under a supervisor so it comes back after a reboot:

```ini
# /etc/systemd/system/tutorapp.service
[Unit]
After=network.target

[Service]
# `current` is a symlink to the live release, so a rollback is one symlink and
# a restart. The standalone bundle carries its own server; there is no npm.
WorkingDirectory=/opt/tutorapp/current
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
User=tutorapp

[Install]
WantedBy=multi-user.target
```

## TLS is required, not optional

`getUserMedia` and the speech recogniser both refuse to run outside a secure
context. On plain HTTP the app has **no microphone at all**, and the browser
gives the tutor nothing to act on — it simply never starts.

`Caddyfile` here handles certificates by itself. Point the domain at the box,
edit the hostname, and:

```bash
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

DNS first, or Caddy cannot prove it owns the name. At the registrar, **delete any
URL redirect** — that is a parking feature and it conflicts with pointing the
domain at a real server — then add two A records:

```
A   @     47.242.7.151
A   www   47.242.7.151
```

Then open `/check` on a real device and confirm **Secure context: OK**.

## Releasing

From your own machine, in the project root:

```bash
npm run release
```

Typecheck, lint, build, package, upload, switch the `current` symlink, restart,
and verify the app answers — rolling back to the previous release if it does
not. Downtime is a restart, not a build.

**The server does not build.** It did, and five separate failures appeared only
there: a cold Turbopack cache, 2 GB of memory, `HOME` under `systemd-run`, a
dropped SSH session, missing dev dependencies. None reproduce on a development
machine and each took the site down while it was diagnosed. `output:
"standalone"` emits a bundle that runs with no `npm install` at all.

Layout on the server:

```
/opt/tutorapp/
  .env.local          secrets, never shipped
  data/               lessons, never shipped
  releases/<stamp>/   one extracted bundle each
  current -> releases/<stamp>
```

`.env.local` and `data` are symlinked into each release, so a rollback cannot
lose them and a release cannot carry them. The last three releases are kept:

```bash
ln -sfn /opt/tutorapp/releases/<stamp> /opt/tutorapp/current
systemctl restart tutorapp
```

`deploy/update.sh` still builds on the server. It is the fallback for when you
cannot reach the box from a machine that can build, and it is slower and more
fragile.

## Backups## Backups

`data/` is lesson recordings, transcripts and notes about children, on one disk
with no replication.

```bash
cp deploy/backup.sh /opt/tutorapp/deploy/
crontab -e
# 0 3 * * *  /opt/tutorapp/deploy/backup.sh >> /var/log/tutorapp-backup.log 2>&1
```

It archives `data/` plus `.env.local` (the session secret and the API key are in
there; losing them locks every tutor out), verifies the archive is readable
rather than assuming, keeps 30 days, and copies offsite if `BACKUP_REMOTE` is
set to an rclone target. **Set it.** A backup on the same disk survives a bad
deploy, not a dead disk.

Restoring is `tar xzf` over an empty `data/`.

## After deploying

- Open `/check` on the device that will record and run it.
- Run `npm run smoke` against the deployed host with `SMOKE_BASE=https://…`.
  It creates records and deletes them again, but it does write to the live
  store, so do it before real lessons exist.
- Confirm the timezone: week boundaries follow `REPORT_TIMEZONE`, default
  `Asia/Shanghai`, not the server clock. Set it in `.env.local` explicitly even
  when the default is right, so moving the box later cannot change it silently.
- Have each tutor open `/account` and replace the password you issued them.
