"use client";

import { useRef, useState } from "react";
import { clock } from "@/lib/help";

/**
 * A how-to film. Until Play is pressed it is only a picture (some browsers
 * skip a video's poster when nothing is preloaded, so the poster is a plain
 * image): opening the Help page costs one small image per film, never the
 * films. Chapters, when given, start the film at their moment.
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
  const [started, setStarted] = useState(false);
  const startAt = useRef(0);

  function play(at?: number) {
    if (at !== undefined) startAt.current = at;
    const v = ref.current;
    if (!started || !v) {
      setStarted(true);
      return;
    }
    if (at !== undefined) v.currentTime = at;
    void v.play().catch(() => {});
    v.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius)] bg-sunken">
        {started ? (
          <video
            ref={ref}
            src={src}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={title}
            onLoadedMetadata={(e) => {
              if (startAt.current) e.currentTarget.currentTime = startAt.current;
            }}
            className="h-full w-full"
          />
        ) : (
          <button type="button" onClick={() => play()} className="group block h-full w-full" aria-label={`Play: ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a private poster served by Caddy, already sized */}
            <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-white shadow-lg transition-transform group-hover:scale-105">
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      {chapters && (
        <ol className="grid gap-1 sm:grid-cols-2">
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => play(c.at)}
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
