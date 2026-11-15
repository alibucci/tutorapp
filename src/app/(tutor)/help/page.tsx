import { HelpVideo } from "@/components/HelpVideo";
import { requireSession } from "@/lib/auth";
import { CORE_CHAPTERS, CORE_FILM, HELP_FILMS, clock } from "@/lib/help";

export const metadata = { title: "Help" };

/**
 * How to use aloudli: the whole lesson cycle in one film, then each other
 * function as its own short film, each with the same steps written out.
 * Signed-in tutors only (the layout and /api/auth/media both check).
 */
export default async function HelpPage() {
  await requireSession();

  return (
    <div className="stack-lg" style={{ maxWidth: "52rem" }}>
      <header>
        <p className="t-eyebrow">Help</p>
        <h1 className="t-display mt-2">How to use aloudli</h1>
        <p className="t-muted mt-2">
          Short films of the real app, with the same steps written out under each one.
          Start with the whole lesson cycle; the rest are one function each.
        </p>
        <nav aria-label="On this page" className="mt-4 flex flex-wrap gap-2">
          <a href="#cycle" className="tag tag-quiet">The lesson cycle</a>
          {HELP_FILMS.map((f) => (
            <a key={f.id} href={`#${f.id.toLowerCase()}`} className="tag tag-quiet">
              {f.title}
            </a>
          ))}
        </nav>
      </header>

      <section id="cycle" className="card card-pad space-y-5 scroll-mt-6">
        <div>
          <p className="t-eyebrow">The lesson cycle · {clock(CORE_FILM.seconds)}</p>
          <h2 className="t-title mt-1">{CORE_FILM.title}</h2>
          <p className="t-muted mt-1">{CORE_FILM.why}</p>
        </div>
        <HelpVideo src={CORE_FILM.file} poster={CORE_FILM.poster} title={CORE_FILM.title} chapters={CORE_CHAPTERS} />
        <div className="space-y-4 border-t border-line pt-4">
          {CORE_CHAPTERS.map((c) => (
            <div key={c.id}>
              <h3 className="font-semibold">
                <span className="t-muted">{c.id}</span> {c.title}
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 t-small">
                {c.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-2">
        <h2 className="t-title">Everything else</h2>
        <p className="t-muted">One function per film, in any order.</p>
      </div>

      {HELP_FILMS.map((f) => (
        <section key={f.id} id={f.id.toLowerCase()} className="card card-pad space-y-4 scroll-mt-6">
          <div>
            <p className="t-eyebrow">
              {f.id} · {clock(f.seconds)}
            </p>
            <h2 className="t-title mt-1">{f.title}</h2>
            <p className="t-muted mt-1">{f.why}</p>
          </div>
          <HelpVideo src={f.file} poster={f.poster} title={f.title} />
          <ol className="list-decimal space-y-1 pl-5 t-small">
            {f.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {f.tip && (
            <p className="note note-accent t-small">
              <span className="font-semibold">Tip · </span>
              {f.tip}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
