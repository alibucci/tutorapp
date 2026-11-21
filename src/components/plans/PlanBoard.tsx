"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { packFresh, STATUS_LABEL } from "@/lib/planShared";
import type { LessonPlan, PlanCard } from "@/lib/types";

const MONTH_DEFAULT = 8;

/** While something is being written in the background, look again now and then. */
export function useRefreshWhile(active: boolean, ms = 3000) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), ms);
    return () => window.clearInterval(t);
  }, [active, ms, router]);
}

export function PlanBoard({
  plan,
  building,
  suggesting,
}: {
  plan: LessonPlan;
  building: string[];
  suggesting: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(plan.suggestError ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(String(MONTH_DEFAULT));
  const [wishes, setWishes] = useState(plan.parentWishes ?? "");
  const [order, setOrder] = useState(plan.cards.map((c) => c.id));
  const [deleting, setDeleting] = useState<PlanCard | null>(null);
  useRefreshWhile(suggesting || building.length > 0);

  // The server's order wins whenever it changes underneath (a card added).
  const serverOrder = plan.cards.map((c) => c.id).join(",");
  const [seen, setSeen] = useState(serverOrder);
  if (seen !== serverOrder) {
    setSeen(serverOrder);
    setOrder(plan.cards.map((c) => c.id));
  }
  const cards = order.map((id) => plan.cards.find((c) => c.id === id)).filter((c): c is PlanCard => Boolean(c));
  const today = cards.find((c) => c.status === "planned")?.id;

  async function call(label: string, url: string, init: RequestInit & { json?: unknown }) {
    setBusy(label);
    setError(null);
    const result = await api(url, init);
    setBusy(null);
    if (!result.ok) setError(result.error);
    router.refresh();
    return result;
  }

  async function saveOrder(next: string[]) {
    setOrder(next);
    await call("order", `/api/plans/${plan.id}`, { method: "PATCH", json: { order: next } });
  }

  return (
    <div className="stack-lg">
      <section className="card card-pad stack">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="label">Lesson length</span>
            <select
              className="field"
              value={plan.durationMinutes}
              onChange={(e) =>
                void call("length", `/api/plans/${plan.id}`, { method: "PATCH", json: { durationMinutes: Number(e.target.value) } })
              }
            >
              {[30, 45, 60].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 flex-1">
            <span className="label">What the parents want (optional)</span>
            <input
              className="field"
              value={wishes}
              maxLength={300}
              placeholder="e.g. More speaking, ready for school in September"
              onChange={(e) => setWishes(e.target.value)}
              onBlur={() =>
                wishes !== (plan.parentWishes ?? "") &&
                void call("wishes", `/api/plans/${plan.id}`, { method: "PATCH", json: { parentWishes: wishes } })
              }
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <form
          className="card card-pad stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void call("topic", `/api/plans/${plan.id}/cards`, { method: "POST", json: { mode: "topic", topic } }).then(
              (r) => r.ok && setTopic(""),
            );
          }}
        >
          <h2 className="font-semibold">I&rsquo;ll name a topic</h2>
          <input
            className="field"
            value={topic}
            maxLength={60}
            placeholder="Animals - or leave it empty"
            onChange={(e) => setTopic(e.target.value)}
          />
          <button className="btn btn-primary" disabled={busy !== null}>
            {busy === "topic" ? "Starting…" : topic.trim() ? "Make the lesson" : "Think of one"}
          </button>
          <span className="hint">Words, slides and notes for one lesson, in a minute or two.</span>
        </form>
        <form
          className="card card-pad stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void call("month", `/api/plans/${plan.id}/cards`, { method: "POST", json: { mode: "month", count: Number(count) } });
          }}
        >
          <h2 className="font-semibold">Suggest a month</h2>
          <label className="flex items-center gap-2 t-small">
            <input
              className="field w-20"
              type="number"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            lessons
          </label>
          <button className="btn btn-primary" disabled={busy !== null || suggesting}>
            {suggesting ? "Planning…" : "Suggest lessons"}
          </button>
          <span className="hint">Topics in order, none they have had before. Slides are made when you open a lesson.</span>
        </form>
      </section>

      {suggesting && <p className="note note-accent">Planning the month - this takes a minute or so.</p>}
      {error && <p className="note note-warn">{error}</p>}

      <section className="stack-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-title">Lessons</h2>
          <button
            className="btn btn-quiet btn-sm"
            disabled={busy !== null}
            onClick={() => void call("blank", `/api/plans/${plan.id}/cards`, { method: "POST", json: { mode: "blank" } })}
          >
            Add an empty one
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="note note-quiet">No lessons yet. Name a topic, or ask for a month.</p>
        ) : (
          <DragList
            cards={cards}
            onMove={(next) => void saveOrder(next)}
            render={(card, index, handle) => (
              <CardRow
                planId={plan.id}
                card={card}
                index={index}
                isToday={card.id === today}
                isBuilding={building.includes(card.id)}
                handle={handle}
                last={index === cards.length - 1}
                onUp={() => void saveOrder(swap(order, index, index - 1))}
                onDown={() => void saveOrder(swap(order, index, index + 1))}
                onStatus={(status) =>
                  void call("status", `/api/plans/${plan.id}/cards/${card.id}`, { method: "PATCH", json: { status } })
                }
                onDuplicate={() =>
                  void call("dup", `/api/plans/${plan.id}/cards`, { method: "POST", json: { duplicate: card.id } })
                }
                onDelete={() => setDeleting(card)}
              />
            )}
          />
        )}
      </section>

      <ConfirmDialog
        open={deleting !== null}
        title={`Remove "${deleting?.topic || "this lesson"}"?`}
        body="Its slides and pictures go with it. A lesson already taught from it stays as it is."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {
          const card = deleting;
          setDeleting(null);
          if (card) void call("delete", `/api/plans/${plan.id}/cards/${card.id}`, { method: "DELETE" });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function swap(ids: string[], a: number, b: number): string[] {
  if (b < 0 || b >= ids.length) return ids;
  const next = [...ids];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/**
 * Cards dragged by their handle, with a finger or a mouse: pointer events,
 * so a tablet works the same as a laptop. Up and down buttons do the same
 * for anyone who would rather not drag.
 */
function DragList({
  cards,
  onMove,
  render,
}: {
  cards: PlanCard[];
  onMove: (ids: string[]) => void;
  render: (card: PlanCard, index: number, handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; to: number } | null>(null);

  /** Where a card let go at this height would land, from the list it is in. */
  function targetIndex(from: Element, clientY: number): number {
    const items = Array.from(from.closest("ol")?.children ?? []) as HTMLElement[];
    let to = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        to = i;
        break;
      }
    }
    return to;
  }

  const ids = cards.map((c) => c.id);
  const from = drag ? ids.indexOf(drag.id) : -1;

  return (
    <ol className="stack-sm">
      {cards.map((card, index) => {
        const dragging = drag?.id === card.id;
        // Where the card being dragged would land opens a gap.
        const shift =
          drag && !dragging
            ? from < drag.to && index > from && index <= drag.to
              ? -1
              : from > drag.to && index < from && index >= drag.to
                ? 1
                : 0
            : 0;
        const handle: React.HTMLAttributes<HTMLElement> = {
          style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
          onPointerDown: (e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({ id: card.id, startY: e.clientY, dy: 0, to: index });
          },
          onPointerMove: (e) => {
            if (!drag || drag.id !== card.id) return;
            setDrag({ ...drag, dy: e.clientY - drag.startY, to: targetIndex(e.currentTarget, e.clientY) });
          },
          onPointerUp: () => {
            if (!drag) return;
            const next = [...ids];
            next.splice(from, 1);
            next.splice(drag.to, 0, drag.id);
            setDrag(null);
            if (next.join() !== ids.join()) onMove(next);
          },
          onPointerCancel: () => setDrag(null),
        };
        return (
          <li
            key={card.id}
            style={{
              transform: dragging ? `translateY(${drag!.dy}px)` : shift ? `translateY(${shift * 100}%)` : undefined,
              transition: dragging ? "none" : "transform 150ms ease-out",
              position: "relative",
              zIndex: dragging ? 2 : undefined,
            }}
          >
            {render(card, index, handle)}
          </li>
        );
      })}
    </ol>
  );
}

function CardRow({
  planId,
  card,
  index,
  isToday,
  isBuilding,
  handle,
  last,
  onUp,
  onDown,
  onStatus,
  onDuplicate,
  onDelete,
}: {
  planId: string;
  card: PlanCard;
  index: number;
  isToday: boolean;
  isBuilding: boolean;
  handle: React.HTMLAttributes<HTMLElement>;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onStatus: (s: PlanCard["status"]) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const done = card.status === "done";
  return (
    <div className={`card flex items-stretch ${done ? "opacity-70" : ""} ${isToday ? "card-accent" : ""}`}>
      <button
        type="button"
        aria-label={`Drag "${card.topic}" to a new place`}
        className="grid w-10 shrink-0 place-items-center t-muted select-none"
        {...handle}
      >
        ⋮⋮
      </button>
      <Link href={`/plans/${planId}/${card.id}`} className="min-w-0 flex-1 py-3 pr-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="t-small t-muted">{index + 1}.</span>
          <span className="font-semibold">{card.topic || "Untitled"}</span>
          {isToday && <span className="tag tag-info">Next</span>}
          {card.status !== "planned" && (
            <span className={`tag ${done ? "tag-done" : "tag-quiet"}`}>{STATUS_LABEL[card.status]}</span>
          )}
          {isBuilding && <span className="tag tag-warn">Writing…</span>}
          {card.buildError && !isBuilding && <span className="tag tag-warn">Not written</span>}
          {card.materials && !isBuilding && (
            <span className="tag tag-quiet">
              {card.materials.slides.length} slides{packFresh(card) ? " · saved offline" : ""}
            </span>
          )}
        </span>
        {card.words.length > 0 && <span className="block t-small t-muted mt-0.5">{card.words.join(" · ")}</span>}
        {card.carried?.length ? (
          <span className="block t-small mt-0.5">Carried over: {card.carried.join("; ")}</span>
        ) : null}
      </Link>
      <div className="relative flex shrink-0 items-center gap-1 pr-2">
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" disabled={index === 0} onClick={onUp}>
          ↑
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" disabled={last} onClick={onDown}>
          ↓
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="More" onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
        {menu && (
          <div
            className="card absolute right-2 top-full z-10 mt-1 flex w-44 flex-col p-1"
            onClick={() => setMenu(false)}
          >
            {card.status !== "done" && <button className="btn btn-ghost btn-sm justify-start" onClick={() => onStatus("done")}>Mark done</button>}
            {card.status !== "moved" && <button className="btn btn-ghost btn-sm justify-start" onClick={() => onStatus("moved")}>Mark moved</button>}
            {card.status !== "planned" && <button className="btn btn-ghost btn-sm justify-start" onClick={() => onStatus("planned")}>Back to planned</button>}
            <button className="btn btn-ghost btn-sm justify-start" onClick={onDuplicate}>Duplicate</button>
            <button className="btn btn-ghost btn-sm justify-start" onClick={onDelete}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}
