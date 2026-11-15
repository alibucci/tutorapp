"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CORE_FILM, HELP_FILMS, clock } from "@/lib/help";

/**
 * The Help topics. On a wide screen a sidebar; on a phone a "Topics" button
 * that opens the same list above the film and closes once one is picked.
 */
export function HelpNav() {
  const path = usePathname();
  // Open only on the page it was opened on: picking a topic closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;

  const current =
    path === "/help" ? CORE_FILM.title : HELP_FILMS.find((f) => path === `/help/${f.id.toLowerCase()}`)?.title;

  const item = (href: string, active: boolean) =>
    `flex items-baseline gap-2.5 rounded-[var(--radius)] px-3 py-2 t-small transition-colors ${
      active ? "bg-accent-soft font-semibold text-foreground" : "hover:bg-sunken"
    }`;

  const list = (
    <nav aria-label="Help topics" className="space-y-5">
      <div>
        <p className="t-eyebrow px-3">Start here</p>
        <Link
          href="/help"
          aria-current={path === "/help" ? "page" : undefined}
          className={`mt-2 block rounded-[var(--radius)] border px-3 py-3 transition-colors ${
            path === "/help" ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-sunken"
          }`}
        >
          <span className="block font-semibold">{CORE_FILM.title}</span>
          <span className="t-caption t-muted">The full lesson, start to finish · {clock(CORE_FILM.seconds)}</span>
        </Link>
      </div>
      <div>
        <p className="t-eyebrow px-3">One function each</p>
        <ul className="mt-2 space-y-0.5">
          {HELP_FILMS.map((f) => {
            const href = `/help/${f.id.toLowerCase()}`;
            const active = path === href;
            return (
              <li key={f.id}>
                <Link href={href} aria-current={active ? "page" : undefined} className={item(href, active)}>
                  <span className="w-7 shrink-0 t-caption t-muted">{f.id}</span>
                  <span>{f.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );

  return (
    <>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : path)}
          aria-expanded={open}
          className="btn btn-quiet btn-block justify-between"
        >
          <span className="truncate">Topics{current ? ` · ${current}` : ""}</span>
          <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
        {open && <div className="card card-pad mt-2">{list}</div>}
      </div>
      <div className="hidden md:block">{list}</div>
    </>
  );
}
