# Status

Read this before `README.md`. The README explains how the system is built.
This says where it actually is, what was decided, and what is still open.

Last updated: 2026-09-27

---

## The short version

The whole pipeline exists and runs end to end. **No real lesson has ever gone
through it.** Everything involving a microphone, a browser, or a real person is
written but untested; everything involving the server and the model has been
exercised with real requests.

Treat it as ready to pilot, not ready to ship.

---

## What the thing does

A tutor records a lesson. The microphone captures the tutor, and — only where
the parent has given written consent — the student as well. Straight afterwards
the tutor spends sixty seconds answering five prompts about what happened.

Three different things come out of that one recording:

| Audience | Gets | Cadence |
|---|---|---|
| Tutor | a diagnostic write-up, and proposed updates to the student's topics | per lesson |
| Student | two or three things to work on, and what they've already beaten | continuous |
| Parent | one honest note about whether this is working | weekly |

The insight it is built on: **corrections are the teaching signal.** A tutor
already says "you added the denominators, they stay the same" out loud. That
sentence is a complete diagnostic record of a misconception, generated for free
during normal teaching. The sixty-second debrief adds the part a transcript
cannot capture — the tutor's own judgement about what mattered.

---

## How data moves

```
  lesson audio ──► live transcript ──┐
                                     ├──► summary (per lesson, for the tutor)
  60-second debrief ─────────────────┘         │
                                               ▼
                                     proposed topic changes
                                               │
                                     [TUTOR TICKS THEM OFF]
                                               │
                                               ▼
                                    the student's topic model
                                        │              │
                                        ▼              ▼
                              student's page     weekly parent note
                                                       │
                                            [TUTOR EDITS AND APPROVES]
                                                       │
                                                       ▼
                                                 parent's page
```

The two bracketed steps are the point of the design. Nothing an AI produces
reaches a child or a parent without the person who was in the room signing off.
The per-lesson gate is a few ticks; the weekly one is about thirty seconds.

---

## What works, and how well we know it

### Verified with real requests

- **Access control.** Two tutors were created, each with a student. Tutor B was
  then pointed at every one of tutor A's URLs by direct id: student record,
  student page, reports, lesson, review page, and the audio file. All returned
  404. Anonymous users are redirected from every page and get 403 from every
  API. A suspended tutor cannot sign in; a password reset invalidates the old
  one.
- **Consent drives capture, and cannot be forged.** A request that explicitly
  asked for `capture: "both"` on a student with no consent on file still got
  `tutor`. The server derives it from the stored record and ignores the client.
