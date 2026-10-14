/**
 * End-to-end check of the server path, against a running dev server.
 *
 * Covers everything that does not need a browser: sign-in, tenant isolation,
 * consent driving capture, the model calls, the tutor's two approval
 * gates, and what a family can and cannot see. Costs a few cents in DeepSeek
 * usage because the model calls are real - that is the point of it.
 *
 *   npm run dev          # in one terminal
 *   npm run smoke        # in another
 */

import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "").trim()]),
);

let pass = 0;
let fail = 0;


function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * Keeps one session's cookies, so each actor is a separate client. A real jar:
 * signing in sets one cookie and clears the other, in the same response.
 */
function actor() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const call = async (path, init = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(jar.size ? { cookie: cookie() } : {}),
        ...init.headers,
      },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /max-age=0|expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, location: res.headers.get("location") };
  };
  return call;
}

const post = (body) => ({ method: "POST", body: JSON.stringify(body) });
const patch = (body) => ({ method: "PATCH", body: JSON.stringify(body) });
const put = (body) => ({ method: "PUT", body: JSON.stringify(body) });

console.log(`\nSmoke test against ${BASE}\n`);

// --- is anything even there? ----------------------------------------------
try {
  await fetch(BASE, { redirect: "manual" });
} catch {
  console.log("  Dev server is not running. Start it with `npm run dev`.\n");
  process.exit(1);
}

// --- anonymous ------------------------------------------------------------
const anon = actor();
check("anonymous is redirected from the app", (await anon("/")).status === 307);
check("anonymous cannot list students", (await anon("/api/students")).status === 403);
check("anonymous cannot list tutors", (await anon("/api/tutors")).status === 403);

// --- superadmin -----------------------------------------------------------
const admin = actor();
const badLogin = await admin("/api/auth", post({ email: env.SUPERADMIN_EMAIL, password: "wrong" }));
check("wrong password is rejected", badLogin.status === 401);

const login = await admin("/api/auth", post({
  email: env.SUPERADMIN_EMAIL,
  password: env.SUPERADMIN_PASSWORD,
}));
check("superadmin signs in", login.json?.role === "admin");
if (login.json?.role !== "admin") {
  console.log("\n  Cannot continue without the superadmin. Check .env.local.\n");
  process.exit(1);
}

const stamp = Date.now();
const mk = async (name) =>
  (await admin("/api/tutors", post({ name, email: `${name.toLowerCase()}-${stamp}@smoke.test` }))).json;

const t1 = await mk("Smokeone");
const t2 = await mk("Smoketwo");
check("superadmin creates tutors", Boolean(t1?.password && t2?.password));
check("temporary passwords are easy to type on a phone",
  /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(t1.password) && !/[01ilo]/.test(t1.password),
  t1.password);
check("password hashes never leave the server",
  !JSON.stringify((await admin("/api/tutors")).json).includes("passwordHash"));

// --- two tutors -----------------------------------------------------------
const a = actor();
const b = actor();
await a("/api/auth", post({ email: t1.email, password: t1.password }));
await b("/api/auth", post({ email: t2.email, password: t2.password }));

const sA = (await a("/api/students", post({ name: "Smoke Student A", consentFrom: "Parent A" }))).json;
const sB = (await b("/api/students", post({ name: "Smoke Student B" }))).json;
check("tutor creates a student", Boolean(sA?.id && sB?.id));
check("consent is recorded", sA?.recordingConsent?.grantedBy === "Parent A");

const listA = (await a("/api/students")).json.map((s) => s.name);
check("a tutor sees only their own students",
  listA.includes("Smoke Student A") && !listA.includes("Smoke Student B"));

// --- isolation ------------------------------------------------------------
for (const [label, path, init] of [
  ["student record", `/api/students/${sA.id}`, {}],
  ["student page", `/student/${sA.id}`, {}],
  ["reports", `/api/students/${sA.id}/reports`, {}],
  ["renaming", `/api/students/${sA.id}`, patch({ name: "hijacked" })],
]) {
  check(`tutor B cannot reach tutor A's ${label}`, (await b(path, init)).status === 404);
}
check("tutor B cannot open the admin API",
  (await b("/api/tutors", post({ name: "X", email: "x@y.z" }))).status === 403);

