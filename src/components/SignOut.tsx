"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut({
  name,
  accountHref,
}: {
  name: string;
  accountHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {accountHref && (
        <Link
          href={accountHref}
          aria-label={`Your account: ${name}`}
          className="grid h-9 w-9 place-items-center rounded-full bg-[#e9ecf1] text-sm font-semibold"
        >
          {name.trim().charAt(0).toUpperCase()}
        </Link>
      )}
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
