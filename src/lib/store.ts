import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type { Lesson, ParentReport, Student, Tutor } from "./types";

/**
 * File-backed store. One JSON file per record, plus homework pictures.
 * Recordings are never stored.
 * Deliberately boring: swap this module for a real DB without touching callers.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const LESSON_DIR = path.join(DATA_DIR, "lessons");
const STUDENT_DIR = path.join(DATA_DIR, "students");
const TUTOR_DIR = path.join(DATA_DIR, "tutors");
const REPORT_DIR = path.join(DATA_DIR, "reports");
const IMAGE_DIR = path.join(DATA_DIR, "images");

async function ensureDirs() {
  await Promise.all(
    [LESSON_DIR, STUDENT_DIR, TUTOR_DIR, REPORT_DIR, IMAGE_DIR].map((d) =>
      fs.mkdir(d, { recursive: true }),
    ),
  );
}

/**
 * Ids become file names, so they must never carry a path. Route params arrive
 * decoded - `..%2F..%2Fdata` is `../../data` by the time it gets here.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function recordPath(dir: string, id: string): string | null {
  return SAFE_ID.test(id) ? path.join(dir, `${id}.json`) : null;
}

async function readJson<T>(file: string | null): Promise<T | null> {
  if (!file) return null;
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null; // not there
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // There but unreadable is not the same as missing: say so in the log,
    // or a tutor whose record broke is simply locked out with no trace.
    console.error(`[store] unreadable record: ${file}`);
    return null;
  }
}

/**
 * Write a whole record so that a reader sees either the old file or the new
 * one, never half of each: write beside it, then rename over it. A crash
 * mid-write leaves a stray temp file, not a corrupted record.
 */
async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

/**
 * One change at a time per record. Without this, two requests that each read
 * a lesson, change their part and write it back would silently drop one
 * another's change - a homework upload erasing the answers handed in during
 * it. In-process, which is right for one server.
 */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

/**
 * Change a record under its lock. `change` sees the current record, read
 * inside the lock, and returns the fields to change - or null to leave it
 * alone, for when it turns out the change no longer applies.
 */
async function updateRecord<T extends { id: string }>(
  dir: string,
  id: string,
  change: Partial<T> | ((current: T) => Partial<T> | null),
): Promise<T | null> {
  const file = recordPath(dir, id);
  if (!file) return null;
  return withLock(file, async () => {
    const current = await readJson<T>(file);
    if (!current) return null;
    const patch = typeof change === "function" ? change(current) : change;
    if (!patch) return current;
    const next = { ...current, ...patch, id: current.id };
    await writeJson(file, next);
    return next;
  });
}

/** Fields to change, or a function from the current record to them. */
export type Change<T> = Partial<T> | ((current: T) => Partial<T> | null);

async function readAll<T>(dir: string): Promise<T[]> {
  await ensureDirs();
  const files = await fs.readdir(dir);
  const rows: T[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const row = await readJson<T>(path.join(dir, file));
    if (row) rows.push(row);
  }
  return rows;
}

// --- tutors ----------------------------------------------------------------

export async function createTutor(
  input: Pick<Tutor, "email" | "name" | "passwordHash">,
): Promise<Tutor> {
  await ensureDirs();
  const tutor: Tutor = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    mustChangePassword: true,
    tokenVersion: 1,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await writeJson(path.join(TUTOR_DIR, `${tutor.id}.json`), tutor);
  return tutor;
}

export async function getTutor(id: string): Promise<Tutor | null> {
  return readJson<Tutor>(recordPath(TUTOR_DIR, id));
}

export async function getTutorByEmail(email: string): Promise<Tutor | null> {
  const tutors = await readAll<Tutor>(TUTOR_DIR);
  const wanted = email.trim().toLowerCase();
  return tutors.find((t) => t.email === wanted) ?? null;
}

export async function updateTutor(
  id: string,
  change: Change<Tutor>,
): Promise<Tutor | null> {
  return updateRecord<Tutor>(TUTOR_DIR, id, change);
}

export async function listTutors(): Promise<Tutor[]> {
  const tutors = await readAll<Tutor>(TUTOR_DIR);
  return tutors.sort((a, b) => a.name.localeCompare(b.name));
}

// --- students --------------------------------------------------------------

/** URL-safe and long enough that a link is not guessable. */
export function accessKey() {
  return randomBytes(16).toString("base64url");
}

