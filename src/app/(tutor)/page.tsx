import Link from "next/link";
import {
  Avatar,
  BookIcon,
  ChatIcon,
  ChevronRight,
  ImageIcon,
  MicIcon,
  PlusIcon,
  StyleTag,
} from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { homeworkDone } from "@/lib/homework";
import { listLessons, listStudents } from "@/lib/store";
import type { Lesson } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Older than this and a loose end is history, not a to-do. */
const TODO_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

type Todo = {
  href: string;
  title: string;
  detail: string;
  kind: "warn" | "accent";
  icon: React.ReactNode;
};

/** The one thing each recent lesson is still waiting for, if anything. */
function todoFor(lesson: Lesson, name: string): Todo | null {
  const base = `/lesson/${lesson.id}`;
  if (lesson.startedAt && !lesson.endedAt) {
    return {
      href: base,
      title: `Finish ${name}'s lesson`,
      detail: `${lesson.title} · it was interrupted`,
      kind: "warn",
      icon: <MicIcon />,
    };
  }
  if (lesson.endedAt && lesson.debrief.length === 0) {
    const begun = lesson.debriefTranscript.length > 0;
    return {
      href: `${base}/debrief`,
      title: `${begun ? "Finish" : "Record"} the debrief for ${name}`,
      detail: `${lesson.title} · ${begun ? "it was interrupted" : "sixty seconds"}`,
      kind: "warn",
      icon: <MicIcon />,
    };
  }
  if (lesson.debrief.length > 0 && !lesson.summary) {
    return {
      href: `${base}/review`,
      title: `Review ${name}'s lesson`,
      detail: `${lesson.title} · the summary writes itself`,
      kind: "warn",
      icon: <BookIcon />,
    };
  }
  if (lesson.summary && !lesson.homework?.sentAt) {
    return {
      href: `${base}/review#homework`,
      title: `Send ${name} their homework`,
      detail: `${lesson.title} · add a picture`,
      kind: "warn",
      icon: <ImageIcon />,
    };
  }
  if (lesson.parentMessage && !lesson.parentMessage.copiedAt) {
    return {
      href: `${base}/review#parent`,
      title: `Message ${name}'s parent`,
      detail: `${lesson.title} · ready to copy`,
      kind: "accent",
      icon: <ChatIcon />,
    };
  }
  return null;
}

/** Loose ends from the last two weeks, newest first. */
function recentTodos(lessons: Lesson[], names: Map<string, string>): Todo[] {
  const cutoff = Date.now() - TODO_WINDOW_MS;
  return lessons
    .filter((l) => new Date(l.createdAt).getTime() > cutoff)
    .map((l) => todoFor(l, names.get(l.studentId) ?? "your student"))
    .filter((t): t is Todo => t !== null);
}

/** One line under a student's card: the state of their latest lesson. */
function statusFor(latest: Lesson | undefined): { text: string; tone: string } {
  if (!latest) return { text: "No lessons yet", tone: "t-muted" };
  const hw = latest.homework;
  if (homeworkDone(hw)) return { text: "Homework handed in", tone: "text-live" };
  if (hw?.sentAt) return { text: "Homework sent", tone: "t-muted" };
  if (latest.summary) return { text: "Homework not sent", tone: "text-warn" };
  return { text: `Last lesson ${DAY.format(new Date(latest.createdAt))}`, tone: "t-muted" };
}

export default async function Home() {
  const session = await requireSession();
  const students = await listStudents(session.id);
  const names = new Map(students.map((s) => [s.id, s.name]));
  const lessons = (await listLessons()).filter((l) => names.has(l.studentId));

  const todos = recentTodos(lessons, names);

  const latest = new Map<string, Lesson>();
  for (const lesson of lessons) {
    if (!latest.has(lesson.studentId)) latest.set(lesson.studentId, lesson);
  }

  return (
    <div className="stack-lg pb-24 sm:pb-0">
      <section>
        <h1 className="t-display">Hi, {session.name}</h1>
        <p className="t-body t-muted mt-1">
          {todos.length
            ? `${todos.length} ${todos.length === 1 ? "thing needs" : "things need"} you.`
            : "Nothing waiting on you."}
        </p>
      </section>

      {todos.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="t-eyebrow">Needs you · {todos.length}</h2>
          <ul className="grid gap-2.5 lg:grid-cols-2">
            {todos.map((todo) => (
              <li key={todo.href}>
                <Link href={todo.href} className="card card-press todo">
                  <span
                    className={`todo-icon ${
                      todo.kind === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"
                    }`}
                  >
                    {todo.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{todo.title}</span>
                    <span className="block t-small t-muted">{todo.detail}</span>
                  </span>
                  <span className="t-muted">
                    <ChevronRight />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="t-eyebrow">Students</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {students.map((student) => {
            const status = statusFor(latest.get(student.id));
            return (
              <li key={student.id}>
                <Link
                  href={`/student/${student.id}`}
                  className="card card-press flex h-full min-h-[10.5rem] flex-col gap-3 p-4"
                >
                  <Avatar name={student.name} />
                  <span className="flex flex-col items-start gap-1">
                    <span className="block max-w-full truncate text-[1.0625rem] font-semibold">
                      {student.name}
                    </span>
                    <StyleTag id={student.gameStyle} />
                  </span>
                  <span className={`mt-auto t-small font-medium ${status.tone}`}>
                    {status.text}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/student/new"
              className="card-press flex h-full min-h-[10.5rem] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-[1.5px] border-dashed border-line-strong p-4 font-semibold t-muted"
            >
              <PlusIcon />
              Add student
            </Link>
          </li>
        </ul>
      </section>

      {/* A phone's thumb lives at the bottom; so does the one thing a tutor
          opens the app to do. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background from-70% to-transparent px-4 pb-6 pt-4 sm:hidden">
        <Link href="/lesson/new" className="btn btn-primary btn-lg btn-block">
          <MicIcon />
          Start a lesson
        </Link>
      </div>
    </div>
  );
}
