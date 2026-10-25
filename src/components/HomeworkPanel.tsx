"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GameStylePicker } from "@/components/GameStylePicker";
import { ImageIcon } from "@/components/ui";
import { homeworkDone } from "@/lib/homework";
import { ADJECTIVES_TASK, HOMEWORK_TASKS, type Lesson } from "@/lib/types";

/** Longest side of a stored picture. Plenty for a phone screen. */
const MAX_SIDE = 1600;

/**
 * Re-encode whatever the tutor picked as a modest JPEG.
 *
 * A phone photo is several megabytes and, on an iPhone, often HEIC, which
 * other browsers cannot show. Drawing it onto a canvas fixes both: the browser
 * that picked the file can decode it, and what comes out is a JPEG anyone can.
 */
async function toJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Typically an iPhone HEIC photo in a browser that cannot decode it.
    throw new Error(
      "This browser cannot open that photo format. Take a screenshot of it, or pick a JPEG or PNG.",
    );
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that picture."))),
      "image/jpeg",
      0.85,
    ),
  );
}

export function HomeworkPanel({
  lesson,
  studentId,
  studentName,
  studentKey,
  styleId,
  styleName,
  canDraw,
}: {
  lesson: Lesson;
  studentId: string;
  /** The student's game style, picked here as well as on their page. */
  styleId?: string;
  studentName: string;
  /** The child's private link key, for previewing their screen. */
  studentKey: string;
  /** The student's game style, for the button's wording. */
  styleName: string;
  /** Whether this server can draw pictures (an image API key is set). */
  canDraw: boolean;
}) {
  const router = useRouter();
  const homework = lesson.homework;
  const [focus, setFocus] = useState(
    homework?.focus ?? lesson.summary?.homeworkFocus ?? "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sent = Boolean(homework?.sentAt);
  const answers = homework?.answers;
  const candidates = homework?.candidates ?? [];
  const exercises = homework?.exercises ?? [];
  const finished = homeworkDone(homework);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Drawing takes from a few seconds to a minute or two; count it out loud.
  useEffect(() => {
    if (busy !== "draw") return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function buildGames() {
    setBusy("games");
    setError(null);
    const result = await api(
      `/api/lessons/${lesson.id}/homework/exercises`,
      { method: "POST" },
      "Could not build the games. Try again.",
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function draw() {
    setBusy("draw");
    setSeconds(0);
    setError(null);
    const result = await api(
      `/api/lessons/${lesson.id}/homework/draw`,
      { method: "POST" },
      "Could not draw the pictures. Try again.",
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const imageUrl = (file: string) => `/api/lessons/${lesson.id}/homework/image?f=${file}`;

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("image", await toJpeg(file), "homework.jpg");
      const res = await fetch(`/api/lessons/${lesson.id}/homework`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Could not upload the picture.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the picture.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function patch(
    payload: { focus?: string; send?: boolean; pick?: string; reopen?: boolean },
    label: string,
  ) {
    setBusy(label);
    setError(null);
    const result = await api(
      `/api/lessons/${lesson.id}/homework`,
      { method: "PATCH", json: payload },
      "Could not save.",
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section id="homework" className="space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-4">
        <h2 className="t-title">Homework</h2>
        <span className={`tag ${finished ? "tag-done" : sent ? "tag-info" : "tag-warn"}`}>
          {finished ? "Handed in" : sent ? "Sent · waiting" : "Not sent"}
        </span>
      </div>

      <div className="card space-y-5 p-5">
        {!finished && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            id={`hw-file-${lesson.id}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="t-eyebrow">Practice games</p>
            {!finished && exercises.length > 0 && (
              <button
                onClick={() => void buildGames()}
                disabled={busy !== null}
                className="btn btn-ghost btn-sm"
              >
                {busy === "games" ? "Building…" : "Build different ones"}
              </button>
            )}
          </div>

          {exercises.length === 0 ? (
            <button
              onClick={() => void buildGames()}
              disabled={busy !== null}
              className="btn btn-soft btn-block"
            >
              {busy === "games"
                ? "Reading the lesson…"
                : `Build games from ${studentName}'s mistakes`}
            </button>
          ) : (
            <ul className="space-y-2">
              {exercises.map((exercise) => {
                const result = (homework?.results ?? []).find((r) => r.kind === exercise.kind);
                return (
                  <li key={exercise.kind} className="rounded-[var(--radius)] bg-sunken p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="t-small font-semibold">{exercise.title}</span>
                      {result ? (
                        <span className="flex items-center gap-2">
                          {(result.attempts ?? 1) > 1 && (
                            <span className="t-caption t-muted">
                              first go {result.firstRight ?? result.right}/{result.total}
                            </span>
                          )}
                          <span
                            className={`tag ${
                              result.right / result.total >= 0.7 ? "tag-done" : "tag-warn"
                            }`}
                          >
                            {result.right}/{result.total}
                          </span>
                        </span>
                      ) : (
                        <span className="tag tag-quiet">
                          {exercise.rounds.length} rounds
                        </span>
                      )}
                    </div>
                    <p className="t-caption t-muted mt-0.5">{exercise.topic}</p>

                    {/* The rounds themselves: a score says how often, this
                        says on what. */}
                    {result?.rounds?.length ? (
                      <details className="group mt-2">
                        <summary className="cursor-pointer t-small font-semibold text-accent">
                          <span className="group-open:hidden">See the answers</span>
                          <span className="hidden group-open:inline">Hide</span>
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {result.rounds.map((round, i) => (
                            <li
                              key={i}
                              className={`rounded-[var(--radius-sm)] px-3 py-2 t-small ${
                                round.right ? "bg-live-soft" : "bg-warn-soft"
                              }`}
                            >
                              <span className="block t-muted">{round.asked}</span>
                              <span
                                className={`block font-semibold ${
                                  round.right ? "text-live" : "text-warn"
                                }`}
                              >
                                {round.right ? "✓" : "✗"} {round.answered}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {exercises.length > 0 && !sent && (
            <p className="hint">
              Tap a game to check it before you send - the words come from this
              lesson, but they are written by the model.
            </p>
          )}
        </div>

        {busy === "draw" ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-[var(--radius)] bg-accent-soft text-center">
            <SparkIcon />
            <span className="font-semibold">Drawing {styleName} pictures… {seconds}s</span>
            <span className="t-small t-muted px-6">
              Usually under a minute. You can leave this page - they will be here
              when you come back.
            </span>
          </div>
        ) : candidates.length > 0 && !finished ? (
          // Options drawn, none picked yet: the tutor chooses.
          <div className="space-y-3">
            <p className="t-small font-semibold">Tap the picture to use</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {candidates.map((file) => (
                <li key={file}>
                  <button
                    type="button"
                    onClick={() => void patch({ pick: file }, "pick")}
                    disabled={busy !== null}
                    className="card-press block w-full overflow-hidden rounded-[var(--radius)] border-2 border-transparent hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, per-lesson */}
                    <img src={imageUrl(file)} alt="A drawn option" className="aspect-[4/3] w-full bg-sunken object-cover" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void draw()} disabled={busy !== null} className="btn btn-quiet btn-sm">
                Draw different ones
              </button>
              <label htmlFor={`hw-file-${lesson.id}`} className="btn btn-ghost btn-sm cursor-pointer">
                Upload my own
              </label>
            </div>
          </div>
        ) : homework?.imageFile ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- a private, per-lesson upload; nothing to optimise */}
            <img
              src={imageUrl(homework.imageFile)}
              alt="Homework picture"
              className="max-h-80 w-full rounded-[var(--radius)] bg-sunken object-contain"
            />
            {!finished && (
              <div className="flex flex-wrap gap-2">
                {canDraw && (
                  <button onClick={() => void draw()} disabled={busy !== null} className="btn btn-ghost btn-sm">
                    Draw new ones
                  </button>
                )}
                <label htmlFor={`hw-file-${lesson.id}`} className="btn btn-ghost btn-sm cursor-pointer">
                  {busy === "upload" ? "Uploading…" : "Upload my own"}
                </label>
              </div>
            )}
          </div>
        ) : canDraw ? (
          <div className="space-y-2">
            <button
              onClick={() => void draw()}
              disabled={busy !== null}
              className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-[1.5px] border-dashed border-accent bg-accent-soft font-semibold text-accent"
            >
              <SparkIcon />
              Draw {styleName} pictures
              <span className="t-small font-normal t-muted">
                Three options from this lesson - you pick one
              </span>
            </button>
            <label htmlFor={`hw-file-${lesson.id}`} className="btn btn-ghost btn-sm cursor-pointer">
              {busy === "upload" ? "Uploading…" : "or upload my own picture"}
            </label>
          </div>
        ) : (
          <label
            htmlFor={`hw-file-${lesson.id}`}
            className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-[1.5px] border-dashed border-line-strong bg-[#fafbfc] font-semibold t-muted"
          >
            <ImageIcon size={28} />
            {busy === "upload" ? "Uploading…" : "Add a picture"}
            <span className="t-small font-normal">A scene with something going on</span>
          </label>
        )}

        <div className={homework?.imageFile ? "" : "hidden"}>
          <p className="t-eyebrow mb-2">With the picture</p>
          <ol className="list-decimal space-y-1 pl-5">
            {HOMEWORK_TASKS.map((task) => (
              <li key={task.id}>{task.prompt}</li>
            ))}
            <li>{ADJECTIVES_TASK}</li>
          </ol>
        </div>

        <label className="block">
          <span className="label">Tip for {studentName}</span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            onBlur={() => {
              if (!finished && focus !== (homework?.focus ?? "")) {
                void patch({ focus }, "focus");
              }
            }}
            disabled={finished}
            placeholder="e.g. Tell me what you did yesterday: ate, swam, went."
            className="field"
          />
          {!finished && (
            <span className="hint">
              {studentName} reads this alone, so keep it in their words - no
              grammar terms. Suggested from this lesson; change it freely.
            </span>
          )}
        </label>

        {/* Before anything goes out: the look, and the screen it makes. */}
        {(homework?.imageFile || exercises.length > 0) && (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="t-eyebrow">How {studentName} will see it</p>
            <div className="flex flex-wrap items-center gap-2">
              <GameStylePicker studentId={studentId} value={styleId} />
              <a
                href={`/s/${studentKey}/quest/${lesson.id}`}
                target="_blank"
                rel="noopener"
                className="btn btn-ghost btn-sm"
              >
                Preview
              </a>
            </div>
            <p className="hint">
              Opens {studentName}&rsquo;s screen in this theme. Nothing you tap
              there is saved, and they cannot see it until you send it.
            </p>
          </div>
        )}

        {finished && (
          <button
            onClick={() => setConfirmReopen(true)}
            disabled={busy !== null}
            className="btn btn-quiet btn-block"
          >
            Let {studentName} do it again
          </button>
        )}

        {!finished &&
          (sent ? (
            <button
              onClick={() => void patch({ send: false }, "send")}
              disabled={busy !== null}
              className="btn btn-quiet btn-block"
            >
              Take back
            </button>
          ) : (
            <button
              onClick={() => void patch({ focus, send: true }, "send")}
              // Saving the tip on blur must not swallow this tap: the send
              // carries the tip anyway.
              disabled={
                busy === "upload" ||
                busy === "send" ||
                (!homework?.imageFile && exercises.length === 0)
              }
              className="btn btn-primary btn-lg btn-block"
            >
              {busy === "send" ? "Sending…" : `Send to ${studentName}`}
            </button>
          ))}

        {answers && (
          <div className="space-y-3 border-t border-line pt-4">
            <Answer label={HOMEWORK_TASKS[0].prompt} text={answers.describe} />
            <Answer label={HOMEWORK_TASKS[1].prompt} text={answers.next} />
            <Answer label="Three adjectives" text={answers.adjectives.join(", ")} />
            <p className="t-caption t-muted">
              Handed in {new Date(answers.submittedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {error && <p className="note note-warn">{error}</p>}

      <ConfirmDialog
        open={confirmReopen}
        title={`Let ${studentName} do it again?`}
        body="Their scores and written answers for this homework are cleared, and it goes back to waiting. There is no undo."
        confirmLabel="Clear and hand back"
        cancelLabel="Keep it as it is"
        onConfirm={() => {
          setConfirmReopen(false);
          void patch({ reopen: true }, "reopen");
        }}
        onCancel={() => setConfirmReopen(false)}
      />
    </section>
  );
}

function Answer({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="t-small t-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}
