# Tutor Signal

A lesson gets recorded, the tutor spends sixty seconds saying what happened, and
three audiences get three different things out of it: a diagnostic write-up for
the tutor, homework and a short list of what to work on for the student, and a
short message for the parent (Chinese and English, ready to paste into WeChat)
plus one honest note a week.

Recordings are never stored. The audio is used live and dropped; only text is
kept.

Nothing reaches a student or a parent without the tutor approving it first.

> **New here?** Read [STATUS.md](STATUS.md) first. It says what has actually been
> tested, which decisions are settled, and what is still open. This file explains
> how the system is built, and assumes you already want to know.

---

## Who can see what

Four audiences, and no self-registration anywhere.

| | Gets in by | Sees |
|---|---|---|
| **Superadmin** `(admin)` | credentials in `.env.local` | tutor accounts and each tutor's students; creates, suspends and resets tutors |
| **Tutor** `(tutor)` | email + password issued by the superadmin | only their own students, lessons and drafts |
| **Family** `(family)` `/me` + `/family` | one username + password from the tutor, shared by child and parent | two tabs: the child's topics and homework, and the parent's weekly notes |
| **Student / parent** `(guest)` `/s/[key]`, `/p/[key]` | a private link each | the same pages, without a password |

A tutor changes their issued password at `/account`; doing so signs out every
other session of theirs, which is the point of replacing a password somebody
else once read out. Suspending a tutor or resetting their password has the same
effect, because a session carries the account's token version and it is
re-checked on every request rather than trusted for a fortnight.

A child and their parent share **one sign-in** - a family uses one phone and
one WeChat. It is a **username**, not an email, because a child has none. The
tutor creates it on the student's page, sees the password once, and copies it
as a ready-made message. A reset keeps the username and
signs out every device. Passwords are generated readable (`k7mp-q2xr-h9td`: no
capitals, no 0/o/1/l/i) because they get typed on phones.

Family sessions use **their own cookie**. Every tutor page and API reads only the
staff cookie, so a child's login cannot reach a tutor screen even through a
forgotten check. The private links still work for anyone who will never keep a
password; they only show approved content and can be rotated.

Authorisation lives in `src/lib/access.ts`, called from each route next to the
data rather than in `proxy.ts`. Next's own guidance is that proxy-level checks
are optimistic only, so every route that touches one student's material
re-checks ownership: guessing an id returns 404, not someone else's lesson.

## Who gets recorded

Consent decides, and the server decides from the stored record — a client cannot
ask for more than the student's consent allows. Consent is granted through its
own action, never as a field on a general update, and the server stamps the
time; the API routes accept an explicit list of fields and ignore everything
else, so no request can reach `capture` or `recordingConsent` directly.

| | Capture | The gate is… |
|---|---|---|
| **Consent on file** | both voices | a noise floor only |
| **No consent** | the tutor alone | the privacy boundary |

**Tutor-only** is the conservative mode. Corrections and teaching signals are
spoken out loud anyway, so recording the tutor captures the lesson's substance
without capturing a child. What it cannot give you is the student's own wording,
their response latency, or anything about pronunciation.

**It also takes no transcript at all.** The browser's recogniser takes the
microphone itself — the Web Speech API cannot be handed a `MediaStream` — so it
hears the room rather than the gated signal, and would transcribe a child whose
parents consented to nothing. The audio file is clean because the gate sits
before the recorder; the transcript never could be. So in this mode the
60-second debrief is the entire record, and the server drops a transcript even
if a client sends one. Moving transcription to the server, reading the gated
file, is what removes this limitation.

**Both voices** needs one microphone between the two people, which means the
student sits further from it than the tutor. The gate threshold therefore drops
to about `0.012` and must not be raised to "clean up" the audio, or it will cut
the student out. Speaker labels come from `src/lib/diarize.ts`, which reads the
dialogue rather than the acoustics — in a room with exactly two people, who asks
and who answers is usually obvious from the text alone. If that proves
unreliable on real lessons, an acoustic check belongs in the worklet, not there.

Labelled transcripts also yield the student's share of spoken words: a blunt but
honest read on whether a lesson was a conversation or a lecture.

## The gate

In a shared room the microphone hears everyone. The signal path is
`mic → AudioWorklet → MediaRecorder`, with gain driven to zero whenever the input
sits below a tutor-set threshold. Below that line nothing reaches the recorder,
so it is never written to disk and never leaves the machine. The tutor sets the
threshold by eye on the level meter before starting, and a live indicator shows
whether the gate is open.

