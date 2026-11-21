import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpVideo } from "@/components/HelpVideo";
import { requireSession } from "@/lib/auth";
import { CORE_FILM, clock, helpFor } from "@/lib/help";
import { helpAccess } from "@/lib/helpAccess";

type Params = { params: Promise<{ topic: string }> };

async function topics() {
  return helpFor(await helpAccess(await requireSession()));
}

export async function generateMetadata({ params }: Params) {
  const topic = (await params).topic.toLowerCase();
  const f = (await topics()).find((x) => x.id.toLowerCase() === topic);
  return { title: f ? `Help · ${f.title}` : "Help" };
}

/** One function: its film (where there is one), the steps written out, and the way on. */
export default async function HelpTopicPage({ params }: Params) {
  const list = await topics();
  const topic = (await params).topic.toLowerCase();
  const i = list.findIndex((x) => x.id.toLowerCase() === topic);
  // A topic for a feature this tutor does not have is not there at all.
  if (i < 0) notFound();
  const f = list[i];
  const prev = i > 0 ? list[i - 1] : null;
  const next = list[i + 1] ?? null;

  return (
    <article className="space-y-6">
      <header>
        <p className="t-eyebrow">
          Help · {f.id}
          {f.seconds ? ` · ${clock(f.seconds)}` : " · steps"}
        </p>
        <h1 className="t-display mt-2">{f.title}</h1>
        <p className="t-muted mt-2 max-w-[42rem]">{f.why}</p>
      </header>

      {f.file && f.poster && <HelpVideo src={f.file} poster={f.poster} title={f.title} />}

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
