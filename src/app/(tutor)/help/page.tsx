import Link from "next/link";
import { HelpVideo } from "@/components/HelpVideo";
import { requireSession } from "@/lib/auth";
import { CORE_CHAPTERS, CORE_FILM, HELP_FILMS, clock } from "@/lib/help";

export const metadata = { title: "Help" };

/**
 * Help opens on the whole lesson cycle: the one film every tutor should see.
 * Signed-in tutors only (the layout and /api/auth/media both check).
 */
export default async function HelpPage() {
  await requireSession();
  const first = HELP_FILMS[0];

  return (
    <article className="space-y-6">
      <header>
        <p className="t-eyebrow">Help · Start here · {clock(CORE_FILM.seconds)}</p>
        <h1 className="t-display mt-2">{CORE_FILM.title}</h1>
        <p className="t-muted mt-2 max-w-[42rem]">{CORE_FILM.why}</p>
      </header>

      <HelpVideo src={CORE_FILM.file} poster={CORE_FILM.poster} title={CORE_FILM.title} chapters={CORE_CHAPTERS} />

      <section className="space-y-3">
        <h2 className="t-title">Step by step</h2>
        <ol className="grid gap-3 lg:grid-cols-2">
          {CORE_CHAPTERS.map((c) => (
            <li key={c.id} className="card card-pad">
              <p className="t-eyebrow">
                {c.id} · {clock(c.at)}
              </p>
              <h3 className="font-semibold mt-1">{c.title}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 t-small">
                {c.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <Link href={`/help/${first.id.toLowerCase()}`} className="card card-pad card-press flex items-center justify-between gap-4">
        <span>
          <span className="t-eyebrow block">Next · one function each</span>
          <span className="font-semibold">
            {first.id} {first.title}
          </span>
        </span>
        <span aria-hidden className="t-muted">→</span>
      </Link>
    </article>
  );
}