// --- hardening ----------------------------------------------------------------
check("a huge body is refused before it is read",
  (await anon("/api/auth", { method: "POST", body: JSON.stringify({ email: "x".repeat(200_000), password: "y" }) })).status === 413);
check("an id cannot walk out of its folder",
  (await a(`/api/students/..%2F..%2Fdata%2Fstudents%2F${sA.id}`)).status === 404);

// --- consent drives capture ----------------------------------------------
const lessonA = (await a("/api/lessons", post({
  title: "Smoke lesson", mode: "classroom", language: "en-US", studentId: sA.id,
}))).json;
check("consent gives capture=both", lessonA?.capture === "both");

await a(`/api/lessons/${lessonA.id}`, patch({
  transcript: [{ t: 0, text: "with consent this is kept" }],
}));
check("a consented lesson still stores its transcript",
  (await a(`/api/lessons/${lessonA.id}`)).json.transcript.length === 1);

const forced = (await b("/api/lessons", post({
  title: "Forced", mode: "classroom", studentId: sB.id, capture: "both",
}))).json;
check("a client cannot forge capture without consent", forced?.capture === "tutor");
check("listing lessons shows only your own",
  !(await b("/api/lessons")).json.some((l) => l.studentId === sA.id)
  && (await a("/api/lessons")).json.some((l) => l.id === lessonA.id));
check("a wrongly shaped lesson save is refused",
  (await a(`/api/lessons/${lessonA.id}`, patch({ debrief: "not a list" }))).status === 400);

// --- the model path -------------------------------------------------------
await a(`/api/lessons/${lessonA.id}`, patch({
  transcript: [
    { t: 4000, text: "Right, three quarters plus one half. What do we do first?" },
    { t: 9000, text: "Um, four sixths?" },
    { t: 13000, text: "Not quite — you added the bottom numbers. They stay the same." },
    { t: 21000, text: "Oh. So we make them match first?" },
    { t: 26000, text: "Exactly. That's the first time you've got there without me." },
  ],
  debrief: [
    { promptId: "covered", text: "Adding fractions with unlike denominators." },
    { promptId: "struggled", text: "Keeps adding the denominators. Doesn't feel a fraction as part of a whole." },
    { promptId: "improved", text: "Got to a common denominator unaided once at the end." },
    { promptId: "matters", text: "The visual model is missing. Without it this is a ritual." },
    { promptId: "next", text: "Fraction strips, then back to unlike denominators." },
  ],
}));

console.log("\n  (model calls — these cost a few cents and take a minute)\n");

const summaryStarted = Date.now();
const summary = await a(`/api/lessons/${lessonA.id}/summary`, { method: "POST" });
console.log(`  (summary + parent message took ${((Date.now() - summaryStarted) / 1000).toFixed(1)}s)`);
const sum = summary.json?.summary;
check("summary generated", Boolean(sum?.covered?.length), summary.json?.error);
check("summary carries evidence", Boolean(sum?.struggles?.[0]?.evidence));
check("speakers labelled", summary.json?.transcript?.some((s) => s.speaker === "student"));
const msg = summary.json?.parentMessage;
check("a parent message is written alongside", Boolean(msg?.en?.length));
check("the parent message has a Chinese version", /[\u4e00-\u9fff]/.test(msg?.zh ?? ""));
check("the summary suggests a homework focus", typeof sum?.homeworkFocus === "string");

const edited = await a(`/api/lessons/${lessonA.id}/parent-message`, put({
  en: "Today Smoke worked on adding fractions. Please ask them to explain a half using a pizza.",
}));
check("an edited message is translated again",
  /[\u4e00-\u9fff]/.test(edited.json?.zh ?? "") && edited.json?.editedAt, edited.json?.error);
