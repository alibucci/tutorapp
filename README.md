# aloudli

A tutor records a lesson, and spends a minute after it saying what happened.
From that, aloudli makes three different things for three people:

- **the tutor** gets a diagnostic summary;
- **the child** gets homework built from their own mistakes;
- **the parent** gets a short message (English and Chinese, ready for WeChat)
  and one honest note a week.

Audio is never stored; only text is kept. Homework goes to the child by itself.
Nothing reaches a parent until the tutor approves it.

## Docs

| File | For | What |
|---|---|---|
| [STATUS.md](STATUS.md) | anyone working on it | where it is: what is proven, settled decisions, gaps, open questions |
| README.md (this) | developers | how it is built |
| [deploy/README.md](deploy/README.md) | whoever deploys | server setup, TLS, releases, backups |
| [TUTOR_BRIEF.md](TUTOR_BRIEF.md) | a new tutor | what to do in and after a lesson (the app's Help page has the films) |

The files keep facts in one place each. Decisions and their reasons live in
STATUS. Mechanics live here. Server steps live in deploy. Each file links to
the others rather than repeating them.

---

## Running it

```bash
npm install
cp .env.example .env.local   # four required values; everything else is optional
npm run dev
```

Sign in at `/login` with the superadmin credentials from `.env.local`. Create a
tutor and sign in with the one-time password it shows. As that tutor, add a
student and start a lesson. Nobody can sign themselves up.

| Command | Does |
|---|---|
| `npm run dev:https` | dev over HTTPS. Without it a phone on the LAN gets no microphone at all. |
| `npm run smoke` | ~190 end-to-end checks against a running server. Real model calls: a few cents, about a minute. It cleans up after itself. |
| `npm run release` | build here, upload, switch, verify, roll back on failure (see deploy) |
| `npm run backup:pull` | copy the newest server backup to this machine |

Open **`/check`** on any device before recording on it. It tests the
microphone and the transcription.

Optional features turn on with their keys in `.env.local`. Without a key, a
feature is hidden, not broken. `.env.example` lists every key and what it does.

| Key(s) | Turns on |
|---|---|
| `DEEPGRAM_API_KEY` or `DASHSCOPE_API_KEY` | transcription (Deepgram wins if both are set) |
| `TELEGRAM_BOT_TOKEN` | Telegram notices |
| `RESEND_API_KEY` | email notices |
| `SPEECHSUPER_APP_KEY` + `SPEECHSUPER_SECRET_KEY` | pronunciation checks for adults |
| `HOMEWORK_PICTURE_AI=on` + `DASHSCOPE_API_KEY` | drawn homework pictures (off by default) |
| `CHRISTIANITY_TUTORS` | which tutors see the Bible-story programme |
| `PARENT_QUOTE_TUTORS` | which tutors' parent messages quote the child (tried with Victor first) |
| `LESSON_PLANS_TUTORS` | lesson plans, slides, sheets, offline file, saved groups, library (Victor first) |
| `PLAN_IMAGES_PER_CARD`, `PLAN_IMAGES_PER_MONTH` | caps on plan pictures (default 6 a lesson, 150 a tutor a month) |

All data lives in `data/` as JSON files plus images. The folder is gitignored
and is the only storage. `src/lib/store.ts` is the only file that knows this,
so it can be swapped for a database without touching any caller.

---

## Who can see what

| | Gets in by | Sees |
|---|---|---|
| **Superadmin** `(admin)` | credentials in `.env.local` | tutors and their students; creates, suspends and resets tutors |
| **Tutor** `(tutor)` | email + password from the superadmin | only their own students and lessons |
| **Family** `(family)` `/me`, `/family` | one username + password, shared by child and parent | the child's homework and goals; the parent's notes |
| **By link** `(guest)` `/s/[key]`, `/p/[key]` | a private link each | the same pages, no password |

- **Authorisation is checked next to the data.** `src/lib/access.ts` is called
  from every route, not from `proxy.ts`. A guessed id returns 404.
- **Sessions are re-checked on every request.** Changing a password,
  suspending a tutor or resetting a sign-in takes effect on the next click.
- **A family session has its own cookie.** Tutor pages read only the staff
  cookie, so a child's login cannot reach a tutor screen.
- **Passwords are generated readable** (`k7mp-q2xr-h9td`), because they get
  typed on phones.
- **Private links show only what the family may see,** and can be replaced.
- **Fields are whitelisted.** API routes accept an explicit list of fields, so
  no request can write consent or capture mode directly. Consent has its own
  action, with a time stamped by the server.

---

## Recording

The student's consent decides what is captured. The server derives the
capture mode from the stored record, so a client cannot ask for more.

| | Captured | Transcript | The gate is… |
|---|---|---|---|
| **Consent on file** | both voices | yes | a noise floor (threshold ~0.012) |
| **No consent** | the tutor | **none**, and the server drops one if sent | the privacy boundary |

A group lesson records both voices only if every child has consent.

**The gate.** The audio path is `mic → AudioWorklet → MediaRecorder`. The gain
drops to zero whenever the input is below a threshold the tutor sets by eye
(`public/tutor-gate-worklet.js`). It runs on the audio thread, so a hidden page
cannot freeze it. The gate cuts by loudness, not by who is speaking. That is
why tutor-only mode keeps no transcript.

**Transcription happens on the server.** The browser records the lesson in
pieces of 8–25 s (`useClipTranscriber.ts`); a piece ends at a pause. It sends
each piece compressed and gets text back. Weak connections are expected:
failed pieces retry by themselves, at most two go at once, and the transcript
is also kept on the device until the server has it. `src/lib/speech.ts` is the
only file that knows the provider: Deepgram Nova-3, or Qwen3-ASR. The audio
exists only in memory for one request.

**Phones.** A wake lock keeps the screen on while recording. If the screen
goes off anyway, the recording pauses rather than running unwatched.
Interruptions (page hidden, track muted or ended, audio suspended) are logged
and shown on the review page. iOS stops capture when the screen locks, and no
browser API prevents it.

**The debrief** has five prompts and no clock. The tutor speaks or types.
Each answer is tagged by the prompt that was on screen, not sliced by time. A
first lesson with a new child (`kind: "intro"`) asks five questions about the
child instead.

---

## After the lesson

`src/lib/autoHomework.ts` runs on the server via `after()` once the debrief is
saved. It does whatever is still missing, and it is safe to call again:

1. **Summary and parent message**, in parallel (`summarize.ts`,
   `parentMessage.ts`). A parent message the tutor edited is never overwritten.
2. **Homework games**, built from the mistakes in the summary (`exercises.ts`).
3. **Send** to the child.

The tutor can still: build different games before the child starts, take the
homework back (from then on, only the tutor sends it), edit the tip, and
preview it. Lessons from before `AUTO_SINCE` (`homework.ts`) stay manual. A
failure becomes a to-do on the tutor's home screen.

What still waits for the tutor:

- **Topic changes** (`skills.ts`). They are proposed per lesson. The tutor
  unticks wrong ones and applies the rest. The child's goals change only then.
- **The parent message.** The tutor copies it into WeChat. Editing the English
  re-translates the Chinese. Code, not the model, adds two fixed lines
  (`parentLines.ts`). One is the child's own words: the model only picks a
  number from the child's labelled lines (`quoteCandidates`), and code copies
  that line from the transcript. The other is the parent-page link, added at
  copy time only once an approved weekly note exists, and never stored. The
  parent's wish (`profile.parentWish`) reaches only this message.
- **The weekly note** (`parentReport.ts`). The parent's page shows nothing until
  the tutor approves it. Weeks follow `REPORT_TIMEZONE`.

---

## Homework

**What a learner gets follows from their profile** (`profile.ts`): age, level,
goal and a line about them. A child at school gets the same three games every
time — fill the gap, build the sentence, keep the words that follow a rule —
so no lesson is spent explaining a game. Someone working on their accent gets
things to listen to and say. Only the words change, and they come from this
learner's mistakes: the wrong options in a multiple-choice question are
mistakes this child actually makes.

**Marking happens on the server.** The browser sends the answer, not a score.
A wrong answer gets one more try, with the reason shown; the score counts the
first try. Replays overwrite the score the child sees, but the first score is
kept forever, and the parent's progress view is built from first attempts.

**Other sources of homework:**

- **Extra homework**: from the tutor's own words, with no lesson behind it
  (`kind: "practice"`).
- **Number homework**: the model reads the request ("times tables 3 to 5"), and
  `sums.ts` makes every question and answer, so each one is right by
  construction.
- **Programmes** (`programmes.ts`): a series that runs by itself. The first
  item goes out when the programme is switched on; the next one when the
  learner finishes the current one. Bible stories are the only programme today
  (`christianity.ts`, cards in `src/content/christianity`). An item goes out
  only if its card is approved. The model retells the story, and code checks
  the retelling against the card.
- **A picture** to describe. The tutor uploads it, or Wan draws one if switched
  on (`imageGen.ts`, `scenePrompt.ts`).

**Spoken answers** in homework still use the browser's own recogniser
(`useSpeechTranscript.ts`), so they depend on the browser. Only the text is
kept. **Pronunciation checks** (`pronounce.ts`, SpeechSuper) are only for adults
who agreed themselves (`voice.ts`).

**Themes** (`gameStyles.ts`): each one is a list entry with words, a five-colour
palette and a picture style — no CSS. There are ready-made themes, a plain look
for adults, and a theme made from the tutor's description of the learner
(`themeGen.ts`, contrast checked in code). A theme never names a game, film or
brand in what it sends to the picture model.

---

## Group lessons

In the room, about three children, one recording (`/lesson/[id]/group`).

1. Clips are transcribed line by line.
2. `labelGroupLines` (`diarize.ts`) suggests who said each line, mostly from the
   tutor calling children by name.
3. The tutor checks and corrects the labels.
4. The lesson is split into one lesson per child (`group/split`). Each child's
   lesson gets only their own lines, plus the tutor's lines next to them
   (`groupLesson.ts`). Other children's mistakes reach neither this child's
   summary nor their parents.

The debrief asks three questions about each child, and none shared.

---

## Lesson plans

Before the lesson rather than after it. Behind `LESSON_PLANS_TUTORS`; for
anyone else none of it exists (pages and routes are 404).

- **Saved groups** (`/groups`, `groups.ts`): a name and 2–6 children, picked in
  one tap on New lesson. Archiving a child takes them out of their groups.
- **A plan** (`/plans/[id]`, `plans.ts`) belongs to one child or one group and
  is a board of lesson cards: dragged by a handle (pointer events, so a
  tablet works), duplicated, removed, marked done or moved. "Next" is the
  first card still planned. Cards come from "I'll name a topic" (one lesson,
  slides written straight away) or "Suggest a month" (topics in order, none
  the children have had).
- **Materials** (`lessonPlan.ts`): slides in five parts (warm-up, words, game,
  speaking, wrap-up; 8/11/14 for 30/45/60 minutes), notes for the tutor,
  word cards, a fill-the-gap sheet and a colouring page, and video searches
  for YouTube and Bilibili. The model gets ages, levels and interests, never
  a name. Writing runs after the request (`after()`), one job per card.
- **Rebuilding** keeps every slide the tutor changed by hand at its place
  (`editedAt`); one slide can be rewritten on its own.
- **Groups of mixed levels**: slides are pitched at the weakest child, and
  the words, game and speaking slides carry a `harder` step for the stronger
  ones. The tutor reveals it on the child's screen with "Harder" or the H
  key; the next slide starts easy again.
- **Slides** (`deck.ts`, `deckFor.ts`) are one self-contained HTML document:
  the tutor's page with notes and the next slide, and a second window for the
  child with the slide alone. The offline file is the same document with the
  pictures written into it; a multi-lesson file holds several in frames.
- **Pictures** (`planImages.ts`) use the homework picture switch and key.
  One at a time for the server, capped per lesson and per tutor a month,
  refunded when refused. A missing picture is the slide's emoji, or the word
  in outline on a colouring page.
- **Against the plan** (`planCheck.ts`): a lesson started from a card is
  checked when its summary is written (a group lesson once, at the split).
  The model marks each plan point done, partly or missed by number; the tutor
  decides whether the rest goes into the next planned card.
- **Library** (`/library`): every written lesson of this tutor, to search,
  mark "worked" or "did not suit", copy into another plan or save offline.
- **Bible stories for live lessons** (`storySlides.ts`): a separate track on
  the board, only while the programme is open to the tutor
  (`CHRISTIANITY_TUTORS`) and switched on for every child of the plan; the
  model never adds one. Same cards and checks as the homework: the model tells
  the story, code checks every fact and every forbidden word (slides and
  notes) before it is shown; questions, order of events, today's habit and the
  ready-made drawings come from the card. No slide is rewritten or drawn on
  its own, and stories stay out of the library. Taught (checked or marked
  done), a story moves the same programme place the homework follows, and
  the parent's message carries the story's checked line.

---

## Models and outside services

| Service | For | File |
|---|---|---|
| DeepSeek | every text call; one retry with the validation error | `llm.ts` |
| Deepgram / Qwen3-ASR | lesson, debrief and mic-check transcription | `speech.ts` |
| SpeechSuper (Hong Kong) | pronunciation scores; no name or id is sent | `pronounce.ts` |
| Alibaba Wan | homework pictures (off by default) | `imageGen.ts` |
| Resend | email notices, only to an address the tutor confirmed | `email.ts` |
| Telegram | notices: homework finished / finished badly | `telegram.ts`, `notices.ts` |

Each service is reached from one file, so swapping a provider means rewriting
that file. DeepSeek has no strict JSON schema and rejects forced tool calls, so
the code asks for `json_object`, describes the shape in the prompt, and
validates with Zod.

---

## Layout

```
src/lib/
  types.ts            every shared shape, plus the debrief prompts
  store.ts            file-backed storage (swap for a DB)
  auth.ts access.ts   sessions, roles, ownership checks
  llm.ts speech.ts    the only model and transcription calls
  autoHomework.ts     the after-lesson chain: summary, games, send
  summarize.ts skills.ts parentMessage.ts parentReport.ts
  exercises.ts sums.ts profile.ts homework.ts speaking.ts
  programmes.ts christianity.ts      series homework
  diarize.ts groupLesson.ts          who said what; one lesson per child
  moveLesson.ts                      a lesson started under the wrong child
  gameStyles.ts themeGen.ts themeFor.ts imageGen.ts scenePrompt.ts
  notices.ts telegram.ts email.ts feed.ts
  pronounce.ts voice.ts help.ts
  groups.ts plans.ts lessonPlan.ts planCheck.ts planImages.ts
  deck.ts deckFor.ts planShared.ts tutorList.ts storySlides.ts   lesson plans
src/content/          programme cards (Bible stories)
src/hooks/            recorder, clip transcriber, browser recogniser, wake lock
public/tutor-gate-worklet.js         the gate, on the audio thread

src/app/(admin)/ (tutor)/ (family)/ (guest)/   one route group per audience
src/app/api/          REST for all of the above
src/app/check/        device check, no login

scripts/smoke.mjs     end-to-end server checks
scripts/release.sh    build here, ship the bundle
deploy/               Caddyfile, backup and fallback update scripts
```

---

## Design

Tokens and components live in `src/app/globals.css`; screens compose from them.
Each colour has one meaning: green is done or go, amber is "this needs you",
blue is in progress. Type sizes come from roles (`.t-hero` … `.t-caption`), not
pixel values. Family pages and login use `[data-density="comfortable"]`. The
tutor's workspace stays compact.

The tutor's home screen is built around **Needs you**: anything still waiting on
the tutor, or anything that failed automatically, stays there until it is done.
Each screen has one focal card. The child's page shows what they have won, with
no levels or XP. The parent's page leads with the answer to "is this working?".

Motion: custom `ease-out`, `scale(0.97)` on press, hover only on fine pointers,
and `prefers-reduced-motion` respected. Nothing used many times an hour is
animated. Fonts (Figtree and the pixel font) are bundled, so nothing is fetched
from Google.