export async function createStudent(
  name: string,
  tutorId: string,
): Promise<Student> {
  await ensureDirs();
  const student: Student = {
    id: randomUUID(),
    tutorId,
    name,
    createdAt: new Date().toISOString(),
    studentKey: accessKey(),
    parentKey: accessKey(),
    skills: [],
  };
  await writeJson(path.join(STUDENT_DIR, `${student.id}.json`), student);
  return student;
}

export async function getStudent(id: string): Promise<Student | null> {
  return readJson<Student>(recordPath(STUDENT_DIR, id));
}

export async function updateStudent(
  id: string,
  change: Change<Student>,
): Promise<Student | null> {
  return updateRecord<Student>(STUDENT_DIR, id, change);
}

/** Omit `tutorId` only where the caller is the superadmin. */
export async function listStudents(tutorId?: string): Promise<Student[]> {
  const students = await readAll<Student>(STUDENT_DIR);
  return students
    .filter((s) => !tutorId || s.tutorId === tutorId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Find the family a username belongs to. */
export async function getStudentByUsername(
  username: string,
): Promise<Student | null> {
  const wanted = username.trim().toLowerCase();
  if (!wanted) return null;
  const students = await readAll<Student>(STUDENT_DIR);
  return students.find((s) => s.login?.username === wanted) ?? null;
}

/** Resolve one of the shareable links back to its student. */
export async function getStudentByKey(
  kind: "studentKey" | "parentKey",
  key: string,
): Promise<Student | null> {
  if (!key) return null;
  const students = await readAll<Student>(STUDENT_DIR);
  return students.find((s) => s[kind] === key) ?? null;
}

// --- lessons ---------------------------------------------------------------

export async function createLesson(
  input: Pick<Lesson, "title" | "mode" | "studentId" | "capture" | "language">,
): Promise<Lesson> {
  await ensureDirs();
  const lesson: Lesson = {
    id: randomUUID(),
    title: input.title,
    studentId: input.studentId,
    mode: input.mode,
    capture: input.capture,
    language: input.language,
    createdAt: new Date().toISOString(),
    interruptions: [],
    transcript: [],
    debrief: [],
    debriefTranscript: [],
  };
  await writeJson(path.join(LESSON_DIR, `${lesson.id}.json`), lesson);
  return lesson;
}

export async function getLesson(id: string): Promise<Lesson | null> {
  return readJson<Lesson>(recordPath(LESSON_DIR, id));
}

export async function updateLesson(
  id: string,
  change: Change<Lesson>,
): Promise<Lesson | null> {
  return updateRecord<Lesson>(LESSON_DIR, id, change);
}

export async function listLessons(studentId?: string): Promise<Lesson[]> {
  const lessons = await readAll<Lesson>(LESSON_DIR);
  return lessons
    .filter((l) => !studentId || l.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- parent reports --------------------------------------------------------

export async function saveReport(report: ParentReport): Promise<ParentReport> {
  await ensureDirs();
  await writeJson(path.join(REPORT_DIR, `${report.id}.json`), report);
  return report;
}

export async function getReport(id: string): Promise<ParentReport | null> {
  return readJson<ParentReport>(recordPath(REPORT_DIR, id));
}

export async function listReports(studentId?: string): Promise<ParentReport[]> {
  const reports = await readAll<ParentReport>(REPORT_DIR);
  return reports
    .filter((r) => !studentId || r.studentId === studentId)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// --- homework pictures -----------------------------------------------------

/** A fresh name per upload, so a replaced picture is never served from cache. */
/** Our own picture names only: never a path, never another extension. */
const IMAGE_NAME = /^[\w-]+\.(jpg|png|webp)$/;

export async function saveImage(
  lessonId: string,
  data: ArrayBuffer,
  ext: "jpg" | "png" | "webp" = "jpg",
): Promise<string> {
  if (!SAFE_ID.test(lessonId)) throw new Error("Bad lesson id.");
  await ensureDirs();
  const name = `${lessonId}-${randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, name), Buffer.from(data));
  return name;
}

export async function readImage(name: string): Promise<Buffer | null> {
  // Names are generated here; anything else is not ours to read.
  if (!IMAGE_NAME.test(name)) return null;
  try {
    return await fs.readFile(path.join(IMAGE_DIR, name));
  } catch {
    return null;
  }
}

export async function deleteImage(name: string | undefined): Promise<void> {
  if (!name || !IMAGE_NAME.test(name)) return;
  await fs.rm(path.join(IMAGE_DIR, name), { force: true });
}