const regenerated = await a(`/api/lessons/${lessonA.id}/summary`, { method: "POST" });
check("regenerating the summary keeps the tutor's edit",
  regenerated.json?.parentMessage?.en?.includes("pizza"));

const proposed = await a(`/api/lessons/${lessonA.id}/skills`, { method: "POST" });
check("topic changes proposed", proposed.json?.changes?.length > 0, proposed.json?.error);

// The tutor gate: the student sees nothing until these are applied.
const keys = (await a(`/api/students/${sA.id}`)).json;
const before = (await anon(`/s/${keys.studentKey}`)).text;
check("student page is empty before the tutor applies", !before.includes("Working on"));

await a(`/api/lessons/${lessonA.id}/skills`, put({ changes: proposed.json.changes }));
const after = (await anon(`/s/${keys.studentKey}`)).text;
check("student page fills in after the tutor applies", after.includes("Start here"));

const report = await a(`/api/students/${sA.id}/reports`, post({}));
check("parent note drafted", Boolean(report.json?.body?.trajectory), report.json?.error);

const parentBefore = (await anon(`/p/${keys.parentKey}`)).text;
check("parent sees nothing before approval", parentBefore.includes("No weekly note yet"));

await a(`/api/reports/${report.json.id}`, patch({ approved: true }));
const parentAfter = (await anon(`/p/${keys.parentKey}`)).text;
check("parent sees the note after approval", !parentAfter.includes("No weekly note yet"));

// --- what a tutor may write ------------------------------------------------
// Both of these were exploitable: a blanket Partial<> on the two PATCH routes
// let a tutor forge consent and set capture directly, walking past the rule
// that capture is derived from consent on the server.
{
  const victim = (await a("/api/students", post({ name: "Smoke Student C" }))).json;
  check("a new student has no consent", !victim.recordingConsent);

  await a(`/api/students/${victim.id}`, patch({
    recordingConsent: { grantedAt: "2020-01-01T00:00:00Z", grantedBy: "FORGED" },
  }));
  const after = (await a(`/api/students/${victim.id}`)).json;
  check("consent cannot be forged through the student PATCH",
    !after.recordingConsent, JSON.stringify(after.recordingConsent));

  const lesson = (await a("/api/lessons", post({
    title: "Probe", mode: "classroom", studentId: victim.id,
  }))).json;
  check("no consent still means tutor-only", lesson.capture === "tutor");

  await a(`/api/lessons/${lesson.id}`, patch({ capture: "both" }));
  check("capture cannot be set through the lesson PATCH",
    (await a(`/api/lessons/${lesson.id}`)).json.capture === "tutor");

  // The browser recogniser cannot be fed the gated stream, so in tutor-only
  // mode its transcript holds whoever else was in the room. The server refuses
  // it even if a client sends one.
  await a(`/api/lessons/${lesson.id}`, patch({
    transcript: [{ t: 0, text: "a child who consented to nothing" }],
  }));
  check("a tutor-only lesson will not store a transcript",
    (await a(`/api/lessons/${lesson.id}`)).json.transcript.length === 0);

  await a(`/api/lessons/${lesson.id}`, patch({ studentId: sB.id, summary: { covered: ["forged"] } }));
  const untouched = (await a(`/api/lessons/${lesson.id}`)).json;
  check("a lesson cannot be reassigned or its summary forged",
    untouched.studentId === victim.id && !untouched.summary);

  // Consent is grantable through its own action, with a server-stamped time.
  await a(`/api/students/${victim.id}`, patch({ consentFrom: "A real parent" }));
  const granted = (await a(`/api/students/${victim.id}`)).json;
  check("consent can be granted properly",
    granted.recordingConsent?.grantedBy === "A real parent");
  check("the grant time comes from the server",
    new Date(granted.recordingConsent.grantedAt).getFullYear() >= 2026);

  // And withdrawn.
  await a(`/api/students/${victim.id}`, patch({ consentFrom: null }));
  check("consent can be withdrawn",
    !(await a(`/api/students/${victim.id}`)).json.recordingConsent);

  // Rotating a link has to break the old one.
  const before = (await a(`/api/students/${victim.id}`)).json;
  const oldPage = await anon(`/s/${before.studentKey}`);
  await a(`/api/students/${victim.id}`, patch({ rotateLinks: true }));
  const rotated = (await a(`/api/students/${victim.id}`)).json;
  check("rotating replaces both links",
    rotated.studentKey !== before.studentKey && rotated.parentKey !== before.parentKey);
  check("the old link stops working",
    oldPage.status === 200 && (await anon(`/s/${before.studentKey}`)).status === 404);
}

