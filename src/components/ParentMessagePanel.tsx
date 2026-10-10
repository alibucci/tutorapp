"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lesson } from "@/lib/types";

/**
 * The message the tutor pastes into WeChat.
 *
 * Chinese first, because that is what gets sent. The English underneath is the
 * source: the tutor edits that, and the Chinese is translated from it again, so
 * the tutor never has to write or check Chinese by hand.
 */
export function ParentMessagePanel({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const message = lesson.parentMessage;
  const [draft, setDraft] = useState(message?.en ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (!message) return null;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lessons/${lesson.id}/parent-message`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ en: draft }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not save the message.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-subtitle">Message to the parent</h2>
        <button
          onClick={() => void copy("zh", message.zh)}
          className="btn btn-primary btn-sm"
        >
          {copied === "zh" ? "Copied" : "Copy Chinese"}
        </button>
      </div>

      <div className="card card-focus p-5">
        <p className="t-eyebrow">中文 · for WeChat</p>
        <p className="t-body mt-2 whitespace-pre-wrap">{message.zh}</p>
      </div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between gap-4">
          <p className="t-eyebrow">English · the source</p>
          {!editing && (
            <span className="flex gap-2">
              <button
                onClick={() => void copy("en", message.en)}
                className="btn btn-quiet btn-sm"
              >
                {copied === "en" ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => {
                  setDraft(message.en);
                  setEditing(true);
                }}
                className="btn btn-quiet btn-sm"
              >
                Edit
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              className="field mt-2"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void save()}
                disabled={busy || !draft.trim()}
                className="btn btn-primary btn-sm"
              >
                {busy ? "Translating…" : "Save and translate"}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="btn btn-quiet btn-sm"
              >
                Cancel
              </button>
            </div>
            <p className="hint">The Chinese above is rewritten from this.</p>
          </>
        ) : (
          <p className="t-small mt-2 whitespace-pre-wrap">{message.en}</p>
        )}
      </div>

      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}
