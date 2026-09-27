"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Stands between a single tap and the end of a lesson.
 *
 * Cancel takes focus, not confirm, so a stray Enter or a double tap lands on
 * the harmless option.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="overlay fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      style={{ background: "rgb(21 23 28 / 0.45)" }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="dialog card w-full max-w-sm p-5"
        style={{ boxShadow: "var(--shadow)" }}
      >
        <h2 className="t-subtitle">{title}</h2>
        <p className="t-small t-muted mt-2">{body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} onClick={onCancel} className="btn btn-quiet">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="btn btn-primary">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
