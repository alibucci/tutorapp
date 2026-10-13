"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = { linked: boolean; name?: string; expired?: boolean };

/**
 * Connecting Telegram in two taps: press the button, press Start in Telegram.
 *
 * The tutor never types a code or an id. While they are away in the app, this
 * page keeps asking the server whether anyone has pressed Start with our
 * code, and stops as soon as someone has.
 */
export function TelegramConnect({ connectedTo }: { connectedTo?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<number | null>(null);

  // Stop asking when the component goes away, or we would poll for ever.
  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    const result = await api<{ url: string }>("/api/account/telegram", { method: "POST" });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUrl(result.data.url);
    setWaiting(true);
    window.open(result.data.url, "_blank", "noopener");

    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => void poll(), 2500);
  }

  async function poll() {
    const result = await api<Status>("/api/account/telegram");
    if (!result.ok) return;
    if (result.data.linked) {
      if (timer.current) window.clearInterval(timer.current);
      setWaiting(false);
      router.refresh();
      return;
    }
    if (result.data.expired) {
      if (timer.current) window.clearInterval(timer.current);
      setWaiting(false);
      setError("That link ran out. Press connect again.");
    }
  }

  async function disconnect() {
    setBusy(true);
    await api("/api/account/telegram", { method: "DELETE" });
    setBusy(false);
    setUrl(null);
    router.refresh();
  }

  if (connectedTo) {
    return (
      <section className="card card-pad space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-semibold">Telegram</span>
            <span className="block t-small t-muted">Sending to {connectedTo}</span>
          </span>
          <span className="tag tag-done">On</span>
        </div>
        <p className="t-small t-muted">
          You get a message when a child finishes their homework, and when one
          struggles badly enough to be worth a second look.
        </p>
        <button onClick={() => void disconnect()} disabled={busy} className="btn btn-quiet btn-sm">
          Disconnect
        </button>
      </section>
    );
  }

  return (
    <section className="card card-pad space-y-3">
      <div>
        <p className="font-semibold">Telegram</p>
        <p className="t-small t-muted mt-1">
          Get a message when a child finishes their homework. Press the button,
          then press Start in Telegram - that is all.
        </p>
      </div>

      {waiting ? (
        <>
          <p className="note note-accent">
            Waiting for you to press Start in Telegram…
          </p>
          {url && (
            <a href={url} target="_blank" rel="noopener" className="btn btn-quiet btn-sm">
              Open Telegram again
            </a>
          )}
        </>
      ) : (
        <button onClick={() => void connect()} disabled={busy} className="btn btn-primary">
          {busy ? "Preparing…" : "Connect Telegram"}
        </button>
      )}

      {error && <p className="note note-warn">{error}</p>}
      <p className="hint">
        Telegram is blocked in mainland China: the message is always sent and
        waits for you, but you need a VPN to read it.
      </p>
    </section>
  );
}