The gate lives in an `AudioWorklet` (`public/tutor-gate-worklet.js`), not in a
`requestAnimationFrame` loop, because rAF does not fire for a hidden page. On a
phone that locks mid-lesson a rAF gate would freeze at whatever gain it held —
either silencing the rest of the recording or recording the whole room ungated.
The audio thread keeps running regardless of page visibility, and it counts time
in frames rather than wall clock, so throttled timers cannot skew it.

`getUserMedia` also asks for `echoCancellation`, `noiseSuppression` and
`autoGainControl`, and records one channel at 24 kbit/s — transparent for a
single voice, and a fifth of the browser default over mobile data.

### What still needs testing with real hardware

- **Level is not identity.** A loud child near the microphone will cross the
  threshold. Real isolation needs speaker identification (a voice embedding
  matched per frame). That is the obvious next step and is not built here.
- **Microphone placement decides everything.** A headset boom mic gives a ~36 dB
  gap between tutor and room; a phone on the table gives about 14 dB. The second
  number is workable only in a closed room with no bystanders.
- **Gate timing.** `holdMs` is 700 ms and the gain ramp is 20 ms. Too short clips
  the first syllable; too long leaks the room between sentences.
- **Browser noise suppression varies by platform** and may fight the gate.
- **A transcript is only taken where the student consented.** See above: the
  browser recogniser cannot respect the gate.
- **The transcript leaves the device, and where it goes depends on the
  browser.** Chrome and Edge send audio to Google; Safari sends it to Apple.
  Neither is on-device. To keep audio local, replace
  `src/hooks/useSpeechTranscript.ts` with a local model (whisper.cpp via WASM)
  or a self-hosted endpoint; nothing downstream cares where segments come
  from.

## Phones, locked screens and backgrounding

A browser tab that loses the screen is the main way a lesson gets lost.

- **Screen Wake Lock** is taken when recording starts, released when it stops,
  and re-taken on every return to the foreground — the system drops it whenever
  the page is hidden. Its state is visible for the whole lesson, and where the
  API is missing the UI says so instead of pretending.
- **The screen going off pauses the recording** rather than letting it run
  unwatched. Everything so far is kept; resuming is one tap and re-takes the
  lock.
- **Pause and resume are manual too.** Recorder, gate clock and transcript pause
  together, and transcript timestamps stay monotonic across the gap.
- **Ending a lesson asks first**, since one stray tap would otherwise close it.
- **Interruptions are logged, not swallowed.** `visibilitychange`, the track's
  `mute`/`ended` events and `AudioContext` state changes are all recorded with
  timestamps, shown during recording and again on the review page. A damaged
  recording announces itself.
- **The debrief countdown runs off a wall-clock deadline**, not counted
  `setInterval` ticks, because background tabs are throttled to roughly one
  timer call a minute. It catches up on return instead of drifting.

**iOS tears the audio session down on lock** and no browser API brings it back.
Wake lock is the only defence, and it fails if the tutor presses the lock button
themselves. If phones are a hard requirement this needs a native shell
(Capacitor or similar) with a background audio mode. Android Chrome usually
keeps capturing with the screen off, but OEM battery optimisation can still kill
the tab — which is what the interruption log is for.

## What the model is asked to do

All model calls go through `src/lib/llm.ts`. Swapping providers means rewriting
that one file.

| Call | Reads | Produces |
|---|---|---|
| `diarize.ts` | raw transcript, in-room lessons only | who said each line |
| `summarize.ts` | transcript + debrief | the tutor's diagnostic write-up, plus a homework focus line |
| `parentMessage.ts` | transcript + debrief | a 3-4 sentence WeChat message, English + Chinese |
| `skills.ts` | student's topics + this lesson | proposed changes to the student model |
| `parentReport.ts` | a week of lessons + topics | a draft note for the parent |

DeepSeek has no strict `json_schema` mode and its models reject a forced
`tool_choice`, so structured output is done the honest way: `json_object` for
guaranteed-valid JSON, the shape described in the prompt, Zod validation on the
way out, and one retry with the validation error fed back (or after an empty
reply, which DeepSeek returns now and then).

Speed: every call runs at `reasoning_effort: "low"`, and the summary and the
parent message run in parallel. Speaker labelling is skipped for online lessons,
where the student's voice is mostly removed by echo cancellation anyway. A
classroom lesson takes about 11-18 seconds from button to result.

Two gates keep the model away from people:

1. **Per lesson** — the tutor reviews proposed topic changes and ticks off the
   ones that are wrong before anything reaches the student, and sends the
   homework only when it is ready.
2. **Per week** — the tutor edits the parent note and approves it. Until then the
   parent's page shows nothing.

## Telling the tutor

