import { SKILL_STATUS_LABEL, type Skill, type SkillStatus } from "@/lib/types";

/** Status reads as a quiet label, not a colour-coded verdict. */
const DOT: Record<SkillStatus, string> = {
  struggling: "var(--accent)",
  improving: "var(--border-strong)",
  solid: "var(--live)",
};

export function SkillList({ skills }: { skills: Skill[] }) {
  if (!skills.length) {
    return (
      <p className="empty">
        Nothing tracked yet. Topics appear once a lesson has been reviewed.
      </p>
    );
  }

  return (
    <ul className="card rows">
      {skills.map((skill) => (
        <li key={skill.topic} className="px-4 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: DOT[skill.status] }}
            />
            <span className="t-body min-w-0 flex-1 font-medium">
              {skill.topic}
            </span>
            <span className="t-caption t-muted shrink-0">
              {SKILL_STATUS_LABEL[skill.status]}
            </span>
          </div>
          <p className="t-small t-muted mt-1 pl-4.5">{skill.note}</p>
          {skill.practice && (
            <p className="t-small mt-1.5 pl-4.5">
              <span className="t-muted">Practice: </span>
              {skill.practice}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
