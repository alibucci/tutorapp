# Status

Where aloudli actually is: what works, what was decided, what is still open.
How it is built is in [README.md](README.md).

Last updated: 2026-11-20

---

## The short version

aloudli is live at aloudli.com, on a Hong Kong server that mainland China can
reach, and real lessons have gone through it since early October. Several
decisions below were changed by what those lessons showed.

Since 18 November the app does the work after a lesson by itself: once the
tutor's debrief is in, the server writes the summary, builds the homework and
sends it to the child. Everything that reaches a **parent** still goes through
the tutor.

---

## What happens after a lesson

```
  lesson clips ──► server transcription ──┐
                                          ├──► summary + parent message
  debrief (spoken or typed) ──────────────┘          │
                                                     ├──► homework, built and SENT by itself
                                                     │
                                                     ├──► proposed topic changes
                                                     │         [TUTOR APPLIES THEM]
                                                     │
                                                     └──► parent message
                                                               [TUTOR COPIES IT INTO WECHAT]

  a week of lessons ──► draft parent note ──► [TUTOR EDITS AND APPROVES] ──► parent's page
```

Lessons created before `AUTO_SINCE` (`src/lib/homework.ts`, 18 Nov 02:00
UTC+5) keep the old manual way, so opening an old lesson never sends homework
a tutor held back. When an automatic step fails, it shows as a to-do on the
tutor's home screen.

---

## What exists

| Area | State |
|---|---|
| One-to-one lessons | Online or in the room. English or Chinese. |
| Group lessons | In the room, about three children, one recording. Each child gets their own lesson, built only from their own lines (`groupLesson.ts`). |
| Transcription | On the server (Deepgram Nova-3, or Qwen3-ASR as the fallback). Pieces of 8–25 s go up while the lesson runs and retry on a weak connection. Audio is never stored. |
| Debrief | Five prompts with no clock. Spoken or typed. Group lessons: three questions per child. |
| Homework | Games built from the lesson's mistakes. The kinds depend on the learner's profile (`profile.ts`, `exercises.ts`). Also: extra homework from the tutor's own words, number homework made by code (`sums.ts`), and an optional picture. |
| Programmes | Bible stories (`christianity.ts`). A tutor switches them on per learner, and only when the parent asked. Then they run one after another. Which tutors see them: `CHRISTIANITY_TUTORS`. |
| Pronunciation checks | SpeechSuper. Adults only, and the learner must agree themselves. |
| Families | One sign-in shared by the child and the parent, plus private links that can be rotated. |
| Tutor notices | A feed on the home screen, plus Telegram and email (Resend; sent only to an address the tutor confirmed). |
| Help | A Help page for tutors with how-to films and the same steps in writing (`help.ts`). |
| Lesson plans | Saved groups, a plan per child or group, one lesson on a topic or a month of them, slides with tutor-only notes, printable sheets, video searches, an offline file, a check of the lesson against its plan, a personal library. Only for `LESSON_PLANS_TUTORS` (Victor first). |
| Admin | The superadmin creates, suspends and resets tutors. |
| Other | Moving a lesson started under the wrong child, archiving a student, themes made from a description of the learner. |

---

## How well we know it

**Automated.** `npm run smoke` drives the whole server path with real model
calls. It has about 190 checks: access control, consent, every model call,
the approval gates, homework, family sign-ins and pronunciation consent. It
was not re-run for this update.

**Tested in real use.** Recording and transcription on phones in China,
including a weak connection. The debrief on an iPhone. Live testing of the Bible
stories by Viktor. The bugs these surfaced are fixed (see the commits from
October and November).

**Not proven yet:**

- Who-said-what in a real group lesson. The only test was a 64-second recording
  in which everyone was called by name, one at a time. Its labels were never
  checked against who really spoke.
- Automatic homework at scale, with nobody looking at it before the child does.
- A parent reading weekly notes over several weeks.

---

## Decisions already made

These are settled. Reopening one costs more than it saves, unless real lessons
show something new.

