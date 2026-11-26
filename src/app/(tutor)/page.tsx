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
import { styleFor } from "@/lib/gameStyles";
import { recentActivity, timeAgo } from "@/lib/feed";
import { homeworkDone, sendsItself } from "@/lib/homework";
import { hasParent } from "@/lib/profile";
import { listGroupLessons, listLessons, listStudents } from "@/lib/store";
import type { Lesson, Student } from "@/lib/types";

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

/**
 * Homework that has not gone out, when that needs the tutor: they took it
 * back, or the automatic build and send failed. On its way otherwise - nothing
 * to do.
 */
function notSent(lesson: Lesson, name: string, what: string): Todo | null {
  const href = `/lesson/${lesson.id}/review#homework`;
  // From before homework sent itself: the tutor sends it, as it always was.
  if (!sendsItself(lesson)) {
    return { href, title: `Send ${name} their ${what}`, detail: `${lesson.title} · check it, then send`, kind: "warn", icon: <ImageIcon /> };
  }
  if (lesson.homework?.takenBackAt) {
    return { href, title: `Send ${name} their ${what}`, detail: `${lesson.title} · you took it back`, kind: "warn", icon: <ImageIcon /> };
  }
  if (lesson.autoFailed) {
    return { href, title: `${name}'s ${what} did not go out`, detail: `${lesson.title} · try again`, kind: "warn", icon: <ImageIcon /> };
  }
  return null;
}

/** How long a sent Smart Review can sit unfinished before the tutor hears of it. */
const REVIEW_STALE_MS = 4 * 24 * 60 * 60 * 1000;

/**
 * A Smart Review needs the tutor when it waits for their yes, could not be
 * made, or has sat unfinished for days. One the tutor set aside needs nothing.
 */
function reviewTodo(lesson: Lesson, name: string): Todo | null {
  const review = lesson.review!;
  if (review.state === "skipped" || review.state === "archived") return null;
  const href = `/lesson/${lesson.id}/review#homework`;
  const hw = lesson.homework;
  if (!hw?.exercises?.length) {
    return lesson.autoFailed
      ? { href, title: `${name}'s Smart Review could not be made`, detail: `${lesson.title} · try again`, kind: "warn", icon: <ImageIcon /> }
      : null;
  }
  if (!hw.sentAt) {
    return {
      href,
      title: `Check ${name}'s Smart Review`,
      detail: `${lesson.title} · ${review.by === "schedule" ? "made by the schedule" : "your draft"} - send it when it looks right`,
      kind: "warn",
      icon: <ImageIcon />,
    };
  }
  if (!homeworkDone(hw) && Date.now() - Date.parse(hw.sentAt) > REVIEW_STALE_MS) {
    return {
      href,
      title: `${name} has not finished a Smart Review`,
      detail: `${lesson.title} · keep it, or archive it so the next one can come`,
      kind: "accent",
      icon: <ImageIcon />,
    };
  }
  return null;
}

/** A schedule that could not make a review, or has been paused a long time. */
function scheduleTodo(student: Student): Todo | null {
  const s = student.schedule;
  if (!s?.enabled || student.archivedAt) return null;
  const href = `/student/${student.id}`;
  const failed = (s.log ?? []).filter((e) => e.outcome === "failed" && !e.lessonId && Date.now() - Date.parse(e.at) < 3 * 86_400_000).at(-1);
  if (failed) return { href, title: `The schedule could not make ${student.name}'s Smart Review`, detail: failed.reason, kind: "warn", icon: <ImageIcon /> };
  if (!s.reviewDays.length && s.mode !== "manual") {
    return { href, title: `${student.name}'s schedule has no days`, detail: "pick the days Smart Reviews come", kind: "accent", icon: <ImageIcon /> };
  }
  if (s.pausedAt && Date.now() - Date.parse(s.pausedAt) > TODO_WINDOW_MS) {
    return { href, title: `${student.name}'s schedule has been paused two weeks`, detail: "resume it, or switch it off", kind: "accent", icon: <ImageIcon /> };
  }
  return null;
}

