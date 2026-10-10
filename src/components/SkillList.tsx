import { SKILL_STATUS_LABEL, type Skill, type SkillStatus } from "@/lib/types";

/** Amber needs work, blue is on its way, green is done - the app-wide code. */
const TAG: Record<SkillStatus, string> = {
  struggling: "tag-warn",
  improving: "tag-info",
  solid: "tag-done",
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
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 font-semibold">{skill.topic}</span>
            <span className={`tag ${TAG[skill.status]}`}>
              {SKILL_STATUS_LABEL[skill.status]}
            </span>
          </div>
          <p className="t-small t-muted mt-1">{skill.note}</p>
          {skill.practice && (
            <p className="t-small mt-1.5">
              <span className="t-muted">Practice: </span>
              {skill.practice}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
