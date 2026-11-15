"use client";

import { useRef } from "react";
import { clock } from "@/lib/help";

/**
 * A how-to film. Nothing downloads until Play (preload="none"): opening the
 * Help page costs a poster per film, not the films. Chapters, when given,
 * jump to their moment and play from there.
 */
export function HelpVideo({
  src,
  poster,
  title,
  chapters,
}: {
  src: string;
  poster: string;
  title: string;
  chapters?: { id: string; title: string; at: number }[];
}) {
  const ref = useRef<HTMLVideoElement>(null);

  function jump(at: number) {
    const v = ref.current;
    if (!v) return;
    v.currentTime = at;
    void v.play().catch(() => {});
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-3">
      <video
        ref={ref}
        src={src}
        poster={poster}
        controls
        preload="none"
        playsInline
        aria-label={title}
        className="aspect-video w-full rounded-[var(--radius)] bg-sunken"
      />
      {chapters && (
        <ol className="grid gap-1 sm:grid-cols-2">
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => jump(c.at)}
                className="flex w-full items-baseline gap-3 rounded-[var(--radius)] px-2 py-1.5 text-left hover:bg-sunken"
              >
                <span className="font-mono t-small t-muted">{clock(c.at)}</span>
                <span className="t-small">
                  <span className="t-muted">{c.id}</span> {c.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
