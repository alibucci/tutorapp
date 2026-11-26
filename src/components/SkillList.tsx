import { memoryState, recurringMistakes } from "@/lib/memory";
import {
  MEMORY_STATE_LABEL,
  SKILL_AREA_LABEL,
  SKILL_STATUS_LABEL,
  type MemoryState,
  type Skill,
  type SkillStatus,
} from "@/lib/types";

/** Amber needs work, blue is on its way, green is done - the app-wide code. */
const TAG: Record<SkillStatus, string> = {
  struggling: "tag-warn",
  improving: "tag-info",
  solid: "tag-done",
};

const MEMORY_TAG: Record<MemoryState, string> = {
  not_assessed: "tag-quiet",
  learning: "tag-warn",
  needs_review: "tag-warn",
  improving: "tag-info",
  retained: "tag-done",
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function SkillList({ skills, memory = false }: { skills: Skill[]; memory?: boolean }) {
  if (!skills.length) {
    return (
      <p className="empty">
        Nothing tracked yet. Topics appear once a lesson has been reviewed.
      </p>
    );
  }

  const now = new Date().toISOString();
  return (
    <ul className="card rows">
      {skills.map((skill) => {
        const state = memoryState(skill, now);
        const practice = (skill.evidence ?? []).filter((e) => e.source !== "lesson" && (e.total ?? 0) > 0);
        const last = practice.at(-1);
        const again = memory ? recurringMistakes(skill).slice(-2) : [];
        return (
          <li key={skill.id ?? skill.topic} className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 font-semibold">
                {skill.topic}
                {memory && (skill.area || skill.parent) && (
                  <span className="block t-caption t-muted font-normal">
                    {[skill.area && SKILL_AREA_LABEL[skill.area], skill.parent && `part of ${skill.parent}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              {memory ? (
                <span className={`tag ${MEMORY_TAG[state]}`} title={`Lesson status: ${SKILL_STATUS_LABEL[skill.status]}`}>
                  {MEMORY_STATE_LABEL[state]}
                </span>
              ) : (
                <span className={`tag ${TAG[skill.status]}`}>
                  {SKILL_STATUS_LABEL[skill.status]}
                </span>
              )}
            </div>
            <p className="t-small t-muted mt-1">{skill.note}</p>
            {skill.practice && (
              <p className="t-small mt-1.5">
                <span className="t-muted">Practice: </span>
                {skill.practice}
              </p>
            )}
            {memory && (
              <p className="t-caption t-muted mt-1.5">
                {[
                  `${skill.lessonIds.length} ${skill.lessonIds.length === 1 ? "lesson" : "lessons"}`,
                  last ? `last practice ${DATE.format(new Date(last.at))}: ${last.right}/${last.total} first go` : "not practised in homework yet",
                  skill.reviewAt && (skill.reviewAt <= now ? "review due" : `review ${DATE.format(new Date(skill.reviewAt))}`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {again.length > 0 && (
              <p className="t-caption mt-1">
                <span className="t-muted">Keeps coming back: </span>
                {again.map((m) => `“${m.answered}”${m.correct ? ` → ${m.correct}` : ""}`).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