// --- account security -----------------------------------------------------
{
  // A second session, opened before the change, to prove revocation works.
  const other = actor();
  await other("/api/auth", post({ email: t1.email, password: t1.password }));

  // A tutor who cannot change the password they were handed is stuck on a
  // password someone else knows.
  const weak = await a("/api/account", patch({
    currentPassword: t1.password, newPassword: "short",
  }));
  check("a too-short password is refused", weak.status === 400);

  const wrong = await a("/api/account", patch({
    currentPassword: "not-it", newPassword: "a-long-enough-one",
  }));
  check("the wrong current password is refused", wrong.status === 401);

  const NEW = "smoke-new-password";
  const changed = await a("/api/account", patch({
    currentPassword: t1.password, newPassword: NEW,
  }));
  check("a tutor can change their own password", changed.status === 200);

  const oldLogin = actor();
  check("the old password stops working",
    (await oldLogin("/api/auth", post({ email: t1.email, password: t1.password }))).status === 401);

  const newLogin = actor();
  const ok = await newLogin("/api/auth", post({ email: t1.email, password: NEW }));
  check("the new password works", ok.json?.role === "tutor");
  check("the change clears the must-change flag", ok.json?.next === "/");

  // The tab that made the change keeps working on purpose; every other one
  // must not. `other` signed in before the change, so it is the real test.
  check("changing the password signs other sessions out",
    (await other("/api/students")).status === 403);
  check("the tab that changed it stays signed in",
    (await a("/api/students")).status === 200);

  // Telegram is hidden entirely unless the server has a bot token.
  const tg = await a("/api/account/telegram", { method: "POST" });
  const configured = Boolean(env.TELEGRAM_BOT_TOKEN);
  check("Telegram is hidden without a bot token, offered with one",
    configured ? tg.status === 200 || tg.status === 502 : tg.status === 404);
  check("a signed-out visitor cannot start a Telegram link",
    (await anon("/api/account/telegram", { method: "POST" })).status === 403
      || !configured);
}

{
  // Suspending has to take effect now, not when the cookie expires.
  const live = actor();
  await live("/api/auth", post({ email: t2.email, password: t2.password }));
  check("a tutor's session works before suspension",
    (await live("/api/students")).status === 200);

  const t2id = (await admin("/api/tutors")).json.find((t) => t.email === t2.email).id;
  await admin(`/api/tutors/${t2id}`, patch({ active: false }));
  check("suspending kills the live session immediately",
    (await live("/api/students")).status === 403);

  await admin(`/api/tutors/${t2id}`, patch({ active: true }));
}

// --- pages render ------------------------------------------------------------
{
  const home = await a("/");
  check("the students page shows cards and an add button",
    home.status === 200 && home.text.includes("Add student") && home.text.includes("Smoke Student A"));
  check("the add-student page renders", (await a("/student/new")).status === 200);
  const review = await a(`/lesson/${lessonA.id}/review`);
  check("the review page shows the steps and the parent message",
    review.status === 200 && review.text.includes("Message to the parent") && review.text.includes("Homework"));
  const t1id = (await admin("/api/tutors")).json.find((t) => t.email === t1.email).id;
  const tutorPage = await admin(`/admin/tutors/${t1id}`);
  check("the admin can open a tutor", tutorPage.status === 200 && tutorPage.text.includes("Smoke Student A"));
}

