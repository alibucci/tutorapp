import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpVideo } from "@/components/HelpVideo";
import { requireSession } from "@/lib/auth";
import { CORE_FILM, HELP_FILMS, clock } from "@/lib/help";

type Params = { params: Promise<{ topic: string }> };

const find = (topic: string) => HELP_FILMS.findIndex((f) => f.id.toLowerCase() === topic.toLowerCase());

export async function generateMetadata({ params }: Params) {
  const i = find((await params).topic);
  return { title: i >= 0 ? `Help · ${HELP_FILMS[i].title}` : "Help" };
}

/** One function: its film, the same steps written out, and the way on. */
export default async function HelpTopicPage({ params }: Params) {
  await requireSession();
  const i = find((await params).topic);
  if (i < 0) notFound();
  const f = HELP_FILMS[i];
  const prev = i > 0 ? HELP_FILMS[i - 1] : null;
  const next = HELP_FILMS[i + 1] ?? null;

  return (
    <article className="space-y-6">
      <header>
        <p className="t-eyebrow">
          Help · {f.id} · {clock(f.seconds)}
        </p>
        <h1 className="t-display mt-2">{f.title}</h1>
        <p className="t-muted mt-2 max-w-[42rem]">{f.why}</p>
      </header>

      <HelpVideo src={f.file} poster={f.poster} title={f.title} />

      <section className="card card-pad space-y-3">
        <h2 className="t-title">Step by step</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
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

      <nav aria-label="More help" className="grid gap-3 sm:grid-cols-2">
        <Link
          href={prev ? `/help/${prev.id.toLowerCase()}` : "/help"}
          className="card card-pad card-press block"
        >
          <span className="t-eyebrow block">← Previous</span>
          <span className="font-semibold">{prev ? `${prev.id} ${prev.title}` : CORE_FILM.title}</span>
        </Link>
        {next && (
          <Link href={`/help/${next.id.toLowerCase()}`} className="card card-pad card-press block text-right">
            <span className="t-eyebrow block">Next →</span>
            <span className="font-semibold">
              {next.id} {next.title}
            </span>
          </Link>
        )}
      </nav>
    </article>
  );
}