The tutor's home carries a feed of what the children have been doing. With
`TELEGRAM_BOT_TOKEN` set, the same two events also go to Telegram: a child
finished their homework, and - the one worth interrupting for - a child
finished it badly enough that the topic needs explaining again.

Connecting is two taps: the tutor presses a button, presses Start in Telegram,
and the page notices. No codes typed, no chat ids. It is HTTP calls to one
address - no library, no webhook, no second process (`src/lib/telegram.ts`).

The server reaches Telegram from wherever it runs; a tutor in mainland China
needs a VPN to read. Telegram holds messages until the client fetches them, so
nothing is missed by being offline - only the live popup. If Telegram is
unreachable when something happens the message is dropped rather than queued:
the site's own feed is the record, this is the convenience on top.

## Running it

```bash
npm install
cp .env.example .env.local   # fill in all four values
npm run dev
```

Sign in at `/login` as the superadmin, create a tutor, and hand them the one-time
password shown. Nobody can sign themselves up.

Open `/check` on the recording device first — it reports exactly which parts of
the capture path work there, and lets you test the microphone and the
recogniser. To record from a phone use `npm run dev:https`: a LAN address over
plain HTTP is not a secure context, so `getUserMedia` is blocked outright.

`npm run smoke` drives the whole server path end to end against a running dev
server, including real model calls. It cleans up after itself.

Safari, Chrome or Edge. The live transcript uses the Web Speech API, and the
engine behind it differs: Chrome and Edge send audio to Google, **Safari sends
it to Apple**, and other Chromium builds (Brave, Arc, Vivaldi) ship without
either and fail with a misleading `network` error. Firefox has no support at
all. Where Google is unreachable, Safari is the one that still works. Audio still records everywhere — only the transcript
is missing.

No audio leaves the device. The recorder still runs the gate and the timers, but
every encoded chunk is dropped. See `deploy/` for hosting, TLS and backups.

Everything is written to `data/` as JSON plus homework pictures. That directory is
gitignored and is the only persistence layer; swap `src/lib/store.ts` for a real
database without touching a single caller.

## Flow

1. **`/lesson/new`** — pick a student (or add one, with consent if you hold it),
   name the lesson, choose its language, and pick online or classroom. Capture
   mode is derived from consent, not from this form.
2. **`/lesson/[id]`** — choose the microphone, set the gate, record. Live
   transcript on screen; pause and resume at will.
3. **`/lesson/[id]/debrief`** — five prompts, sixty seconds, auto-advancing.
   Transcribed answers are editable before saving.
4. **`/lesson/[id]/review`** — three steps. The summary and the parent message
   start writing on their own when the page opens. Then the homework: add a
   picture, adjust the focus line, send it. Then copy the Chinese message into
   WeChat (edit the English and the Chinese is translated again).
5. **`/student/[id]`** — topics over time, game style, sign-ins for the child
   and the parent, the weekly note, and the private links.
6. **`/me`** and **`/family`** (one family sign-in, two tabs) or **`/s/[key]`**,
   **`/p/[key]`** (by link) — what the child and the parent see. Homework opens
   full-screen as a game in the student's style.

Homework is practice games plus a picture, and either half can stand alone.

The games are three fixed mechanics - pick the word for the gap, build the
sentence from word tiles, keep the words that follow a rule - and only the
words inside change. They are written by DeepSeek from what the child got
wrong in that lesson (`src/lib/exercises.ts`): the wrong options in a
multiple choice are the mistakes this child actually makes, not random words.
The tutor builds them, reads them, and sends them. Every game reports how many
it got right, and `src/lib/homework.ts` adds those up per topic, which is what
the parent's page shows: not "did they do it" but "is the thing they kept
getting wrong getting better".

Everything can be played again - one game or the whole quest from the child's
last screen, and the tutor can hand the homework back entirely. A replay
overwrites the score the child sees, but the FIRST score is kept and never
changes: the parent's progress is built from first attempts, so a child
replaying from memory cannot make the picture look better than what they
actually knew.

A wrong answer is worth one more go: the child reads why and puts it right
while the explanation still means something. The score counts the first
answer - the retry is for learning, not for the number. The browser sends
what the child answered and the server does the marking, so a score cannot be
sent in from outside, and every round is kept for the tutor to read back.

A child nobody has taught yet does not have to wait for a lesson: `kind:
"intro"` on a lesson swaps the debrief questions for five about the child, and
everything downstream - topics, games, the note home - is built from that.

