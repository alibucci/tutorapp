import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import type { Lesson, ParentReport, Student, Tutor } from "./types";

/**
 * File-backed store. One JSON file per record plus audio blobs.
 * Deliberately boring: swap this module for a real DB without touching callers.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const LESSON_DIR = path.join(DATA_DIR, "lessons");
const STUDENT_DIR = path.join(DATA_DIR, "students");
const TUTOR_DIR = path.join(DATA_DIR, "tutors");
const REPORT_DIR = path.join(DATA_DIR, "reports");
const AUDIO_DIR = path.join(DATA_DIR, "audio");

async function ensureDirs() {
  await Promise.all(
    [LESSON_DIR, STUDENT_DIR, TUTOR_DIR, REPORT_DIR, AUDIO_DIR].map((d) =>
      fs.mkdir(d, { recursive: true }),
    ),
  );
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

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
    active: true,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(TUTOR_DIR, `${tutor.id}.json`),
    JSON.stringify(tutor, null, 2),
  );
  return tutor;
}

export async function getTutor(id: string): Promise<Tutor | null> {
  return readJson<Tutor>(path.join(TUTOR_DIR, `${id}.json`));
}

export async function getTutorByEmail(email: string): Promise<Tutor | null> {
  const tutors = await readAll<Tutor>(TUTOR_DIR);
  const wanted = email.trim().toLowerCase();
  return tutors.find((t) => t.email === wanted) ?? null;
}

export async function updateTutor(
  id: string,
  patch: Partial<Tutor>,
): Promise<Tutor | null> {
  const current = await getTutor(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  await fs.writeFile(
    path.join(TUTOR_DIR, `${id}.json`),
    JSON.stringify(next, null, 2),
  );
  return next;
}

export async function listTutors(): Promise<Tutor[]> {
  const tutors = await readAll<Tutor>(TUTOR_DIR);
  return tutors.sort((a, b) => a.name.localeCompare(b.name));
}

// --- students --------------------------------------------------------------

/** URL-safe and long enough that a link is not guessable. */
function accessKey() {
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
  await fs.writeFile(
    path.join(STUDENT_DIR, `${student.id}.json`),
    JSON.stringify(student, null, 2),
  );
  return student;
}

export async function getStudent(id: string): Promise<Student | null> {
  return readJson<Student>(path.join(STUDENT_DIR, `${id}.json`));
}

export async function updateStudent(
  id: string,
  patch: Partial<Student>,
): Promise<Student | null> {
  const current = await getStudent(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  await fs.writeFile(
    path.join(STUDENT_DIR, `${id}.json`),
    JSON.stringify(next, null, 2),
  );
  return next;
}

/** Omit `tutorId` only where the caller is the superadmin. */
export async function listStudents(tutorId?: string): Promise<Student[]> {
  const students = await readAll<Student>(STUDENT_DIR);
  return students
    .filter((s) => !tutorId || s.tutorId === tutorId)
    .sort((a, b) => a.name.localeCompare(b.name));
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
  await fs.writeFile(
    path.join(LESSON_DIR, `${lesson.id}.json`),
    JSON.stringify(lesson, null, 2),
  );
  return lesson;
}

export async function getLesson(id: string): Promise<Lesson | null> {
  return readJson<Lesson>(path.join(LESSON_DIR, `${id}.json`));
}

export async function updateLesson(
  id: string,
  patch: Partial<Lesson>,
): Promise<Lesson | null> {
  const current = await getLesson(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  await fs.writeFile(
    path.join(LESSON_DIR, `${id}.json`),
    JSON.stringify(next, null, 2),
  );
  return next;
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
  await fs.writeFile(
    path.join(REPORT_DIR, `${report.id}.json`),
    JSON.stringify(report, null, 2),
  );
  return report;
}

export async function getReport(id: string): Promise<ParentReport | null> {
  return readJson<ParentReport>(path.join(REPORT_DIR, `${id}.json`));
}

export async function listReports(studentId?: string): Promise<ParentReport[]> {
  const reports = await readAll<ParentReport>(REPORT_DIR);
  return reports
    .filter((r) => !studentId || r.studentId === studentId)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

// --- audio -----------------------------------------------------------------

export async function saveAudio(
  lessonId: string,
  kind: "lesson" | "debrief",
  data: ArrayBuffer,
  ext: string,
): Promise<string> {
  await ensureDirs();
  const name = `${lessonId}-${kind}.${ext}`;
  await fs.writeFile(path.join(AUDIO_DIR, name), Buffer.from(data));
  return name;
}

export function audioPath(name: string) {
  return path.join(AUDIO_DIR, name);
}
