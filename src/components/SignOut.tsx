"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="t-small t-muted hidden sm:inline">{name}</span>
      <button
        onClick={() => void out()}
        disabled={busy}
        className="btn btn-ghost btn-sm"
      >
        Sign out
      </button>
    </div>
  );
}
