"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { GROUP_MAX, GROUP_MIN, GROUP_NAME_MAX } from "@/lib/groupRules";
import type { StudentGroup } from "@/lib/types";

type Kid = { id: string; name: string };

/** Make, rename, change and archive saved groups. */
export function GroupsManager({ groups, students }: { groups: StudentGroup[]; students: Kid[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(groups.length ? null : "new");
  const [showArchived, setShowArchived] = useState(false);
  const live = groups.filter((g) => !g.archivedAt);
  const archived = groups.filter((g) => g.archivedAt);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? "(archived child)";

  if (students.length < GROUP_MIN) {
    return <p className="note note-quiet">A group needs at least {GROUP_MIN} children on your list.</p>;
  }

  return (
    <div className="stack">
      {live.length > 0 && (
        <ul className="card rows">
          {live.map((g) =>
            editing === g.id ? (
              <li key={g.id} className="p-4">
                <GroupForm
                  group={g}
                  students={students}
                  onDone={() => {
                    setEditing(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={g.id} className="row py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{g.name}</span>
                  <span className="block t-small t-muted">
                    {g.studentIds.map(nameOf).join(", ")}
                  </span>
                  {g.studentIds.length < GROUP_MIN && (
                    <span className="tag tag-warn mt-1">
                      Only {g.studentIds.length} left - add a child to use it again
                    </span>
                  )}
                </span>
                <button className="btn btn-quiet btn-sm" onClick={() => setEditing(g.id)}>
                  Change
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {editing === "new" ? (
        <div className="card card-pad">
          <GroupForm
            students={students}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
            onCancel={live.length ? () => setEditing(null) : undefined}
          />
        </div>
      ) : (
        <button className="btn btn-primary self-start" onClick={() => setEditing("new")}>
          New group
        </button>
      )}

      {archived.length > 0 && (
        <div className="stack-sm">
          <button className="btn btn-ghost btn-sm self-start" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived groups" : `Archived groups (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="card rows">
              {archived.map((g) => (
                <li key={g.id} className="row py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{g.name}</span>
                    <span className="block t-small t-muted">{g.studentIds.map(nameOf).join(", ")}</span>
                  </span>
                  <RestoreButton id={g.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RestoreButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-quiet btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/api/groups/${id}`, { method: "PATCH", json: { archived: false } });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Restoring…" : "Restore"}
    </button>
  );
}

function GroupForm({
  group,
  students,
  onDone,
  onCancel,
}: {
  group?: StudentGroup;
  students: Kid[];
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [ids, setIds] = useState<string[]>(
    (group?.studentIds ?? []).filter((id) => students.some((s) => s.id === id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooFew = ids.length < GROUP_MIN;
  const tooMany = ids.length > GROUP_MAX;

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const result = await api(group ? `/api/groups/${group.id}` : "/api/groups", {
      method: group ? "PATCH" : "POST",
      json: body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ name, studentIds: ids });
      }}
    >
      <label className="block">
        <span className="label">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={GROUP_NAME_MAX}
          placeholder="Tuesday, little ones"
          required
          className="field"
        />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="label">
          Children ({GROUP_MIN} to {GROUP_MAX})
        </legend>
        {students.map((s) => (
          <label key={s.id} className="flex items-center gap-2 t-small">
            <input
              type="checkbox"
              checked={ids.includes(s.id)}
              onChange={(e) =>
                setIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
              }
            />
            {s.name}
          </label>
        ))}
      </fieldset>
      {tooMany && <p className="note note-warn">At most {GROUP_MAX} children in a group.</p>}
      {error && <p className="note note-warn">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy || tooFew || tooMany || !name.trim()}>
          {busy ? "Saving…" : group ? "Save" : "Make the group"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {group && (
          <button
            type="button"
            className="btn btn-ghost ml-auto"
            disabled={busy}
            onClick={() => void save({ archived: true })}
          >
            Archive group
          </button>
        )}
      </div>
    </form>
  );
}