// --- recordings are not kept ----------------------------------------------
check("there is no audio upload any more",
  (await a(`/api/lessons/${lessonA.id}/audio`, { method: "POST" })).status === 404);

// --- homework ---------------------------------------------------------------
// The smallest thing that starts like a JPEG; the server checks the bytes.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 64 }, (_, i) => i)]);
function picture(bytes) {
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), "p.jpg");
  return { method: "POST", body: form };
}
{
  const childKey = keys.studentKey;
  const img = (key) => anon(`/api/lessons/${lessonA.id}/homework/image?key=${key}`);

  check("a non-JPEG picture is refused",
    (await a(`/api/lessons/${lessonA.id}/homework`, picture(Buffer.from("GIF89a-not-a-jpeg")))).status === 415);
  check("tutor B cannot add homework to tutor A's lesson",
    (await b(`/api/lessons/${lessonA.id}/homework`, picture(jpeg))).status === 404);
  const up = await a(`/api/lessons/${lessonA.id}/homework`, picture(jpeg));
  check("the tutor uploads a picture", Boolean(up.json?.imageFile), up.text.slice(0, 120));
  check("the focus is prefilled from the summary", typeof up.json?.focus === "string");

  check("the child cannot see homework before it is sent", (await img(childKey)).status === 404);
  check("the child's page shows no quest before it is sent",
    !(await anon(`/s/${childKey}`)).text.includes("Describe the picture"));

  await a(`/api/lessons/${lessonA.id}/homework`, patch({ focus: "Use the past tense.", send: true }));
  check("once sent, the child's page shows the quest",
    (await anon(`/s/${childKey}`)).text.includes("Describe the picture"));
  check("the child can load the picture by link", (await img(childKey)).status === 200);
  check("a wrong key cannot load the picture", (await img("wrong-key")).status === 404);
  check("the parent link cannot load the picture", (await img(keys.parentKey)).status === 404);
  check("the quest page opens", (await anon(`/s/${childKey}/quest/${lessonA.id}`)).status === 200);

  // The games: built from the lesson, played by the child, scored for the parent.
  const games = await a(`/api/lessons/${lessonA.id}/homework/exercises`, { method: "POST" });
  const built = games.json?.exercises ?? [];
  check("practice games are built from the lesson", built.length > 0, games.json?.error);
  check("every game says which mistake it practises",
    built.every((e) => e.topic && e.rounds?.length >= 2));
  check("the choose game has a gap and three options",
    built.filter((e) => e.kind === "choose").every((e) =>
      e.rounds.every((r) => r.sentence.includes("___") && r.options.length === 3
        && r.answer >= 0 && r.answer < 3)));
  check("the catch game has words to keep and words to drop",
    built.filter((e) => e.kind === "catch").every((e) =>
      e.rounds.some((r) => r.keep) && e.rounds.some((r) => !r.keep)));

  const firstGame = built[0];
  const score = (body) => anon(`/api/lessons/${lessonA.id}/homework/results`, post({ key: childKey, ...body }));
  check("a game nobody built is refused",
    (await score({ kind: "nonsense", replies: [0] })).status === 400);
  // The browser sends answers; the server marks them against the exercise.
  const allRight = (game) => game.rounds.map((r) =>
    game.kind === "choose" ? r.answer : game.kind === "build" ? r.answer : r.keep);
  const allWrong = (game) => game.rounds.map((r) =>
    game.kind === "choose" ? (r.answer + 1) % 3 : game.kind === "build" ? [...r.answer].reverse() : !r.keep);

  check("the server marks a perfect round perfectly",
    (await score({ kind: firstGame.kind, replies: allRight(firstGame) })).json?.right
      === firstGame.rounds.length);
  check("a score cannot be sent in, only earned",
    (await score({ kind: firstGame.kind, replies: allWrong(firstGame) })).json?.right === 0);
  check("extra answers beyond the rounds are ignored",
    (await score({ kind: firstGame.kind, replies: [...allRight(firstGame), 0, 0, 0] })).json?.right
      === firstGame.rounds.length);
  // Played right, then wrong, then right again: the first score must survive
  // all of it, because the parent's progress is built from it.
  {
    const stored = ((await a(`/api/lessons/${lessonA.id}`)).json.homework.results ?? [])[0];
    check("a replay keeps the first score as the honest measure",
      stored?.firstRight === firstGame.rounds.length && (stored?.attempts ?? 0) >= 3,
      JSON.stringify({ firstRight: stored?.firstRight, attempts: stored?.attempts }));
  }
  check("a replay replaces the earlier score, never adds to it",
    ((await a(`/api/lessons/${lessonA.id}`)).json.homework.results ?? []).length === 1);
  check("the tutor can read back what the child answered",
    (((await a(`/api/lessons/${lessonA.id}`)).json.homework.results ?? [])[0]?.rounds ?? []).length
      === firstGame.rounds.length);
  check("another family cannot score this homework",
    (await anon(`/api/lessons/${lessonA.id}/homework/results`, post({ key: "wrong", kind: firstGame.kind, replies: allRight(firstGame) }))).status === 404);

  const answer = (body) => anon(`/api/lessons/${lessonA.id}/homework/answers`, post({ key: childKey, ...body }));
  check("two adjectives are not enough",
    (await answer({ describe: "A cat.", next: "It jumps.", adjectives: ["big", "red"] })).status === 400);
  check("answers need the right key",
    (await anon(`/api/lessons/${lessonA.id}/homework/answers`, post({
      key: "wrong", describe: "x", next: "y", adjectives: ["a", "b", "c"],
    }))).status === 404);
  check("the child hands the homework in",
    (await answer({ describe: "A cat sat on a mat.", next: "It will sleep.", adjectives: ["calm", "warm", "sleepy"] })).status === 200);
  // Homework is only finished when the games are played too.
  check("the picture alone does not finish the homework",
    (await anon(`/api/lessons/${lessonA.id}/homework/image?key=${keys.parentKey}`)).status === 404);
  for (const game of built) {
    await anon(`/api/lessons/${lessonA.id}/homework/results`, post({
      key: childKey, kind: game.kind, replies: allRight(game),
    }));
  }

  check("it can only be handed in once",
    (await answer({ describe: "again", next: "again", adjectives: ["a", "b", "c"] })).status === 409);
  const hw = (await a(`/api/lessons/${lessonA.id}`)).json.homework;
  check("the tutor sees the answers", hw?.answers?.adjectives?.join() === "calm,warm,sleepy");
  check("once handed in, the parent link sees the picture", (await img(keys.parentKey)).status === 200);
  check("the parent page lists the homework and the answers",
    (await anon(`/p/${keys.parentKey}`)).text.includes("sleepy"));
  check("answered homework cannot be taken back",
    (await a(`/api/lessons/${lessonA.id}/homework`, patch({ send: false }))).status === 409);
}

