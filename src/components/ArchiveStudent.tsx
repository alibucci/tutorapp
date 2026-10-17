"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";

/**
 * Archive a child the tutor no longer teaches, or bring them back.
 *
 * Archiving deletes nothing. It takes the child off the list and shuts every
 * door the family had - links, sign-in, open sessions - which is what a tutor
 * means by "remove" almost every time, without the part that cannot be undone.
 */
export function ArchiveStudent({
  studentId,
  studentName,
  archived,
}: {
  studentId: string;
  studentName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(archive: boolean) {
    setConfirming(false);
    setBusy(true);
    setError(null);
    const result = await api(`/api/students/${studentId}`, {
      method: "PATCH",
      json: { archived: archive },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (archive) router.push("/");
    else router.refresh();
  }

  if (archived) {
    return (
      <div className="note note-warn space-y-2">
        <p>
          {studentName} is archived. Their links and sign-in do not work, and they
          are not on your list. Lessons and homework are all still here.
        </p>
        <button onClick={() => void change(false)} disabled={busy} className="btn btn-quiet">
          {busy ? "Restoring…" : "Restore"}
        </button>
        {error && <p>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setConfirming(true)} disabled={busy} className="btn btn-quiet">
        {busy ? "Archiving…" : "Archive student"}
      </button>
      {error && <p className="note note-warn mt-2">{error}</p>}
      <ConfirmDialog
        open={confirming}
        title={`Archive ${studentName}?`}
        body={`${studentName} leaves your list, and their private links and family sign-in stop working on every phone. Nothing is deleted - you can restore them from the bottom of your home page.`}
        confirmLabel="Archive"
        cancelLabel="Keep"
        onConfirm={() => void change(true)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
