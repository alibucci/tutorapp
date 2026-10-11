"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "@/components/ui";
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
  studentName,
  styleName,
  canDraw,
}: {
  lesson: Lesson;
  studentName: string;
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
  const [seconds, setSeconds] = useState(0);

  // Drawing takes from a few seconds to a minute or two; count it out loud.
  useEffect(() => {
    if (busy !== "draw") return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

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
    payload: { focus?: string; send?: boolean; pick?: string },
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
        <span className={`tag ${answers ? "tag-done" : sent ? "tag-info" : "tag-warn"}`}>
          {answers ? "Handed in" : sent ? "Sent · waiting" : "Not sent"}
        </span>
      </div>

      <div className="card space-y-5 p-5">
        {!answers && (
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

        {busy === "draw" ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-[var(--radius)] bg-accent-soft text-center">
            <SparkIcon />
            <span className="font-semibold">Drawing {styleName} pictures… {seconds}s</span>
            <span className="t-small t-muted px-6">
              Usually under a minute. You can leave this page - they will be here
              when you come back.
            </span>
          </div>
        ) : candidates.length > 0 && !answers ? (
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
            {!answers && (
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

        <ol className="list-decimal space-y-1 pl-5">
          {HOMEWORK_TASKS.map((task) => (
            <li key={task.id}>{task.prompt}</li>
          ))}
          <li>{ADJECTIVES_TASK}</li>
        </ol>

        <label className="block">
          <span className="label">Tip for {studentName}</span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            onBlur={() => {
              if (!answers && focus !== (homework?.focus ?? "")) {
                void patch({ focus }, "focus");
              }
            }}
            disabled={Boolean(answers)}
            placeholder="e.g. Use the past tense: ate, swam, went."
            className="field"
          />
          {!answers && (
            <span className="hint">Suggested from this lesson. Change it freely.</span>
          )}
        </label>

        {!answers &&
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
              disabled={busy === "upload" || busy === "send" || !homework?.imageFile}
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
