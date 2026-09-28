# Deploying

A VPS with a persistent disk. Not Vercel or any other serverless host: the app
writes to the filesystem, and there the filesystem does not survive between
requests, so it fails as a matter of correctness rather than performance.

For a pilot in mainland China, put the box in Hong Kong with CN2 GIA routing —
Hong Kong is outside the mainland, so no ICP filing, and the route is what
decides whether the app loads at eight in the evening.

## Setup

```bash
# Node 20+, git, caddy, ffmpeg (ffmpeg only if you add silence trimming later)
git clone https://github.com/alibucci/tutorapp /opt/tutorapp
cd /opt/tutorapp
npm ci
cp .env.example .env.local   # fill in all four values
npm run build
```

Run it under a supervisor so it comes back after a reboot:

```ini
# /etc/systemd/system/tutorapp.service
[Unit]
After=network.target

[Service]
WorkingDirectory=/opt/tutorapp
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
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

Then open `/check` on a real device and confirm **Secure context: OK**.

## Backups

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
