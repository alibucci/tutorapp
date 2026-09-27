"use client";

type Props = {
  level: number;
  threshold?: number | null;
  gateOpen: boolean;
};

/** Input level with the gate threshold marked, so a tutor can set it by eye. */
export function LevelMeter({ level, threshold, gateOpen }: Props) {
  // RMS is tiny for speech; a cube root spreads the useful range out.
  const pct = Math.min(100, Math.cbrt(level) * 100);
  const markAt = threshold ? Math.min(100, Math.cbrt(threshold) * 100) : null;

  return (
    <div
      className="meter"
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Microphone input level"
    >
      <div
        className="meter-fill"
        style={{
          transform: `scaleX(${pct / 100})`,
          background: gateOpen ? "var(--live)" : "var(--border-strong)",
        }}
      />
      {markAt !== null && (
        <div
          className="absolute inset-y-0 w-0.5"
          style={{ left: `${markAt}%`, background: "var(--accent)" }}
        />
      )}
    </div>
  );
}
