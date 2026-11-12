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
{
  const refused = await b("/api/tutors", post({ name: "X", email: "x@y.z" }));
  check("tutor B cannot open the admin API", refused.status === 403);
  check("the refusal says who this browser is signed in as",
    refused.json?.error?.includes("Smoketwo") && refused.json.error.includes("administrator"),
    refused.json?.error);
  const signedOut = await anon("/api/tutors", post({ name: "X", email: "x@y.z" }));
  check("signed out, the refusal says to sign in",
    signedOut.status === 403 && signedOut.json?.error?.includes("no longer signed in"),
    signedOut.json?.error);
}

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

  // Email notices go only to an address the tutor confirmed from a link -
  // logins are often made up. Test addresses end in .test, so nothing is
  // ever actually sent from here.
  const mail = Boolean(env.RESEND_API_KEY);
  const setAddr = await a("/api/account/email", put({ address: "notices@smoke.test" }));
  check("email notices are hidden without a key; a .test address is refused with one",
    mail ? setAddr.status === 400 : setAddr.status === 404);
  if (mail) {
    check("nonsense is not an email address",
      (await a("/api/account/email", put({ address: "not an address" }))).status === 400);
    check("a test email needs a confirmed address first",
      (await a("/api/account/email", { method: "POST" })).status === 400);
    check("a made-up confirmation link confirms nothing",
      ((await anon("/api/account/email/confirm?token=made-up-token-that-is-long")).location ?? "").includes("email=expired"));
    check("email notices switch off",
      (await a("/api/account/email", { method: "DELETE" })).status === 200);
  }
  check("a signed-out visitor cannot set a notice address",
    (await anon("/api/account/email", put({ address: "x@smoke.test" }))).status === (mail ? 403 : 404));
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
  // Suspending signed tutor B out everywhere, including the `b` client the
  // checks below act through. Without this they ran against a dead session.
  await b("/api/auth", post({ email: t2.email, password: t2.password }));
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

// --- math practice ----------------------------------------------------------
// Sums the page can send: right or wrong answers to a real game at that level.
{
  const sM = (await a("/api/students", post({ name: "Smoke Student Math" }))).json;
  const kid = (await a(`/api/students/${sM.id}`)).json;
  const sums = (level) => {
    // The first ten sums of each level, listed by hand so this does not lean on the code it checks.
    if (level === 1) return [[1,1],[1,2],[2,1],[1,3],[3,1],[2,2],[1,4],[4,1],[2,3],[3,2]].map(([x, y]) => ({ a: x, op: "+", b: y }));
    if (level === 2) return [[1,1],[2,2],[3,3],[4,4],[5,5],[1,2],[2,3],[3,4],[4,5],[1,3]].map(([x, y]) => ({ a: x, op: "+", b: y }));
    throw new Error("not listed");
  };
  const play = (level, wrong = 0) => sums(level).map((s, i) => ({ ...s, answer: s.a + s.b + (i < wrong ? 1 : 0) }));
  const send = (who, body) => who("/api/math", post({ key: kid.studentKey, ...body }));

  check("math practice is off until the tutor turns it on",
    (await anon(`/s/${kid.studentKey}/math`)).status === 404
      && (await send(anon, { level: 1, replies: play(1) })).status === 403);
  check("the tutor can preview it while it is off",
    (await a(`/student/${sM.id}/math`)).status === 200);
  check("tutor B cannot turn on tutor A's child's math",
    (await b(`/api/students/${sM.id}`, patch({ math: { on: true } }))).status === 404);
  check("a made-up math level is refused",
    (await a(`/api/students/${sM.id}`, patch({ math: { on: true, level: 9 } }))).status === 400);

  const on = await a(`/api/students/${sM.id}`, patch({ math: { on: true } }));
  check("the tutor turns math on, starting at level 1", on.json?.math?.on === true && on.json.math.level === 1);
  check("the child's page offers it", (await anon(`/s/${kid.studentKey}`)).text.includes("Math practice"));
  check("the child's game opens", (await anon(`/s/${kid.studentKey}/math`)).status === 200);

  check("a stranger cannot save a game without the key",
    (await anon("/api/math", post({ level: 1, replies: play(1) }))).status === 403);
  check("the tutor's own session does not save a game",
    (await send(a, { level: 1, replies: play(1) })).status === 403);
  check("a game with too few sums is refused",
    (await send(anon, { level: 1, replies: play(1).slice(0, 3) })).status === 400);
  check("sums from another level are refused",
    (await send(anon, { level: 1, replies: play(2) })).status === 400);
  const claimed = await send(anon, { level: 1, replies: play(1, 7), right: 10, total: 10 });
  check("the server does its own marking, whatever the page claims",
    claimed.json?.right === 3 && claimed.json.total === 10, claimed.text.slice(0, 120));
  check("half wrong or worse stays at the bottom level", claimed.json?.level === 1);

  const up = await send(anon, { level: 1, replies: play(1) });
  check("nearly all right moves the child up a level", up.json?.right === 10 && up.json.level === 2);
  const down = await send(anon, { level: 2, replies: play(2, 6) });
  check("half wrong moves the child back down", down.json?.right === 4 && down.json.level === 1);
  const stale = await send(anon, { level: 2, replies: play(2) });
  check("an old game at another level does not move the child", stale.json?.level === 1);

  const parent = await anon(`/p/${kid.parentKey}`);
  check("the parent sees how the sums are going",
    parent.text.includes("Math practice") && parent.text.includes("Hardest lately"));
  check("the tutor sees it too", (await a(`/student/${sM.id}`)).text.includes("Hardest lately"));
  const off = await a(`/api/students/${sM.id}`, patch({ math: { on: false } }));
  check("turning it off keeps the games", off.json?.math?.on === false && off.json.math.games.length === 4);
  check("off again, the game closes", (await anon(`/s/${kid.studentKey}/math`)).status === 404);
  check("off again, games are refused", (await send(anon, { level: 1, replies: play(1) })).status === 403);
}