// --- the family sign-in (one for the child and the parent) -------------------
{
  check("tutor B cannot make a sign-in for tutor A's student",
    (await b(`/api/students/${sA.id}/logins`, { method: "POST" })).status === 404);

  const made = (await a(`/api/students/${sA.id}/logins`, { method: "POST" })).json;
  check("the tutor creates the family sign-in", Boolean(made?.username && made?.password));

  const family = actor();
  // As a phone would send it: capitalised, with a trailing space.
  const signIn = await family("/api/auth", post({
    email: `${made.username[0].toUpperCase()}${made.username.slice(1)} `,
    password: made.password,
  }));
  check("the family signs in with a username", signIn.json?.next === "/me", signIn.text);
  check("one sign-in opens the child's page", (await family("/me")).status === 200);
  check("the same sign-in opens the parent's page",
    !(await family("/family")).text.includes("No weekly note yet"));
  check("the family can open the homework picture",
    (await family(`/api/lessons/${lessonA.id}/homework/image`)).status === 200);
  check("a family session is not a tutor session",
    (await family("/api/students")).status === 403);
  check("a family is sent away from the tutor screens",
    (await family("/")).status === 307);

  {
    // The family cookie, pasted in as a staff cookie, must not be a session.
    const jarFamily = await fetch(`${BASE}/api/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: made.username, password: made.password }),
    });
    const famValue = jarFamily.headers.getSetCookie()
      .map((c) => c.split(";")[0]).find((c) => c.startsWith("family_session="))?.split("=")[1];
    const swapped = await fetch(`${BASE}/api/lessons`, { headers: { cookie: `tutor_session=${famValue}` } });
    check("a family cookie cannot pose as a tutor's", Boolean(famValue) && swapped.status === 403);
  }

  const otherFamily = (await b(`/api/students/${sB.id}/logins`, { method: "POST" })).json;
  check("two families never share a username", otherFamily.username !== made.username);
  const other = actor();
  await other("/api/auth", post({ email: otherFamily.username, password: otherFamily.password }));
  check("another family cannot open this homework",
    (await other(`/api/lessons/${lessonA.id}/homework/image`)).status === 404);

  // A reset has to sign out every device that used the old password.
  const reset = (await a(`/api/students/${sA.id}/logins`, { method: "POST" })).json;
  check("a reset keeps the username", reset.username === made.username);
  check("a reset signs the family out everywhere", (await family("/me")).status === 307);
  check("the old password stops working",
    (await actor()("/api/auth", post({ email: made.username, password: made.password }))).status === 401);

  const again = actor();
  await again("/api/auth", post({ email: reset.username, password: reset.password }));
  await a(`/api/students/${sA.id}/logins`, { method: "DELETE" });
  check("removing the sign-in ends its session", (await again("/me")).status === 307);

  // A new sign-in after a removal must not bring the removed one back.
  await a(`/api/students/${sA.id}/logins`, { method: "POST" });
  check("a new sign-in does not revive a removed one", (await again("/me")).status === 307);
}

// --- leakage --------------------------------------------------------------
const reason = proposed.json.changes[0]?.reason ?? "";
check("the tutor's private reasoning never reaches the student",
  reason.length > 0 && !after.includes(reason));
check("the parent gets no lesson diagnostics",
  !parentAfter.includes(sum?.struggles?.[0]?.evidence ?? "@@none@@"));
check("a wrong family key is a 404", (await anon("/s/not-a-real-key")).status === 404);

{
  // Last, because tripping a limit would block the logins every other
  // check needs. One address, one account, fourteen wrong guesses.
  const attacker = actor();
  let sawLimit = false;
  for (let i = 0; i < 14; i++) {
    const res = await attacker("/api/auth", post({
      email: "nobody-smoke@smoke.test", password: `guess-${i}`,
    }));
    if (res.status === 429) { sawLimit = true; break; }
  }
  check("repeated failed logins are throttled", sawLimit);
}


// --- clean up after itself ------------------------------------------------
// The run writes real records; leaving them behind would pollute the tutor's
// own list every time someone runs this.
let removed = 0;
for (const [dir, matches] of [
  ["data/tutors", (r) => r.email?.endsWith("@smoke.test")],
  ["data/students", (r) => r.name?.startsWith("Smoke Student")],
  ["data/lessons", (r) => [sA.id, sB.id].includes(r.studentId)],
  ["data/reports", (r) => [sA.id, sB.id].includes(r.studentId)],
]) {
  let files = [];
  try { files = readdirSync(dir); } catch { continue; }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const path = join(dir, f);
    try {
      if (matches(JSON.parse(readFileSync(path, "utf8")))) { rmSync(path); removed++; }
    } catch { /* leave anything unreadable alone */ }
  }
}
try {
  for (const f of readdirSync("data/images")) {
    if (f.startsWith(lessonA.id)) { rmSync(join("data/images", f)); removed++; }
  }
} catch { /* no images dir yet */ }

console.log(`\n  cleaned up ${removed} records it created`);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
