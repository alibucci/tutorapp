import { TOP_LEVEL, mathSummary } from "@/lib/math";
import type { MathPractice } from "@/lib/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** How the sums are going, for the parent and the tutor alike. */
export function MathSummary({ math }: { math: MathPractice }) {
  const { label, playedThisWeek, hardest, latest } = mathSummary(math);
  return (
    <div className="space-y-3">
      <p className="t-small">
        <span className="font-semibold">
          Level {math.level} of {TOP_LEVEL}:
        </span>{" "}
        {label}
      </p>
      <p className="t-small t-muted">
        {playedThisWeek === 0
          ? "Not played in the last 7 days."
          : `Played ${playedThisWeek} ${playedThisWeek === 1 ? "time" : "times"} in the last 7 days.`}
        {hardest
          ? ` Hardest lately: ${hardest.skill}, like ${hardest.example}.`
          : " No mistakes in the last games."}
      </p>
      <ul className="space-y-1.5">
        {latest.map((game) => (
          <li key={game.at} className="flex items-baseline justify-between gap-3 t-small">
            <span className="t-muted">
              {DATE.format(new Date(game.at))} · Level {game.level}
            </span>
            <span className="font-medium tabular-nums">
              {game.right}/{game.total}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
