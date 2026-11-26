"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { PART_LABEL, SHEET_LABEL, chosenKinds, packFresh, videoSearchUrl } from "@/lib/planShared";
import { SHEET_KINDS, SLIDE_PARTS, type PlanCard, type SheetKind, type Slide, type SlidePart } from "@/lib/types";
import { useRefreshWhile } from "./PlanBoard";

type Draft = Omit<Slide, "id" | "editedAt"> & { id?: string; key: string; removeImage?: boolean };

const draftsOf = (slides: Slide[]): Draft[] => slides.map((s) => ({ ...s, key: s.id }));

export function CardEditor({
  planId,
  card,
  building,
  canDraw,
  group = false,
  start,
}: {
  planId: string;
  card: PlanCard;
  building: boolean;
  /** Pictures can be drawn on this server. */
  canDraw: boolean;
  /** A group's plan: slides can carry a harder step. */
  group?: boolean;
  /** Who the lesson is for, and a lesson from this card still going, if any. */
  start?: StartInfo;
}) {
  const router = useRouter();
  useRefreshWhile(building);
  const base = `/api/plans/${planId}/cards/${card.id}`;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call<T>(label: string, url: string, init: RequestInit & { json?: unknown }) {
    setBusy(label);
    setError(null);
    const result = await api<T>(url, init);
    setBusy(null);
    if (!result.ok) setError(result.error);
    router.refresh();
    return result;
  }

  const materials = card.materials;
  const edited = materials?.slides.filter((s) => s.editedAt).length ?? 0;

  return (
    <div className="stack-lg">
      <Basics card={card} onSave={(json) => call("basics", base, { method: "PATCH", json })} busy={busy === "basics"} />
      {!card.story && (card.review?.length || card.reviewOff) ? (
        <ReviewWorkedIn
          card={card}
          busy={busy === "review"}
          disabled={busy !== null || building}
          onSave={(json) => call("review", base, { method: "PATCH", json })}
        />
      ) : null}

      {building && (
        <p className="note note-accent">
          {card.building?.step ?? "Writing the lesson"}… This takes a minute or two. You can leave this page.
          {materials ? " The slides below already work; pictures appear as they are drawn." : ""}
        </p>
      )}
      {building && !materials ? null : !materials ? (
        <section className="card card-pad stack-sm">
          <p>{card.buildError ? `The slides were not written: ${card.buildError}` : "No slides yet."}</p>
          <button
            className="btn btn-primary self-start"
            disabled={busy !== null}
            onClick={() => void call("build", `${base}/build`, { method: "POST", json: {} })}
          >
            Make the slides
          </button>
        </section>
      ) : (
        <>
          {card.buildError && <p className="note note-warn">The last rebuild failed: {card.buildError}</p>}
          <Teach planId={planId} card={card} start={start} />
          {card.story ? (
            <section className="card card-pad stack-sm">
              <h2 className="font-semibold">Bible story</h2>
              <p className="t-small t-muted">
                The story is told from its card and checked: every fact there, nothing added, no forbidden word. The
                questions, the order of events, today&rsquo;s habit and the pictures come from the card as written.
              </p>
              <button
                className="btn btn-quiet self-start"
                disabled={busy !== null || building}
                onClick={() => {
                  if (edited && !window.confirm(`Your changes to ${edited} slides will be replaced. Tell it again?`)) return;
                  void call("rebuild", `${base}/build`, { method: "POST", json: {} });
                }}
              >
                Tell it again
              </button>
            </section>
          ) : (
            <Rebuild
              edited={edited}
              busy={busy === "rebuild" || building}
              onRebuild={(wish, keepEdited) =>
                call("rebuild", `${base}/build`, { method: "POST", json: { wish, keepEdited } })
              }
            />
          )}
          <SlidesEditor
            // Reset from the server when the words change (a rewrite, a save),
            // not when a picture lands: unsaved typing must survive that.
            key={materials.builtAt + materials.slides.map((x) => x.id + x.title + (x.text ?? "") + (x.editedAt ?? "")).join("|")}
            slides={materials.slides}
            group={group && !card.story}
            story={Boolean(card.story)}
            busy={building ? "building" : busy}
            onSave={(slides) => call("slides", base, { method: "PATCH", json: { slides } })}
            onAsk={(slideId, wish) => call("slide:" + slideId, `${base}/build`, { method: "POST", json: { slideId, wish } })}
            onRedraw={
              canDraw
                ? (slideId) => call("draw:" + slideId, `${base}/build`, { method: "POST", json: { slideId, redraw: true } })
                : undefined
            }
          />
          {!card.story && materials.sheets.length > 0 && (
            <SheetPicker
              card={card}
              planId={planId}
              busy={busy === "sheets"}
              disabled={busy !== null || building}
              onSave={(sheetKinds) => call("sheets", base, { method: "PATCH", json: { sheetKinds } })}
            />
          )}
          {materials.videos.length > 0 && (
            <section className="card card-pad stack-sm">
              <h2 className="font-semibold">Videos to look up</h2>
              <ul className="stack-sm">
                {materials.videos.map((v) => (
                  <li key={v.platform + v.query}>
                    <a href={videoSearchUrl(v)} target="_blank" rel="noopener noreferrer" className="underline">
                      {v.platform}: {v.query}
                    </a>
                    <span className="block t-small t-muted">{v.what}</span>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Search ideas, not checked videos: the app cannot tell whether a video suits children, so watch one
                before you show it. YouTube needs a VPN in mainland China; Bilibili does not. Videos need the
                internet and are not in the offline file.
              </p>
            </section>
          )}
        </>
      )}
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}

function Basics({
  card,
  onSave,
  busy,
}: {
  card: PlanCard;
  onSave: (json: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  const [topic, setTopic] = useState(card.topic);
  const [goal, setGoal] = useState(card.goal);
  const [words, setWords] = useState(card.words.join(", "));
  const changed = topic !== card.topic || goal !== card.goal || words !== card.words.join(", ");
  return (
    <section className="card card-pad stack-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Topic</span>
          <input className="field" value={topic} maxLength={60} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Goal - the new learning</span>
          <input className="field" value={goal} maxLength={140} onChange={(e) => setGoal(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">Words (3 to 6, with commas)</span>
        <input className="field" value={words} onChange={(e) => setWords(e.target.value)} />
      </label>
      {card.link && <p className="t-small t-muted">{card.link}</p>}
      {changed && (
        <button
          className="btn btn-quiet self-start"
          disabled={busy}
          onClick={() =>
            void onSave({ topic, goal, words: words.split(",").map((w) => w.trim()).filter(Boolean) })
          }
        >
          {busy ? "Saving…" : "Save"}
        </button>
      )}
    </section>
  );
}

/**
 * The review a build worked in from the children's practice, apart from the
 * goal: the tutor sees what is new and what is going back over, and has the
 * last word on the second. What they take out stays out on the next rebuild.
 */
function ReviewWorkedIn({
  card,
  busy,
  disabled,
  onSave,
}: {
  card: PlanCard;
  busy: boolean;
  disabled: boolean;
  onSave: (json: { review?: string[]; reviewOff?: boolean }) => Promise<unknown>;
}) {
  const review = card.review ?? [];
  if (card.reviewOff) {
    return (
      <section className="card card-pad stack-sm">
        <h2 className="font-semibold">Review worked in</h2>
        <p className="t-small t-muted">
          None: you left review out of this lesson. A rebuild teaches only the new topic.
        </p>
        <button className="btn btn-quiet btn-sm self-start" disabled={disabled} onClick={() => void onSave({ reviewOff: false })}>
          {busy ? "Saving…" : "Work review in again"}
        </button>
        <span className="hint">It comes back with the next rebuild, from the newest results.</span>
      </section>
    );
  }
  return (
    <section className="card card-pad stack-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Review worked in</h2>
        <span className="tag tag-info">Review</span>
      </div>
      <p className="t-small t-muted">
        Going back over what came up in the children&rsquo;s homework and Smart Reviews. Kept apart from the goal
        above, which is the new learning.
      </p>
      <ul className="stack-sm">
        {review.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span className="flex-1">{line}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={disabled}
              onClick={() => void onSave({ review: review.filter((r) => r !== line) })}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn-quiet btn-sm self-start" disabled={disabled} onClick={() => void onSave({ reviewOff: true })}>
        {busy ? "Saving…" : "No review in this lesson"}
      </button>
      <span className="hint">
        Removing does not change the slides: rebuild the lesson to take it out of them. A rebuild uses the newest
        results and leaves out what you removed.
      </span>
    </section>
  );
}

export type StartInfo = {
  studentIds: string[];
  /** A lesson made from this card and not finished: go back to it. */
  openLessonId?: string;
  /** ...and it was already recording. */
  started?: boolean;
};

const MODE_KEY = "aloudli-start-mode";

/**
 * Start the lesson: one press makes the lesson, opens the slides in their own
 * window and starts the recording. The window is opened inside the press -
 * a browser only allows a pop-up there - and pointed at the slides once the
 * lesson exists.
 */
function StartLesson({ planId, card, start }: { planId: string; card: PlanCard; start: StartInfo }) {
  const router = useRouter();
  const group = start.studentIds.length > 1;
  const [mode, setMode] = useState<"classroom" | "online">(() => {
    try {
      return window.localStorage.getItem(MODE_KEY) === "online" ? "online" : "classroom";
    } catch {
      return "classroom";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deck = `/api/plans/${planId}/cards/${card.id}/deck`;

  async function go() {
    setBusy(true);
    setError(null);
    const slides = window.open("", "aloudli-slides");
    try {
      let lessonId = start.openLessonId;
      if (!lessonId) {
        const made = await api<{ id: string }>("/api/lessons", {
          method: "POST",
          json: {
            title: card.topic || "Lesson",
            ...(group ? { studentIds: start.studentIds } : { studentId: start.studentIds[0], mode }),
            planCard: { planId, cardId: card.id },
          },
        });
        if (!made.ok) throw new Error(made.error);
        lessonId = made.data.id;
      }
      if (slides) slides.location.href = deck;
      router.push(`/lesson/${lessonId}?start=1`);
    } catch (e) {
      slides?.close();
      setError(e instanceof Error ? e.message : "The lesson could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      {!group && !start.openLessonId && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where is the lesson?">
          {(["classroom", "online"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                try {
                  window.localStorage.setItem(MODE_KEY, m);
                } catch {}
              }}
              className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-quiet"}`}
            >
              {m === "classroom" ? "In the room" : "Online"}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-primary btn-lg self-start" disabled={busy || !start.studentIds.length} onClick={() => void go()}>
        {busy ? "Starting…" : start.started ? "Carry on the lesson" : "Start lesson"}
      </button>
      <p className="t-small t-muted">
        {start.started
          ? "This lesson was started and not finished. Carry on: the slides open and the recording picks up where it stopped."
          : "The slides open in their own window and the recording starts. Finish the lesson there and the debrief opens."}
      </p>
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}

/** Start the lesson, show the slides, or save them as one file for a lesson without internet. */
function Teach({ planId, card, start }: { planId: string; card: PlanCard; start?: StartInfo }) {
  const deck = `/api/plans/${planId}/cards/${card.id}/deck`;
  const fresh = packFresh(card);
  return (
    <section className="card card-pad stack-sm">
      {start && <StartLesson planId={planId} card={card} start={start} />}
      <div className="flex flex-wrap gap-2">
        <a href={deck} target="_blank" rel="noopener" className={`btn ${start ? "btn-quiet" : "btn-primary"}`}>
          Only show the slides
        </a>
        <a href={`/lesson/new?plan=${planId}&card=${card.id}`} className="btn btn-quiet">
          Record with other settings
        </a>
        <a href={`${deck}?pack=1`} className="btn btn-quiet" download>
          Save for offline
        </a>
      </div>
      <p className="t-small">
        {card.packAt
          ? fresh
            ? "Saved for offline - the file you have matches this lesson."
            : "The lesson changed since you saved it. Save it again before the lesson."
          : "Not saved for offline yet."}
      </p>
      <details className="t-small">
        <summary className="cursor-pointer font-medium">No internet where you teach?</summary>
        <div className="stack-sm mt-2">
          <p>
            <b>Slides and sheets:</b> press &ldquo;Save for offline&rdquo; at home. You get one file; double-click it on the
            lesson computer and it opens in the browser with no internet. Sheets print from its &ldquo;Print sheets&rdquo; button.
          </p>
          <p>
            <b>Recording:</b> the recording needs the internet. Share it from your phone: on iPhone, Settings &rarr;
            Personal Hotspot &rarr; Allow Others to Join; on Android, Settings &rarr; Network &rarr; Hotspot. Then join
            that network on the computer. An hour of lesson uses roughly 100 MB.
          </p>
        </div>
      </details>
    </section>
  );
}

function Rebuild({
  edited,
  busy,
  onRebuild,
}: {
  edited: number;
  busy: boolean;
  onRebuild: (wish: string, keepEdited: boolean) => Promise<unknown>;
}) {
  const [wish, setWish] = useState("");
  const [rewriteMine, setRewriteMine] = useState(false);
  return (
    <section className="card card-pad stack-sm">
      <h2 className="font-semibold">Change the whole lesson</h2>
      <textarea
        className="field"
        rows={2}
        maxLength={400}
        value={wish}
        placeholder="e.g. Make it simpler. Add a game where they move. More about football."
        onChange={(e) => setWish(e.target.value)}
      />
      {edited > 0 && (
        <label className="flex items-start gap-2 t-small">
          <input type="checkbox" className="mt-1" checked={rewriteMine} onChange={(e) => setRewriteMine(e.target.checked)} />
          <span>
            Also rewrite the {edited} {edited === 1 ? "slide" : "slides"} I changed by hand.{" "}
            <span className="t-muted">Left unticked, they stay exactly as you made them.</span>
          </span>
        </label>
      )}
      <button
        className="btn btn-quiet self-start"
        disabled={busy || !wish.trim()}
        onClick={() => {
          if (rewriteMine && !window.confirm(`Your changes to ${edited} slides will be lost. Rebuild anyway?`)) return;
          void onRebuild(wish, !rewriteMine).then(() => setWish(""));
        }}
      >
        {busy ? "Starting…" : "Rebuild"}
      </button>
    </section>
  );
}

function SlidesEditor({
  slides,
  group,
  story,
  busy,
  onSave,
  onAsk,
  onRedraw,
}: {
  slides: Slide[];
  group: boolean;
  /** A Bible story: no slide is rewritten or drawn by the model on its own. */
  story: boolean;
  busy: string | null;
  onSave: (slides: unknown[]) => Promise<unknown>;
  onAsk: (slideId: string, wish: string) => Promise<unknown>;
  onRedraw?: (slideId: string) => Promise<unknown>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => draftsOf(slides));
  const [dirty, setDirty] = useState(false);
  /** The picture as the server has it now: drawn ones arrive while editing. */
  const live = (d: Draft) => (d.id ? slides.find((s) => s.id === d.id)?.image : undefined) ?? d.image;
  const set = (key: string, patch: Partial<Draft>) => {
    setDirty(true);
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= drafts.length) return;
    setDirty(true);
    setDrafts((all) => {
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const add = (i: number) => {
    setDirty(true);
    setDrafts((all) => {
      const next = [...all];
      next.splice(i + 1, 0, { key: `new-${Date.now()}`, part: all[i]?.part ?? "activity", title: "New slide" });
      return next;
    });
  };
  const remove = (i: number) => {
    setDirty(true);
    setDrafts((all) => all.filter((_, n) => n !== i));
  };
  // The editor's own key stays here; the server gets the slide.
  const save = () =>
    void onSave(drafts.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "key")))).then(() =>
      setDirty(false),
    );

  return (
    <section className="stack-sm">
      <div className="sticky top-0 z-[5] -mx-4 flex items-center justify-between gap-3 border-b border-line bg-background px-4 py-2">
        <h2 className="t-title">Slides ({drafts.length})</h2>
        <button className="btn btn-primary btn-sm" disabled={!dirty || busy === "slides"} onClick={save}>
          {busy === "slides" ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
      <ol className="stack-sm">
        {drafts.map((d, i) => (
          <li key={d.key} className="card card-pad stack-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{i + 1}.</span>
              <select
                className="field w-auto"
                value={d.part}
                onChange={(e) => set(d.key, { part: e.target.value as SlidePart })}
              >
                {SLIDE_PARTS.map((p) => (
                  <option key={p} value={p}>{PART_LABEL[p]}</option>
                ))}
              </select>
              {slides.find((s) => s.id === d.id)?.editedAt && <span className="tag tag-quiet">Changed by you</span>}
              <span className="ml-auto flex gap-1">
                <button className="btn btn-ghost btn-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-ghost btn-sm" aria-label="Move down" disabled={i === drafts.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn btn-ghost btn-sm" onClick={() => add(i)}>+ After</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(i)}>Delete</button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
              <label className="block">
                <span className="label">On screen</span>
                <input className="field" value={d.title} maxLength={60} onChange={(e) => set(d.key, { title: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Emoji</span>
                <input className="field" value={d.emoji ?? ""} maxLength={16} onChange={(e) => set(d.key, { emoji: e.target.value })} />
              </label>
            </div>
            <input
              className="field"
              value={d.text ?? ""}
              maxLength={200}
              placeholder="A short line under it (optional)"
              onChange={(e) => set(d.key, { text: e.target.value })}
            />
            <input
              className="field"
              value={d.say ?? ""}
              maxLength={80}
              placeholder="Word or phrase for the Listen button (optional)"
              onChange={(e) => set(d.key, { say: e.target.value })}
            />
            <label className="block">
              <span className="label">Your notes - only you see them</span>
              <textarea
                className="field"
                rows={2}
                maxLength={500}
                value={d.notes ?? ""}
                onChange={(e) => set(d.key, { notes: e.target.value })}
              />
            </label>
            {(group || d.harder) && (
              <details className="rounded-[var(--radius)] bg-sunken p-3" open={Boolean(d.harder)}>
                <summary className="cursor-pointer t-small font-medium">
                  Harder step, for the stronger children {d.harder ? "" : "(none)"}
                </summary>
                <div className="stack-sm mt-2">
                  <input
                    className="field"
                    value={d.harder?.title ?? ""}
                    maxLength={60}
                    placeholder="On screen, one step up"
                    onChange={(e) => set(d.key, { harder: { ...d.harder, title: e.target.value } })}
                  />
                  <input
                    className="field"
                    value={d.harder?.text ?? ""}
                    maxLength={200}
                    placeholder="A short line under it (optional)"
                    onChange={(e) => set(d.key, { harder: { ...d.harder, text: e.target.value } })}
                  />
                  <input
                    className="field"
                    value={d.harder?.say ?? ""}
                    maxLength={80}
                    placeholder="For the Listen button (optional)"
                    onChange={(e) => set(d.key, { harder: { ...d.harder, say: e.target.value } })}
                  />
                  <span className="hint">The slide stays easy; you show this on top of it with &ldquo;Harder&rdquo; or the H key.</span>
                </div>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {live(d) && !d.removeImage && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/plan-images/${encodeURIComponent(live(d)!)}`} alt="" className="h-16 w-24 rounded object-cover" />
                  <button className="btn btn-ghost btn-sm" onClick={() => set(d.key, { removeImage: true })}>
                    Remove picture
                  </button>
                </>
              )}
              {d.art && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.art} alt="" className="h-16 w-24 rounded bg-white object-contain" />
              )}
              {onRedraw && !story && d.id && d.picture && !dirty && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy !== null}
                  onClick={() => void onRedraw(d.id!)}
                >
                  {busy === "draw:" + d.id ? "Asking…" : live(d) ? "New picture" : "Draw a picture"}
                </button>
              )}
            </div>
            {d.id && !dirty && !story && <AskSlide busy={busy === "slide:" + d.id} onAsk={(wish) => onAsk(d.id!, wish)} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AskSlide({ busy, onAsk }: { busy: boolean; onAsk: (wish: string) => Promise<unknown> }) {
  const [wish, setWish] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (wish.trim()) void onAsk(wish).then(() => setWish(""));
      }}
    >
      <input
        className="field"
        value={wish}
        maxLength={400}
        placeholder="Ask for a different slide here, e.g. a guessing game"
        onChange={(e) => setWish(e.target.value)}
      />
      <button className="btn btn-quiet" disabled={busy || !wish.trim()}>
        {busy ? "Writing…" : "Rewrite"}
      </button>
    </form>
  );
}

/**
 * Which sheets this lesson prints: a tick per kind. Match and reading on an
 * older lesson are written when ticked, which takes a few seconds.
 */
function SheetPicker({
  card,
  planId,
  busy,
  disabled,
  onSave,
}: {
  card: PlanCard;
  planId: string;
  busy: boolean;
  disabled: boolean;
  onSave: (kinds: SheetKind[]) => Promise<unknown>;
}) {
  const [on, setOn] = useState<SheetKind[]>(chosenKinds(card));
  const saved = chosenKinds(card);
  const changed = on.length !== saved.length || on.some((k) => !saved.includes(k));
  const has = new Set(card.materials?.sheets.map((s) => s.kind));
  // The word search is made from the words on the spot; the rest come with the lesson.
  const toWrite = on.filter((k) => k !== "wordsearch" && !has.has(k));
  const coloring = card.materials?.sheets.find((s) => s.kind === "coloring");

  return (
    <section className="card card-pad stack-sm">
      <h2 className="font-semibold">Sheets to print</h2>
      <p className="t-small t-muted">Tick the ones you want for this lesson. Each is one A4 page.</p>
      <ul className="stack-sm">
        {SHEET_KINDS.map((k) => (
          <li key={k}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={on.includes(k)}
                disabled={disabled}
                onChange={(e) => setOn(e.target.checked ? [...on, k] : on.filter((x) => x !== k))}
              />
              <span>
                <span className="font-medium">{SHEET_LABEL[k].name}</span>
                <span className="t-small t-muted"> - {SHEET_LABEL[k].what}</span>
                {k === "coloring" && coloring && !coloring.image && (
                  <span className="t-small t-muted"> (the word in outline, no drawing)</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {changed ? (
        <button className="btn btn-primary self-start" disabled={disabled || on.length === 0} onClick={() => void onSave(on)}>
          {busy ? (toWrite.length ? "Writing the new sheets…" : "Saving…") : toWrite.length ? "Save and write the new sheets" : "Save"}
        </button>
      ) : (
        <a
          href={`/api/plans/${planId}/cards/${card.id}/deck?print=1`}
          target="_blank"
          rel="noopener"
          className={`btn btn-quiet self-start ${on.length === 0 ? "pointer-events-none opacity-50" : ""}`}
        >
          Print {on.length} {on.length === 1 ? "sheet" : "sheets"}
        </a>
      )}
      {changed && toWrite.length > 0 && (
        <span className="hint">This lesson was made before these sheets existed: writing them takes about half a minute.</span>
      )}
      <span className="hint">A4. The ticked ones are in the offline file too, behind its &ldquo;Print sheets&rdquo; button.</span>
    </section>
  );
}