The picture half is the same every time: describe the picture, say what happens
next, give three adjectives. The child types the answers, or taps the microphone and
says them - the browser's recogniser turns speech into text (Apple in Safari,
Google in Chrome) and only the text is kept; no recording of a child is ever
made or stored here. They hand in once; the tutor
reads them on the lesson page. Themes are a list in `src/lib/gameStyles.ts`, and adding one is one entry -
no CSS. An entry has a name, the words the game screen uses ("quest" /
"story", "XP" / "stars"), `imageStyle` - how its pictures are described to
the image model, never naming a game or brand - and a `palette` of five
colours that paints the shared game skin, the child's quest card and the
level bar. Minecraft alone has a hand-made skin with textures. Pictures are
drawn by Alibaba Wan when `DASHSCOPE_API_KEY` is set (see `.env.example`):
DeepSeek writes a scene from the lesson, Wan draws three options in the
theme's style, the tutor picks one. The pixel font is bundled at build time,
so nothing is fetched from Google - which matters in China.

Outside that loop: **`/account`** for a tutor to replace the one-time password
they were issued, and **`/check`** to test a device before recording on it.

## Layout

```
src/lib/types.ts                 Every shared shape, plus the debrief prompts
src/lib/store.ts                 File-backed persistence (swap for a DB)
src/lib/auth.ts                  Passwords, session cookies, role guards
src/lib/access.ts                Ownership checks, next to the data
src/lib/llm.ts                   The only place a model is called
src/lib/diarize.ts               Who said each line
src/lib/summarize.ts             The tutor's write-up
src/lib/skills.ts                The student model and its proposed changes
src/lib/parentReport.ts          The weekly note
src/lib/parentMessage.ts         The per-lesson WeChat message, EN + ZH
src/lib/gameStyles.ts            Homework looks (Minecraft first)

public/tutor-gate-worklet.js     The gate, on the audio thread
src/hooks/useTutorRecorder.ts    Mic capture, worklet wiring, interruption log
src/hooks/useSpeechTranscript.ts Live transcript
src/hooks/useWakeLock.ts         Keeps the screen awake for a lesson

src/app/globals.css              Design tokens and the component layer
src/app/(admin)/                 Superadmin
src/app/(tutor)/                 The tutor's workspace
src/app/(family)/                Child and parent, signed in
src/app/(guest)/                 Child and parent, by private link
src/app/api/                     REST for all of the above
src/app/check/                   Device diagnostics, no login needed

scripts/smoke.mjs                End-to-end check of the server path
deploy/                          Caddyfile, backup script, hosting notes
```

## Design

Tokens and components live in `src/app/globals.css`; screens compose from them
rather than inventing values. Colour carries one meaning each: green is done or
go, amber is "this needs you", blue is in progress. The font is Figtree,
bundled at build time like the game font. The design was drawn first as phone
screens in Claude Design; on a wide screen the lesson and student pages split
into two columns - what to read on the left, what to do on the right.

The tutor's home is built around "Needs you": every recent lesson that is still
waiting for a debrief, a review, its homework or its parent message shows up
there until it is done. Type is chosen by role (`.t-hero`, `.t-display`,
`.t-title`, `.t-body`, `.t-small`, `.t-caption`, `.t-eyebrow`), not by size.

`[data-density="comfortable"]` raises the base size for the family pages and the
login screen — a parent reads one page once, usually on a phone. The tutor's
workspace stays compact because someone is in it all day.

Each screen has exactly one focal surface (`.card-focus`) and one dominant
element. On the student's page that is the first goal; the other goals are
listed, not carded, so they cannot compete. On the parent's page the opening
paragraph is the largest thing because it answers "is this working?", and the
at-home block is the only accented surface because it is the only thing on the
page a parent does.

Motion is deliberate: custom `ease-out`, press feedback at `scale(0.97)`, hover
states gated behind `(hover: hover) and (pointer: fine)` so a tap does not leave
a row highlighted, and `prefers-reduced-motion` keeps opacity while dropping
movement. Nothing triggered many times an hour animates at all.

## Known limits

- **No automatic delivery.** The tutor copies the parent message into WeChat by
  hand; the weekly note waits for the parent to open it.
- **Single machine.** Files on disk, no migrations, no second instance. The
  nightly `deploy/backup.sh` runs from `/etc/cron.d/tutorapp-backup`, and
  `npm run backup:pull` brings the newest archive to a second machine. Set
  `BACKUP_REMOTE` to an rclone target for an automatic offsite copy.
- **Foreign services in the path.** The transcript goes through Google's
  recogniser and the model calls go to DeepSeek. For a deployment where
  data must stay in one jurisdiction, both need replacing — the capture layer
  does not care, but `llm.ts` and `useSpeechTranscript.ts` do.
