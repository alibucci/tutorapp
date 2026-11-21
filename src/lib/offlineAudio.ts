"use client";

/**
 * Pieces of a lesson that could not be sent, kept on this device until they
 * can be.
 *
 * The one exception to "audio is never stored", agreed on 20 Nov 2026: with no
 * internet where the lesson is, a recording would otherwise be lost. So:
 * - only in this browser (IndexedDB), never on our server;
 * - only pieces of a lesson whose transcript is allowed at all (consent);
 * - at most 3 hours of audio and 7 days old - older pieces are deleted;
 * - each piece is deleted the moment its text has come back.
 * Also kept here: the end of a lesson that could not be saved, so it can be
 * saved once the internet is back.
 */

export const MAX_KEEP_MS = 3 * 60 * 60_000;
export const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export type StoredPiece = {
  id?: number;
  lessonId: string;
  language: string;
  /** A group lesson: ask for each sentence separately. */
  lines: boolean;
  /** Lesson time the piece began, ms. */
  t: number;
  tag?: string;
  /** Length of the piece, ms: what the 3-hour cap counts. */
  ms: number;
  blob: Blob;
  savedAt: number;
};

export type StoredEnd = {
  lessonId: string;
  title: string;
  /** Text already back from earlier pieces, not yet saved on the server. */
  transcript?: { t: number; text: string; tag?: string }[];
  endedAt: string;
  recordedMs?: number;
  interruptions: unknown[];
  savedAt: number;
};

const DB = "aloudli-offline";
const PIECES = "pieces";
const ENDS = "ends";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No storage on this device."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PIECES)) {
        db.createObjectStore(PIECES, { keyPath: "id", autoIncrement: true }).createIndex("lessonId", "lessonId");
      }
      if (!db.objectStoreNames.contains(ENDS)) db.createObjectStore(ENDS, { keyPath: "lessonId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Storage refused."));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Storage failed."));
    });
  } finally {
    db.close();
  }
}

/** Everything kept, oldest pieces deleted first (past 7 days). */
export async function listPieces(lessonId?: string): Promise<StoredPiece[]> {
  const all = await run<StoredPiece[]>(PIECES, "readonly", (s) => s.getAll());
  const now = Date.now();
  const old = all.filter((p) => now - p.savedAt > MAX_AGE_MS);
  await Promise.all(old.map((p) => deletePiece(p.id!)));
  return all.filter((p) => now - p.savedAt <= MAX_AGE_MS && (!lessonId || p.lessonId === lessonId));
}

/**
 * Keep a piece. Null when it cannot be kept: no storage on this device, or
 * three hours of audio are already waiting.
 */
export async function savePiece(piece: Omit<StoredPiece, "id" | "savedAt">): Promise<number | null> {
  try {
    const kept = await listPieces();
    const ms = kept.reduce((sum, p) => sum + p.ms, 0);
    if (ms + piece.ms > MAX_KEEP_MS) return null;
    const id = await run<IDBValidKey>(PIECES, "readwrite", (s) => s.add({ ...piece, savedAt: Date.now() }));
    return Number(id);
  } catch {
    return null;
  }
}

export async function deletePiece(id: number): Promise<void> {
  await run(PIECES, "readwrite", (s) => s.delete(id)).catch(() => {});
}

export async function saveEnd(end: Omit<StoredEnd, "savedAt">): Promise<boolean> {
  try {
    await run(ENDS, "readwrite", (s) => s.put({ ...end, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export async function listEnds(): Promise<StoredEnd[]> {
  const all = await run<StoredEnd[]>(ENDS, "readonly", (s) => s.getAll()).catch(() => [] as StoredEnd[]);
  const now = Date.now();
  for (const e of all.filter((x) => now - x.savedAt > MAX_AGE_MS)) await deleteEnd(e.lessonId);
  return all.filter((x) => now - x.savedAt <= MAX_AGE_MS);
}

export async function deleteEnd(lessonId: string): Promise<void> {
  await run(ENDS, "readwrite", (s) => s.delete(lessonId)).catch(() => {});
}

/** What is waiting on this device, for the tutor to see. */
export async function waiting(): Promise<{ lessons: number; pieces: number; ms: number }> {
  try {
    const [pieces, ends] = await Promise.all([listPieces(), listEnds()]);
    const lessons = new Set([...pieces.map((p) => p.lessonId), ...ends.map((e) => e.lessonId)]);
    return { lessons: lessons.size, pieces: pieces.length, ms: pieces.reduce((s, p) => s + p.ms, 0) };
  } catch {
    return { lessons: 0, pieces: 0, ms: 0 };
  }
}

// ---------------------------------------------------------------------------
// The recorder page holds its own lesson: background sending leaves it alone.
// ---------------------------------------------------------------------------

const liveKey = (lessonId: string) => `aloudli-live:${lessonId}`;

export function markLive(lessonId: string): void {
  try {
    window.localStorage.setItem(liveKey(lessonId), String(Date.now()));
  } catch {
    // no storage: the background sender may then duplicate nothing - it merges
  }
}

export function clearLive(lessonId: string): void {
  try {
    window.localStorage.removeItem(liveKey(lessonId));
  } catch {
    // nothing to clear
  }
}

export function isLiveElsewhere(lessonId: string): boolean {
  try {
    const at = Number(window.localStorage.getItem(liveKey(lessonId)) ?? 0);
    return Date.now() - at < 15_000;
  } catch {
    return false;
  }
}