| Decision | Why |
|---|---|
| **Homework sends itself** (since 18 Nov) | The tutor should not have to build and send homework. They keep the corrections: build different games before the child starts, take it back (after that, only the tutor sends it), edit the tip. |
| **Anything for a parent goes through the tutor** | An AI mishearing "almost didn't get it" as "didn't get it" would reach a parent, who would take it out on the child. The weekly note needs approval; the WeChat message is copied by hand. |
| **Topic changes are applied by the tutor** | They drive what the child sees as their goals. |
| **The debrief stays private forever** | It works because it is private. If tutors wrote for parents, the most valuable input in the system would turn into PR. |
| **Recording the student is opt-in, per student** | It needs written consent. A group lesson records every child's voice only if every family consented. |
| **Without consent: the tutor's voice and no transcript** | The gate cuts by loudness, not by who is speaking, so a transcript could pick up the child. The debrief is the whole record. |
| **Audio is never stored** | Each piece is held in memory for one request to the recogniser, then dropped. Only text is kept. |
| **Transcription on the server, not in the browser** | The browser's recogniser depended on the browser: Chrome sends audio to Google, which mainland China cannot reach. Recording in the browser and recognising on the server works the same everywhere. |
| **Group lessons are in the room, about three children** | Who said what comes from the text: the tutor calls a child by name, the model labels the lines that follow, and the tutor checks the labels. Voice-based separation was tried: Deepgram merged three speakers into one or two. |
| **Debrief answers are tagged by prompt, not sliced by time** | The first real debrief put all five answers in the last field: timestamps mark when the recogniser answered, not when the words were said. |
| **Parent notes are weekly, not per lesson** | Per lesson is noisy and sends single-lesson model errors straight to a parent. A week shows trajectory. |
| **Families: one sign-in, child and parent together** | A family shares one phone and one WeChat. A username, not an email, because a child has none. Private links stay for families who will not keep a password. |
| **Pronunciation checks only for adults who agree themselves** | A voice is sensitive, and the recording goes to Hong Kong. Never a child, never on a tutor's say-so. |
| **Number homework is made by code** | The model only reads the request. A child marked wrong for a right answer stops trusting the game. |
| **Sessions are re-checked on every request** | Suspending a tutor or resetting a password has to take effect now, not when the cookie expires. |
| **Superadmin creates tutors; tutors create students** | Trusting a tutor is a decision for the superadmin. Adding a student is routine, and a tutor should not get stuck mid-lesson. |
| **DeepSeek for text** | Data residency. All calls go through `llm.ts`. |
| **English interface; lessons in English or Chinese** | The interface and the model's output are in English. The parent message is in English and Chinese. |
| **Hong Kong VPS; releases are built on the dev machine** | Hong Kong needs no ICP filing. Building on the server failed five different ways. See [deploy/README.md](deploy/README.md). |

---

## Known gaps

In rough order of priority.

**Lesson plans, not built yet** (spec 20 Nov, release order 7-9):
   recording with no network that sends later (needs Victor's decision on
   keeping audio on the device), the Christianity track for live lessons,
   and school textbooks (scenario 2). **Plan pictures are off**: the server
   has no DashScope key, and the local key is refused by the image model
   (`AccessDenied.Unpurchased`); slides use emoji until Victor gives one.


1. **Nothing is pushed to parents.** The tutor pastes the message into WeChat by
   hand, and the weekly note waits for the parent to open their page. Tutors do
   get notices.
2. **The Help films show the old manual homework.** Chapters "Build the
   homework" and "Send and see results" predate 18 November. The re-shoot list is
   in `~/Desktop/aloudli-film/notes/REFILM-auto-homework.md`.
3. **Bible story building often hits the token limit** (`christianity.ts`,
   `maxTokens: 6000`). Raising it was offered. Not done, because the code is
   Viktor's.
4. **Group labelling is untested on messy speech.** Children answering without
   being called, or talking over each other.
5. **The signed consent document is not stored.** The app keeps only a name and
   a date.
6. **One machine, files on disk.** No database, no second instance;
   `src/lib/store.ts` is the only file that knows this. Backups run nightly from
   `/etc/cron.d/tutorapp-backup` and `npm run backup:pull` copies the latest
   one to a second machine. This document does not record whether
   `BACKUP_REMOTE` (an automatic offsite copy) is set on the server.
7. **The transcript leaves the region.** Deepgram is a US service. Qwen3-ASR
   (Alibaba) is the option for keeping the audio with a Chinese provider.
8. **Level is not identity.** The gate cuts by loudness, so a loud child near
   the microphone gets through.
9. **iOS stops recording when the screen locks.** The wake lock helps until the
   tutor presses the lock button. Only a native app would fix this.
10. **No lesson plan for the tutor.** The app collects everything that would
    feed a pre-lesson screen, but gives nothing back to use in the room.

---

## Open questions

- **Does automatic homework hold up?** Watch how often tutors take homework
  back or rebuild it. That is the measure.
- **Do tutors still do the debrief once homework no longer waits for them?**
  The debrief is the best input in the system.
- **Do tutors send the parent message and the weekly note without editing
  them?** That is the real test of whether the tone is right.
- **Do the who-said-what labels hold in a real group?** The tutor's
  corrections on the check screen will show it.
