# Tutor Signal

A lesson gets recorded, the tutor spends sixty seconds saying what happened, and
three audiences get three different things out of it: a diagnostic write-up for
the tutor, a short list of what to work on for the student, and one honest note
a week for the parent.

Nothing reaches a student or a parent without the tutor approving it first.

> **New here?** Read [STATUS.md](STATUS.md) first. It says what has actually been
> tested, which decisions are settled, and what is still open. This file explains
> how the system is built, and assumes you already want to know.

---

## Who can see what

Three audiences, three route groups, and no self-registration anywhere.

| | Gets in by | Sees |
|---|---|---|
| **Superadmin** `(admin)` | credentials in `.env.local` | tutor accounts; creates, suspends and resets them |
| **Tutor** `(tutor)` | email + password issued by the superadmin | only their own students, lessons, audio and drafts |
| **Student / parent** `(guest)` | an unguessable link | one page of approved content, nothing else |

Tutors get passwords because they handle the raw material daily. Families get
links instead: a nine-year-old with a password is a support queue, and a parent
will not keep an account either. A family link only ever shows content a tutor
has approved, so a leaked one is worth one weekly note — and it can be rotated.

Authorisation lives in `src/lib/access.ts`, called from each route next to the
data rather than in `proxy.ts`. Next's own guidance is that proxy-level checks
are optimistic only, so every route that touches one student's material
re-checks ownership: guessing an id returns 404, not someone else's audio.

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

**Tutor-only** is the conservative mode, and it still works: corrections and
teaching signals are spoken out loud anyway, so recording the tutor captures the
lesson's substance without capturing a child. What it cannot give you is the
student's own wording, their response latency, or anything about pronunciation.

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

Four calls, all through `src/lib/llm.ts`. Swapping providers means rewriting that
one file.

| Call | Reads | Produces |
|---|---|---|
| `diarize.ts` | raw transcript | who said each line |
| `summarize.ts` | transcript + debrief | the tutor's diagnostic write-up |
| `skills.ts` | student's topics + this lesson | proposed changes to the student model |
| `parentReport.ts` | a week of lessons + topics | a draft note for the parent |

DeepSeek has no strict `json_schema` mode and its models reject a forced
`tool_choice`, so structured output is done the honest way: `json_object` for
guaranteed-valid JSON, the shape described in the prompt, Zod validation on the
way out, and one retry with the validation error fed back.

Two gates keep the model away from people:

1. **Per lesson** — the tutor reviews proposed topic changes and ticks off the
   ones that are wrong before anything reaches the student.
2. **Per week** — the tutor edits the parent note and approves it. Until then the
   parent's page shows nothing.

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

Audio streams to the server a second at a time while the lesson runs, so a
crashed tab costs the last second rather than the whole lesson, and there is no
upload to sit through at the end. See `deploy/` for hosting, TLS and backups.

Everything is written to `data/` as JSON plus audio blobs. That directory is
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
4. **`/lesson/[id]/review`** — generate the summary, then review the topic
   changes it proposes and apply the ones you agree with.
5. **`/student/[id]`** — the student's topics over time, the weekly note to
   draft and approve, and the two family links to copy.
6. **`/s/[key]`** and **`/p/[key]`** — what the child and the parent actually see.

## Layout

```
src/lib/types.ts                 Every shared shape, plus the debrief prompts
src/lib/store.ts                 File-backed persistence (swap for a DB)
src/lib/auth.ts                  Passwords, session cookies, role guards
src/lib/access.ts                Ownership checks, next to the data
src/lib/llm.ts                   The only place a model is called
src/lib/diarize.ts               Who said each line, and the talk ratio
src/lib/summarize.ts             The tutor's write-up
src/lib/skills.ts                The student model and its proposed changes
src/lib/parentReport.ts          The weekly note

public/tutor-gate-worklet.js     The gate, on the audio thread
src/hooks/useTutorRecorder.ts    Mic capture, worklet wiring, interruption log
src/hooks/useSpeechTranscript.ts Live transcript
src/hooks/useWakeLock.ts         Keeps the screen awake for a lesson

src/app/globals.css              Design tokens and the component layer
src/app/(admin)/                 Superadmin
src/app/(tutor)/                 The tutor's workspace
src/app/(guest)/                 Student and parent pages
src/app/api/                     REST for all of the above
```

## Design

Tokens and components live in `src/app/globals.css`; screens compose from them
rather than inventing values. Type is chosen by role (`.t-hero`, `.t-display`,
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

- **No delivery.** Reports do not reach anyone; a parent has to open a link.
- **Links are the family credential.** Rotatable, but not an account.
- **Single machine.** Files on disk, no backup, no migrations.
- **Foreign services in the path.** The transcript goes through Google's
  recogniser and the four model calls go to DeepSeek. For a deployment where
  data must stay in one jurisdiction, both need replacing — the capture layer
  does not care, but `llm.ts` and `useSpeechTranscript.ts` do.