/** The one thing each recent lesson is still waiting for, if anything. */
function todoFor(lesson: Lesson, name: string, parent: boolean): Todo | null {
  const base = `/lesson/${lesson.id}`;
  if (lesson.review) return reviewTodo(lesson, name);
  if (lesson.kind === "practice") {
    if (lesson.homework?.sentAt) return null;
    // Extra homework and programme stories go out by themselves; only a
    // failure or a take-back needs the tutor.
    return notSent(lesson, name, lesson.module ? "story" : "extra homework");
  }
  if (lesson.kind === "intro" && lesson.debrief.length === 0) {
    const begun = lesson.debriefTranscript.length > 0;
    return {
      href: `${base}/debrief`,
      title: `${begun ? "Finish" : "Record"} the note about ${name}`,
      detail: begun ? "it was interrupted" : "five short questions",
      kind: "warn",
      icon: <MicIcon />,
    };
  }
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
      detail: `${lesson.title} · ${begun ? "it was interrupted" : "five short prompts"}`,
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
    const todo = notSent(lesson, name, "homework");
    if (todo) return todo;
  }
  // An adult has nobody to send it to; the review page hides it for them too.
  if (parent && lesson.parentMessage && !lesson.parentMessage.copiedAt) {
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
/** A group lesson still on its way to becoming each child's own lesson. */
function groupTodo(lesson: Lesson): Todo | null {
  if (lesson.groupLessonIds) return null;
  const base = `/lesson/${lesson.id}`;
  const todo = (href: string, title: string, detail: string): Todo => ({
    href,
    title,
    detail,
    kind: "warn",
    icon: <MicIcon />,
  });
  if (lesson.startedAt && !lesson.endedAt) {
    return todo(base, "Finish the group lesson", `${lesson.title} · it was interrupted`);
  }
  if (lesson.endedAt && lesson.debrief.length === 0) {
    return todo(`${base}/debrief`, "Record the group debrief", `${lesson.title} · three questions on each child`);
  }
  if (lesson.debrief.length > 0) {
    return todo(`${base}/group`, "Check who said what", `${lesson.title} · group lesson`);
  }
  return null;
}

function recentTodos(lessons: Lesson[], names: Map<string, string>, adults: Set<string>): Todo[] {
  const cutoff = Date.now() - TODO_WINDOW_MS;
  return lessons
    .filter((l) => new Date(l.createdAt).getTime() > cutoff)
    .map((l) => todoFor(l, names.get(l.studentId) ?? "your student", !adults.has(l.studentId)))
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
  const [students, archived] = await Promise.all([
    listStudents(session.id),
    listStudents(session.id, "archived"),
  ]);
  const names = new Map(students.map((s) => [s.id, s.name]));
  const adults = new Set(students.filter((s) => !hasParent(s)).map((s) => s.id));
  const lessons = (await listLessons()).filter((l) => names.has(l.studentId));

  const groups = (await listGroupLessons()).filter((l) => names.has(l.studentId));
  const todos = [
    ...groups.map(groupTodo).filter((t): t is Todo => t !== null),
    // A programme's next item could not be built and sent by itself.
    ...students
      .filter((s) => s.modules?.christianity?.enabled && s.modules.christianity.failed)
      .map((s): Todo => ({
        href: `/student/${s.id}`,
        title: `The next story for ${s.name} did not go out`,
        detail: "send it from their page",
        kind: "warn",
        icon: <BookIcon />,
      })),
    ...recentTodos(lessons, names, adults),
    ...students.map(scheduleTodo).filter((t): t is Todo => t !== null),
  ];
  const activity = recentActivity(lessons, students);

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

      {activity.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="t-eyebrow">What the children have been doing</h2>
          <ul className="card rows">
            {activity.map((event) => (
              <li key={event.href + event.at}>
                <Link href={event.href} className="row row-link py-3">
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      event.done ? "bg-live" : "bg-info"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{event.what}</span>
                    <span className="block truncate t-small t-muted">{event.detail}</span>
                  </span>
                  <span className="shrink-0 t-small t-muted">{timeAgo(event.at)}</span>
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
                    <StyleTag style={styleFor(student)} />
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

      {archived.length > 0 && (
        <details className="group">
          <summary className="t-eyebrow cursor-pointer">
            Archived · {archived.length}
          </summary>
          <ul className="card rows mt-2.5">
            {archived.map((student) => (
              <li key={student.id}>
                <Link href={`/student/${student.id}`} className="row row-link py-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{student.name}</span>
                  <span className="t-muted">
                    <ChevronRight />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

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