// --- learner profile ----------------------------------------------------------
{
  check("a profile with a made-up level is refused",
    (await a("/api/students", post({ name: "Smoke Student P0", profile: { level: "genius" } }))).status === 400);
  const grown = (await a("/api/students", post({
    name: "Smoke Student Grown", gameStyle: "fairytale", profile: { age: 30, goal: "accent", shortTasks: true },
  }))).json;
  check("a profile is saved with the student",
    grown?.profile?.age === 30 && grown.profile.goal === "accent" && grown.profile.shortTasks === true);
  check("a theme the tutor picked is kept, with no description to make one from",
    grown?.gameStyle === "fairytale" && !grown.customStyle);
  check("their own theme cannot be picked before there is one",
    (await a(`/api/students/${grown.id}`, patch({ gameStyle: "custom" }))).status === 400);
  const page = (await a(`/student/${grown.id}`)).text;
  check("an adult's page has no parent link or weekly notes for a parent",
    page.includes("Listen and repeat") && !page.includes("Parent link") && !page.includes("Family sign-in"));
  const edited = await a(`/api/students/${grown.id}`, patch({ profile: { age: 30, goal: "speaking" } }));
  check("the profile can be changed later", edited.json?.profile?.goal === "speaking" && !edited.json.profile.shortTasks);
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

  // The tutor previews the child's screen before sending; nobody else can.
  check("the tutor can preview the homework before sending it",
    (await a(`/s/${childKey}/quest/${lessonA.id}`)).status === 200);
  check("the child's link cannot open unsent homework",
    (await anon(`/s/${childKey}/quest/${lessonA.id}`)).status === 404);

  await a(`/api/lessons/${lessonA.id}/homework`, patch({ focus: "Use the past tense.", send: true }));
  check("once sent, the child's page shows the quest",
    (await anon(`/s/${childKey}`)).text.includes("Describe the picture"));
  check("the child can load the picture by link", (await img(childKey)).status === 200);
  check("a wrong key cannot load the picture", (await img("wrong-key")).status === 404);
  check("the parent link cannot load the picture", (await img(keys.parentKey)).status === 404);
  check("the quest page opens", (await anon(`/s/${childKey}/quest/${lessonA.id}`)).status === 200);

  // Extra homework: from the tutor's words, for their own students only.
  // (Building it calls the model; the rules around it do not.)
  const extra = `/api/students/${lessonA.studentId}/practice`;
  check("extra homework needs a request of a few words",
    (await a(extra, post({ request: "hi" }))).status === 400);
  check("another tutor cannot make extra homework for this student",
    (await b(extra, post({ request: "Adding up to 20" }))).status === 404);
  check("a family cannot make extra homework",
    (await anon(extra, post({ request: "Adding up to 20" }))).status === 404);

  // Pronunciation checks are for adults who agree themselves. This learner
  // has no age, so counts as a child; nobody else may agree for anyone.
  const voice = `/api/lessons/${lessonA.id}/homework/voice`;
  check("a child cannot switch on pronunciation checks",
    (await anon(voice, put({ key: childKey, agree: true }))).status === 403);
  check("the tutor cannot agree to pronunciation checks for a learner",
    (await a(voice, put({ agree: true }))).status === 404);
  check("the parent link cannot agree to pronunciation checks",
    (await anon(voice, put({ key: keys.parentKey, agree: true }))).status === 404);
  check("without agreement, no recording is scored",
    (await anon(`${voice}?kind=repeat&round=0&key=${childKey}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: new Uint8Array(4000),
    })).status === 403);
  check("the tutor can look at the child's screen without breaking it",
    (await a(`/s/${childKey}/quest/${lessonA.id}`)).status === 200);
  check("a tutor's play is never written to the child's score",
    (await a(`/api/lessons/${lessonA.id}/homework/results`,
      post({ kind: "choose", replies: [0] }))).status === 404);

  // The games: built from the lesson, played by the child, scored for the parent.
  const games = await a(`/api/lessons/${lessonA.id}/homework/exercises`, { method: "POST" });
  const built = games.json?.exercises ?? [];
  check("practice games are built from the lesson", built.length > 0, games.json?.error);
  check("every game says which mistake it practises",
    built.every((e) => e.topic && e.rounds?.length >= 2));
  // A child playing alone stops at "past tense". Everything they read must
  // say it in their words; only `topic`, which the tutor reads, may not.
  const childText = built.flatMap((e) => [
    e.title, e.rule ?? "",
    ...e.rounds.flatMap((r) => [r.sentence ?? "", r.why ?? "", ...(r.options ?? [])]),
  ]).join(" | ");
  const jargon = childText.match(/\b(tense|past simple|present simple|verbs?|nouns?|plurals?|adjectives?|irregular)\b/i);
  check("the games speak to the child without grammar words", !jargon, jargon?.[0]);
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

  // --- archiving a student ---------------------------------------------------
  // Tutor B's family, so the checks after this one still have tutor A's.
  const bKeys = (await b(`/api/students/${sB.id}`)).json;
  const bFamily = actor();
  await bFamily("/api/auth", post({ email: otherFamily.username, password: otherFamily.password }));
  check("another tutor cannot archive a student",
    (await a(`/api/students/${sB.id}`, patch({ archived: true }))).status === 404);
  const archiving = await b(`/api/students/${sB.id}`, patch({ archived: true }));
  check("a tutor archives a student", Boolean(archiving.json?.archivedAt),
    `${archiving.status} ${archiving.text.slice(0, 200)}`);
  check("an archived student leaves the tutor's list",
    !(await b("/api/students")).json.some((s) => s.id === sB.id));
  check("an archived child's link stops working", (await anon(`/s/${bKeys.studentKey}`)).status === 404);
  check("an archived parent's link stops working", (await anon(`/p/${bKeys.parentKey}`)).status === 404);
  check("an archived family is signed out", (await bFamily("/me")).status === 307);
  check("an archived family cannot sign in",
    (await actor()("/api/auth", post({ email: otherFamily.username, password: otherFamily.password }))).status === 401);
  check("an archived student cannot be given a lesson",
    (await b("/api/lessons", post({ title: "x", mode: "online", language: "en-US", studentId: sB.id }))).status >= 400);
  check("the tutor can still open an archived student",
    (await b(`/student/${sB.id}`)).status === 200);

  const restored = (await b(`/api/students/${sB.id}`, patch({ archived: false }))).json;
  check("restoring clears the archive", restored && !restored.archivedAt);
  check("a restored child's link works again", (await anon(`/s/${bKeys.studentKey}`)).status === 200);
  check("a restored family can sign in again",
    (await actor()("/api/auth", post({ email: otherFamily.username, password: otherFamily.password }))).status === 200);
}

// --- the wrong child ---------------------------------------------------------
const sC = (await a("/api/students", post({ name: "Smoke Student C", consentFrom: "Parent C" }))).json;
const sD = (await a("/api/students", post({ name: "Smoke Student D" }))).json;
{
  const move = (lesson, studentId, as = a) =>
    as(`/api/lessons/${lesson}/student`, { method: "PUT", body: JSON.stringify({ studentId }) });
  const segment = { t: 0, text: "Yesterday I go to the park." };
  const lesson = (await a("/api/lessons", post({
    title: "Smoke wrong child", mode: "online", language: "en-US", studentId: sC.id,
  }))).json;
  const at = new Date().toISOString();
  await a(`/api/lessons/${lesson.id}`, patch({ startedAt: at, transcript: [segment] }));

  check("a lesson still recording cannot be moved",
    (await move(lesson.id, sD.id)).status === 409);
  await a(`/api/lessons/${lesson.id}`, patch({
    endedAt: at, debrief: [{ promptId: "covered", text: "The past." }],
  }));

  check("another tutor cannot move a lesson",
    (await move(lesson.id, sD.id, b)).status === 404);
  check("a lesson cannot move to another tutor's student",
    (await move(lesson.id, sB.id)).status === 404);
  check("homework already sent stops the move",
    (await move(lessonA.id, sC.id)).status === 409);

  const moved = await move(lesson.id, sD.id);
  check("the tutor moves a lesson to the right student",
    moved.status === 200 && moved.json?.studentId === sD.id, moved.text.slice(0, 120));
  check("the old student no longer has it",
    !(await a(`/api/lessons?studentId=${sC.id}`)).json.some?.((l) => l.id === lesson.id
      && l.studentId === sC.id));
  check("without the new child's consent the transcript goes",
    moved.json?.transcript?.length === 0 && moved.json?.capture === "tutor");
  check("the debrief moves with the lesson", moved.json?.debrief?.length === 1);

  const back = await move(lesson.id, sC.id);
  check("consent cannot bring back a voice that is gone",
    back.json?.capture === "tutor" && back.json?.transcript?.length === 0);

  const unstarted = (await a("/api/lessons", post({
    title: "Smoke not started", mode: "online", language: "en-US", studentId: sD.id,
  }))).json;
  check("a lesson not yet recorded takes the new child's consent",
    (await move(unstarted.id, sC.id)).json?.capture === "both");

  await a(`/api/students/${sD.id}`, patch({ archived: true }));
  check("a lesson cannot move to an archived student",
    (await move(lesson.id, sD.id)).status === 409);
  await a(`/api/students/${sD.id}`, patch({ archived: false }));
}

// --- a group lesson ----------------------------------------------------------
const sE = (await a("/api/students", post({ name: "Smoke Student E", consentFrom: "Parent E" }))).json;
{
  const newGroup = (studentIds) => a("/api/lessons", post({
    title: "Smoke group", language: "en-US", studentIds,
  }));
  check("a group lesson cannot include another tutor's student",
    (await newGroup([sC.id, sB.id])).status === 404);

  const group = (await newGroup([sC.id, sE.id])).json;
  check("a group of children with consent records everyone",
    group?.kind === "group" && group?.capture === "both" && group?.mode === "classroom");
  check("the group lesson is on no child's list",
    !(await a(`/api/lessons?studentId=${sC.id}`)).json.some((l) => l.id === group.id));

  const noConsent = (await newGroup([sC.id, sD.id])).json;
  check("one parent without consent means no transcript for the group",
    noConsent?.capture === "tutor");
  await a(`/api/lessons/${noConsent.id}`, patch({ transcript: [{ t: 0, text: "Should not be kept." }] }));
  check("and a transcript sent anyway is not kept",
    (await a(`/api/lessons/${noConsent.id}`)).json?.transcript?.length === 0);

  const at = new Date().toISOString();
  const lines = [
    "Okay, Smoke Student C, what did you do yesterday?",
    "I go to the park.",
    "You went to the park. Good. Smoke Student E, and you?",
    "I eated a big pizza.",
    "You ate a pizza. Nice.",
  ];
  await a(`/api/lessons/${group.id}`, patch({
    startedAt: at,
    transcript: lines.map((text, i) => ({ t: i * 3000, text })),
  }));
  const splitWith = (who) => a(`/api/lessons/${group.id}/group/split`, post({ who }));
  check("a group lesson still recording cannot be split",
    (await splitWith([])).status === 409);
  await a(`/api/lessons/${group.id}`, patch({
    endedAt: at,
    debrief: [
      { promptId: `w:${sC.id}`, text: "C talked about the park." },
      { promptId: `h:${sC.id}`, text: "Says go for went." },
      { promptId: `n:${sC.id}`, text: "C needs more past forms." },
      { promptId: `w:${sE.id}`, text: "E talked about pizza." },
      { promptId: `h:${sE.id}`, text: "Says eated for ate." },
      { promptId: `n:${sE.id}`, text: "E needs irregular forms." },
    ],
  }));

  const labelled = (await a(`/api/lessons/${group.id}/group/labels`, { method: "POST" })).json;
  const who = labelled?.transcript?.map((l) => l.who) ?? [];
  check("the child called by name is credited with the answer",
    who[1] === sC.id && who[3] === sE.id, JSON.stringify(who));
  check("the tutor's lines are the tutor's", who[0] === "tutor" && who[2] === "tutor");

  check("another tutor cannot split it",
    (await b(`/api/lessons/${group.id}/group/split`, post({ who }))).status === 404);
  check("labels that do not fit the lesson are refused",
    (await splitWith(who.slice(1))).status === 400);
  check("a name that is not in the group is refused",
    (await splitWith(who.map(() => sD.id))).status === 400);

  // What the tutor checked, not what the model suggested.
  const checked = ["tutor", sC.id, "tutor", sE.id, "tutor"];
  const split = await splitWith(checked);
  check("the tutor makes each child's own lesson",
    split.status === 200 && split.json?.lessons?.length === 2, split.text.slice(0, 120));
  const forChild = (id) => split.json.lessons.find((l) => l.studentId === id);
  const textOf = (l) => l.transcript.map((x) => x.text).join(" | ");
  check("a child's lesson has their own words",
    textOf(forChild(sC.id)).includes("I go to the park"));
  check("and not another child's",
    !textOf(forChild(sC.id)).includes("eated") && !textOf(forChild(sE.id)).includes("I go to the park"));
  check("the tutor's debrief about each child goes to that child",
    forChild(sE.id).debrief.find((d) => d.promptId === "struggled")?.text === "Says eated for ate."
      && !JSON.stringify(forChild(sE.id).debrief).includes("go for went"));
  const answerOf = (id, prompt) => forChild(id).debrief.find((d) => d.promptId === prompt)?.text;
  check("every answer in the debrief belongs to one child",
    answerOf(sC.id, "covered") === "C talked about the park."
      && answerOf(sE.id, "covered") === "E talked about pizza."
      && answerOf(sC.id, "next") === "C needs more past forms."
      && answerOf(sE.id, "next") === "E needs irregular forms."
      && !JSON.stringify(forChild(sC.id).debrief).includes("E needs")
      && !JSON.stringify(forChild(sC.id).debrief).includes("pizza"));

  // A debrief saved with the earlier questions keeps its answers.
  await a(`/api/lessons/${noConsent.id}`, patch({
    startedAt: at,
    endedAt: at,
    debrief: [
      { promptId: "covered", text: "Shared cover." },
      { promptId: `c:${sC.id}`, text: "About C." },
      { promptId: "next", text: "Shared next." },
    ],
  }));
  const earlier = await a(`/api/lessons/${noConsent.id}/group/split`, post({ who: [] }));
  const earlierC = earlier.json?.lessons?.find((l) => l.studentId === sC.id);
  check("a debrief saved with the earlier questions keeps its answers",
    earlierC?.debrief?.find((d) => d.promptId === "struggled")?.text === "About C."
      && earlierC?.debrief?.find((d) => d.promptId === "covered")?.text === "Shared cover.");
  check("a group without consent still makes each child's lesson, with no transcript",
    earlier.json?.lessons?.length === 2 && earlierC?.transcript?.length === 0);
  check("a child's lesson is on their list",
    (await a(`/api/lessons?studentId=${sE.id}`)).json.some((l) => l.id === forChild(sE.id).id));
  check("a group lesson cannot be split twice", (await splitWith(checked)).status === 409);
  check("a child's lesson from a group stays with them",
    (await a(`/api/lessons/${forChild(sC.id).id}/student`, {
      method: "PUT", body: JSON.stringify({ studentId: sD.id }),
    })).status === 409);
  check("the group's page opens", (await a(`/lesson/${group.id}/group`)).status === 200);
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
  ["data/lessons", (r) => [sA.id, sB.id, sC.id, sD.id, sE.id].includes(r.studentId)],
  ["data/reports", (r) => [sA.id, sB.id, sC.id, sD.id, sE.id].includes(r.studentId)],
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
