"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Sentinel = { released: boolean; release(): Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<Sentinel> };
};

/**
 * Keeps the screen awake for the length of a lesson.
 *
 * Without this, a phone locks after its idle timeout and the capture stops
 * (iOS) or becomes unreliable (Android). The system also drops the lock
 * whenever the page is hidden, so it has to be re-taken on every return.
 */
export function useWakeLock() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<Sentinel | null>(null);
  const wantRef = useRef(false);

  const acquire = useCallback(async () => {
    wantRef.current = true;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) {
      setError("This browser cannot hold the screen awake - keep it unlocked.");
      return;
    }
    if (sentinelRef.current && !sentinelRef.current.released) return;

    try {
      const sentinel = await nav.wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setActive(true);
      setError(null);
    } catch (e) {
      setActive(false);
      setError(
        e instanceof Error ? e.message : "Could not keep the screen awake.",
      );
    }
  }, []);

  const release = useCallback(async () => {
    wantRef.current = false;
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    setActive(false);
    if (sentinel && !sentinel.released) await sentinel.release();
  }, []);

  // Coming back from the app switcher or a brief lock leaves the lock gone.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && wantRef.current) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [acquire]);

  useEffect(
    () => () => {
      const sentinel = sentinelRef.current;
      if (sentinel && !sentinel.released) void sentinel.release();
    },
    [],
  );

  const supported =
    typeof navigator !== "undefined" &&
    "wakeLock" in (navigator as WakeLockNavigator);

  return { supported, active, error, acquire, release };
}
