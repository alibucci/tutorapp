/**
 * End-to-end check of the server path, against a running dev server.
 *
 * Covers everything that does not need a browser: sign-in, tenant isolation,
 * consent driving capture, the four model calls, the tutor's two approval
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

/** Tutor A's live password - the account section replaces it mid-run. */
let passwordA;

function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

/** Keeps one session's cookies, so each actor is a separate client. */
function actor() {
  let cookie = "";
  return async (path, init = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...init.headers,
      },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
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
passwordA = t1.password;
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

// --- consent drives capture ----------------------------------------------
const lessonA = (await a("/api/lessons", post({
  title: "Smoke lesson", mode: "classroom", language: "en-US", studentId: sA.id,
}))).json;
check("consent gives capture=both", lessonA?.capture === "both");

const forced = (await b("/api/lessons", post({
  title: "Forced", mode: "classroom", studentId: sB.id, capture: "both",
}))).json;
check("a client cannot forge capture without consent", forced?.capture === "tutor");

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

const summary = await a(`/api/lessons/${lessonA.id}/summary`, { method: "POST" });
const sum = summary.json?.summary;
check("summary generated", Boolean(sum?.covered?.length), summary.json?.error);
check("summary carries evidence", Boolean(sum?.struggles?.[0]?.evidence));
check("speakers labelled", summary.json?.transcript?.some((s) => s.speaker === "student"));
check("talk ratio computed", typeof sum?.studentWordShare === "number");

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
check("parent sees nothing before approval", parentBefore.includes("No notes yet"));

await a(`/api/reports/${report.json.id}`, patch({ approved: true }));
const parentAfter = (await anon(`/p/${keys.parentKey}`)).text;
check("parent sees the note after approval", !parentAfter.includes("No notes yet"));

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
  check("the change clears the must-change flag", ok.json?.mustChangePassword === false);
  passwordA = NEW;

  // The tab that made the change keeps working on purpose; every other one
  // must not. `other` signed in before the change, so it is the real test.
  check("changing the password signs other sessions out",
    (await other("/api/students")).status === 403);
  check("the tab that changed it stays signed in",
    (await a("/api/students")).status === 200);
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

// --- audio round trip -----------------------------------------------------
// The one server path nothing else touches. A bug here loses a whole lesson's
// recording silently, so it is worth a real upload and a real read-back.
const fakeAudio = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, // EBML header, enough to look like webm
  ...Array.from({ length: 2048 }, (_, i) => i % 256),
]);

async function upload(client, lessonId, kind) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("audio", new Blob([fakeAudio], { type: "audio/webm" }), `${kind}.webm`);
  const res = await fetch(`${BASE}/api/lessons/${lessonId}/audio`, {
    method: "POST",
    body: form,
    headers: { cookie: client.cookie },
    redirect: "manual",
  });
  return res.status;
}

// The actor helper hides its cookie, so grab one the plain way for FormData -
// setting Content-Type by hand would break the multipart boundary.
function cookieFrom(res, who) {
  const set = res.headers.get("set-cookie");
  if (!set) {
    console.log(`  FAIL  could not sign ${who} in for the audio checks`);
    fail++;
    return "";
  }
  return set.split(";")[0];
}

const aCookie = (await fetch(`${BASE}/api/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: t1.email, password: passwordA }),
})).headers.get("set-cookie").split(";")[0];

const bCookie = (await fetch(`${BASE}/api/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: t2.email, password: t2.password }),
})).headers.get("set-cookie").split(";")[0];

check("lesson audio uploads",
  (await upload({ cookie: aCookie }, lessonA.id, "lesson")) === 200);
check("debrief audio uploads",
  (await upload({ cookie: aCookie }, lessonA.id, "debrief")) === 200);

const read = await fetch(`${BASE}/api/lessons/${lessonA.id}/audio`, {
  headers: { cookie: aCookie },
});
const readBack = Buffer.from(await read.arrayBuffer());
check("audio reads back byte for byte", readBack.equals(fakeAudio),
  `${readBack.length} bytes vs ${fakeAudio.length}`);
check("audio is served as webm",
  (read.headers.get("content-type") ?? "").includes("webm"));

const debriefRead = await fetch(`${BASE}/api/lessons/${lessonA.id}/audio?kind=debrief`, {
  headers: { cookie: aCookie },
});
check("debrief audio is a separate file", debriefRead.status === 200);

check("another tutor cannot download the audio",
  (await fetch(`${BASE}/api/lessons/${lessonA.id}/audio`, {
    headers: { cookie: bCookie }, redirect: "manual",
  })).status === 404);
check("anonymous cannot download the audio",
  (await fetch(`${BASE}/api/lessons/${lessonA.id}/audio`, { redirect: "manual" })).status === 404);

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
  for (const f of readdirSync("data/audio")) {
    if (f.startsWith(lessonA.id)) { rmSync(join("data/audio", f)); removed++; }
  }
} catch { /* no audio dir yet */ }

console.log(`\n  cleaned up ${removed} records it created`);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
