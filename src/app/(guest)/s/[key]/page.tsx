import { notFound } from "next/navigation";
import { getStudentByKey } from "@/lib/store";
import type { Skill } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "What I'm working on" };

/**
 * The student's own screen.
 *
 * Hierarchy is deliberate: the first goal is the entry point, because "what do
 * I do now" is the only question a child brings here. The greeting is a
 * courtesy and is sized like one. Goals two and three are listed rather than
 * carded so they cannot compete, and exactly one surface on the screen carries
 * the accent - if everything is highlighted, nothing is.
 *
 * The count of things already beaten is the largest number on the page. It is
 * the only reason anyone opens this twice.
 */
export default async function StudentView({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await getStudentByKey("studentKey", key);
  if (!student) notFound();

  const working = student.skills.filter((s) => s.status !== "solid").slice(0, 3);
  const done = student.skills.filter((s) => s.status === "solid");
  const [first, ...rest] = working;

  return (
    <div className="stack-lg">
      <header>
        <p className="t-eyebrow">Hi, {student.name}</p>
        <h1 className="t-display mt-2">
          {first ? "Here's what to work on." : "Nothing outstanding right now."}
        </h1>
      </header>

      {!first && done.length === 0 && (
        <p className="empty">
          Nothing here yet. It fills in after your next lesson.
        </p>
      )}

      {first && <FocusGoal skill={first} />}

      {rest.length > 0 && (
        <section>
          <h2 className="t-eyebrow mb-1">After that</h2>
          <div>
            {rest.map((skill, i) => (
              <Minor key={skill.topic} skill={skill} index={i + 2} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="card card-pad">
          <p className="stat">{done.length}</p>
          <p className="t-subtitle mt-1">
            {done.length === 1
              ? "thing you couldn't do before"
              : "things you couldn't do before"}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {done.map((skill) => (
              <li key={skill.topic} className="pill pill-done">
                {skill.topic}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The entry point. The only accented surface on the screen. */
function FocusGoal({ skill }: { skill: Skill }) {
  return (
    <section className="card card-focus overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span aria-hidden className="badge badge-lg">
            1
          </span>
          <p className="t-eyebrow">Start here</p>
        </div>
        <h2 className="t-title mt-4">{skill.topic}</h2>
        <p className="t-body t-muted mt-2 measure">{skill.note}</p>
      </div>

      {skill.practice && (
        <div className="border-t border-line bg-surface px-5 py-5 sm:px-7">
          <p className="t-eyebrow">Try this</p>
          <p className="t-subtitle mt-2 font-normal">{skill.practice}</p>
        </div>
      )}
    </section>
  );
}

/** Listed, not carded - these are next, not now. */
function Minor({ skill, index }: { skill: Skill; index: number }) {
  return (
    <div className="minor">
      <span aria-hidden className="badge badge-sm mt-0.5">
        {index}
      </span>
      <div className="min-w-0">
        <p className="t-body font-medium">{skill.topic}</p>
        <p className="t-small t-muted mt-0.5">{skill.note}</p>
      </div>
    </div>
  );
}
