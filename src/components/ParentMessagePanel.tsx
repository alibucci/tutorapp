"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon } from "@/components/ui";
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
  const [tab, setTab] = useState<"zh" | "en">("zh");

  if (!message) return null;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
      // Copying is the closest thing to "sent"; it clears the home to-do.
      if (!message?.copiedAt) {
        void fetch(`/api/lessons/${lesson.id}/parent-message`, { method: "PATCH" }).then(
          () => router.refresh(),
        );
      }
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

  const text = tab === "zh" ? message.zh : message.en;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="t-title">Message to the parent</h2>
        {message.copiedAt && <span className="tag tag-done">Copied</span>}
      </div>

      <div className="card overflow-hidden">
        <div role="tablist" aria-label="Language" className="grid grid-cols-2 border-b border-line">
          {(
            [
              ["zh", "中文 · WeChat"],
              ["en", "English · edit"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setEditing(false);
              }}
              className={`min-h-12 font-semibold ${
                tab === id
                  ? "bg-surface shadow-[inset_0_-3px_0_var(--accent)]"
                  : "bg-[#fafbfc] t-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-5">
          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="field"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void save()}
                  disabled={busy || !draft.trim()}
                  className="btn btn-primary flex-1"
                >
                  {busy ? "Translating…" : "Save and translate"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  className="btn btn-quiet"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p
                lang={tab === "zh" ? "zh" : "en"}
                className={`whitespace-pre-wrap ${tab === "zh" ? "text-[1.0625rem] leading-[1.75]" : ""}`}
              >
                {text}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void copy(tab, text)}
                  className="btn btn-primary btn-lg flex-1"
                >
                  <CopyIcon />
                  {copied === tab ? "Copied" : tab === "zh" ? "Copy for WeChat" : "Copy English"}
                </button>
                {tab === "en" && (
                  <button
                    onClick={() => {
                      setDraft(message.en);
                      setEditing(true);
                    }}
                    className="btn btn-quiet btn-lg"
                  >
                    Edit
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="t-small t-muted">
        To change it, edit the English. The Chinese is translated again from it.
      </p>
      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}