- **The four model calls.** Run for real against DeepSeek on a realistic
  fractions lesson. Output was good: the summary separated the surface mistake
  ("adds the denominators") from the root cause ("doesn't picture a fraction as
  part of a whole"), and picked up a topic that appeared only in the transcript
  and not in the debrief. The whole run cost about three cents.
- **Family links.** Work without signing in, which is the point. A wrong key
  gives 404. An unapproved weekly note is invisible to the parent and visible to
  the tutor.
- **No leakage to families.** Checked the rendered student page for the tutor's
  internal reasoning field, raw status values, and diagnostic language. Clean.

### Written, never run against real hardware

None of this can be tested without a browser, a microphone and a person:

- Microphone capture and device selection
- The gate in the AudioWorklet — threshold, hold time, gain ramp
- The level meter
- Screen Wake Lock, and auto-pause when the screen goes off
- Manual pause and resume
- Interruption logging
- The live transcript, in any language
- Audio upload and playback
- Every form and button, as an actual click rather than an API call

### Never attempted

- A real lesson, start to finish
- Speaker labelling on a real transcript — the test used clean invented dialogue,
  and real speech recognition output is much messier
- A parent reading a real note
- Any deployment

---

## Decisions already made

These are settled. Reopening them costs more than it saves, unless something new
turns up in the pilot.

| Decision | Why |
|---|---|
| **One-to-one lessons only** | In a group, attributing an inferred struggle to a specific child is guesswork. The model is made to answer "unclear", and you cannot build a personal report on "unclear". |
| **Recording the student is opt-in, per student** | Requires written consent. Without it the system falls back to tutor-only and still works — the teammate who pushed back on this was right. |
| **Tutor-only is a real mode, not a degraded one** | It loses the student's exact wording, response latency and anything about pronunciation. It keeps everything else. |
| **The tutor approves everything** | Two gates, per lesson and per week. An AI mishearing "almost didn't get it" as "didn't get it" would otherwise reach a parent, who would take it out on the child. |
| **The debrief stays private forever** | It works *because* it is private. If a tutor knew a parent would read it, they would start recording PR instead of an honest assessment, and the highest-value signal in the system would disappear. |
| **Parent notes are weekly, not per lesson** | Per lesson is noisy, turns every session into a verdict, and sends single-lesson model errors straight to a parent. A week averages both out and shows trajectory, which is what a parent is actually asking about. |
| **Student and parent see different things** | A child needs two or three things to do. A parent needs to know whether their money is working. Same data, different question. |
| **Parent tone: explicit strengths, growth framing for gaps** | A report of pure negatives is a churn machine; a report of pure positives is useless and a parent can tell. |
| **Links, not accounts, for families** | A nine-year-old with a password is a support queue. A leaked link is worth one approved weekly note, and it can be rotated. |
| **Superadmin creates tutors; tutors create their own students** | Trusting a tutor is a real decision and belongs to you. Adding a student is operational — gating it would leave a tutor stuck mid-lesson. |
| **Speaker labelling from the text, not the acoustics** | Two people in a closed room: who asks and who answers is usually obvious from the dialogue. Costs nothing, needs no on-device model, no voice enrolment. Acoustic matching is the fallback if this proves unreliable. |
| **DeepSeek, not a foreign provider** | Data residency. All four calls go through one file, so switching again is one file. |
| **English throughout** | Interface and model output. The speech-recognition language stays configurable — you cannot recognise Russian with an English recogniser. |
| **Pilot before more code** | Nothing about quality is knowable from here. |

---

## Known gaps

Not bugs — things deliberately not built yet, in rough priority order.

1. **Nothing is delivered anywhere.** A parent has to open a link and remember to
   do so. Without WeChat or email, the parent page is a dead end. This is the
   first thing to build after the pilot.
2. **The consent document is not recorded.** The app stores a name and a date.
   The actual signed paperwork lives wherever you put it.
3. **One machine, files on disk.** No backup, no migrations, no second instance.
   `src/lib/store.ts` is the only file that knows this.
4. **The transcript goes through Google.** Chrome's Web Speech API sends audio to
   Google's servers. **This likely does not work at all on site without a VPN,
   and needs checking before the pilot** — if it fails, there is no transcript,
   and without a transcript nothing downstream has anything to read.
5. **Level is not identity.** The gate cuts by loudness. A loud child near the
   microphone crosses it. Fine in a closed room with two people; not a guarantee
   anywhere else.
6. **iOS kills recording on screen lock.** No browser API prevents it. Wake Lock
   helps until the tutor presses the lock button. A native shell is the only
   real fix if phones become the primary device.
7. **The tutor has no lesson plan.** The app extracts and never gives anything
   back into the room. Feeding the student's topics into a pre-lesson screen is
   cheap — the data is already collected — and is the agreed next feature.

---

## Open questions

- **Does the speech recogniser work on site, in the language lessons are taught
  in?** Everything depends on this and it has not been checked.
- **Will a tutor actually do the debrief?** If they skip it, the system loses its
  best input. It is the one behaviour the pilot must observe honestly.
- **Would a tutor send a generated parent note without editing it?** That is the
  real test of whether the tone is right.
- **Where does this get deployed, and does the data have to stay in one
  jurisdiction?** Affects hosting, the model provider, and the transcript.

---

## Checking it yourself

```bash
npm run dev          # one terminal
npm run smoke        # another
```

`smoke` drives the whole server path against the running app: sign-in, tenant
isolation, consent, all four model calls, both approval gates, and what a family
can and cannot see. It makes real DeepSeek requests, so it costs a few cents and
takes about a minute — that is deliberate, a mocked run would prove nothing. It
deletes the records it creates. **30 checks, all passing as of this writing.**

For the browser half, open **`/check`** on the device that will actually record.
It reports secure context, microphone access, the AudioWorklet, the gate module,
the recorder, speech recognition and wake lock — then lets you test the mic and
run the recogniser in your language. That last test is the important one: if no
words appear, there is no transcript, and nothing downstream has anything to
read.

To record from a phone, the page must be served over HTTPS — a LAN address over
plain HTTP cannot touch a microphone at all, and the browser gives no visible
reason. Use `npm run dev:https`.

## Trying it

```bash
npm install
cp .env.example .env.local   # DEEPSEEK_API_KEY, SESSION_SECRET, and the two SUPERADMIN_ values
npm run dev
```

Sign in at `/login` with the superadmin credentials from `.env.local`, create a
tutor, and use the one-time password it shows you. As that tutor, add a student
and start a lesson.

To see the family pages without recording anything, open a student from the
tutor's home page — the **Links** section has a copy button for the student's
page and the parent's page.

`TUTOR_BRIEF.md` is what to hand an actual tutor before their first recording.
It is short and it matters: in tutor-only mode, a correction made silently is a
correction the system never learns about.
