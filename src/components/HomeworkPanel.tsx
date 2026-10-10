"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
  const bitmap = await createImageBitmap(file);
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
}: {
  lesson: Lesson;
  studentName: string;
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

  async function patch(payload: { focus?: string; send?: boolean }, label: string) {
    setBusy(label);
    setError(null);
    const res = await fetch(`/api/lessons/${lesson.id}/homework`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <section id="homework" className="space-y-3 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-subtitle">Homework</h2>
        <span className="t-caption t-muted">
          {answers
            ? "handed in"
            : sent
              ? `sent to ${studentName} · waiting`
              : "not sent yet"}
        </span>
      </div>

      <div className="card p-5 space-y-5">
        <div>
          <p className="t-eyebrow">Picture</p>
          {homework?.imageFile ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private, per-lesson upload; nothing to optimise
            <img
              src={`/api/lessons/${lesson.id}/homework/image?f=${homework.imageFile}`}
              alt="Homework picture"
              className="mt-2 w-full max-h-80 rounded-[var(--radius)] object-contain bg-sunken"
            />
          ) : (
            <p className="mt-2 t-small t-muted">
              Pick a picture the student will describe - a scene with something
              going on works best.
            </p>
          )}
          {!answers && (
            <>
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
              <label
                htmlFor={`hw-file-${lesson.id}`}
                className="btn btn-quiet btn-sm mt-3 inline-flex cursor-pointer"
              >
                {busy === "upload"
                  ? "Uploading…"
                  : homework?.imageFile
                    ? "Replace picture"
                    : "Add picture"}
              </label>
            </>
          )}
        </div>

        <div>
          <p className="t-eyebrow">Tasks</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 t-small">
            {HOMEWORK_TASKS.map((task) => (
              <li key={task.id}>{task.prompt}</li>
            ))}
            <li>{ADJECTIVES_TASK}</li>
          </ol>
        </div>

        <label className="block">
          <span className="t-eyebrow">Focus for {studentName}</span>
          <input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            onBlur={() => {
              if (!answers && focus !== (homework?.focus ?? "")) {
                void patch({ focus }, "focus");
              }
            }}
            disabled={Boolean(answers)}
            placeholder="e.g. Use the past tense: ate, swam, stabbed."
            className="field mt-2"
          />
          <span className="hint">
            Shown above the tasks. Suggested from this lesson; change it freely.
          </span>
        </label>

        {!answers && (
          <div className="flex flex-wrap gap-2">
            {sent ? (
              <button
                onClick={() => void patch({ send: false }, "send")}
                disabled={busy !== null}
                className="btn btn-quiet btn-sm"
              >
                Take back
              </button>
            ) : (
              <button
                onClick={() => void patch({ focus, send: true }, "send")}
                disabled={busy !== null || !homework?.imageFile}
                className="btn btn-primary"
              >
                {busy === "send" ? "Sending…" : `Send to ${studentName}`}
              </button>
            )}
          </div>
        )}

        {answers && (
          <div className="border-t border-line pt-4 space-y-3 t-small">
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
      <p className="t-caption t-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
