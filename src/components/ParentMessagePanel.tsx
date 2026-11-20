"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CopyIcon } from "@/components/ui";
import { parentLinkLine } from "@/lib/parentLines";
import type { Lesson } from "@/lib/types";

/**
 * The message the tutor pastes into WeChat.
 *
 * Chinese first, because that is what gets sent. The English underneath is the
 * source: the tutor edits that, and the Chinese is translated from it again, so
 * the tutor never has to write or check Chinese by hand.
 *
 * The link to the parent's page is added only as it is copied, never stored:
 * a new pair of links would leave a stored one dead.
 */
export function ParentMessagePanel({
  lesson,
  parentLink,
}: {
  lesson: Lesson;
  /** Absent when the child has no working parent link (adult, archived). */
  parentLink?: { key: string; ready: boolean };
}) {
  const router = useRouter();
  const message = lesson.parentMessage;
  const [draft, setDraft] = useState(message?.en ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"zh" | "en">("zh");
  // On when the page has something to show: an approved weekly note.
  const [withLink, setWithLink] = useState(Boolean(parentLink?.ready));

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
    const result = await api(
      `/api/lessons/${lesson.id}/parent-message`,
      { method: "PUT", json: { en: draft } },
      "Could not save the message.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const text = tab === "zh" ? message.zh : message.en;
  const addLink = Boolean(parentLink?.ready && withLink);

  function withLinkLine(body: string): string {
    if (!addLink || !parentLink) return body;
    const line = parentLinkLine(`${window.location.origin}/p/${parentLink.key}`);
    return `${body.trim()}\n\n${tab === "zh" ? line.zh : line.en}`;
  }
  // The child's words, still in the message: the speaker was labelled by a
  // model, so the tutor is asked to check them.
  const quoteShown = Boolean(message.quote && message.en.includes(message.quote));

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
              {tab === "en" && quoteShown && (
                <p className="t-small t-muted">
                  Check that this was said by the child. You can delete the line.
                </p>
              )}
              {parentLink && (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={addLink}
                    disabled={!parentLink.ready}
                    onChange={(e) => setWithLink(e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-medium">Add the link to the parent page</span>
                    <span className="hint">
                      {parentLink.ready
                        ? "Added at the end as you copy it."
                        : "The page has nothing to show yet."}
                    </span>
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => void copy(tab, withLinkLine(text))}
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
