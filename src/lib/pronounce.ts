import { createHash, randomUUID } from "crypto";
import type { Pronounced, PronouncedWord } from "./types";

/**
 * Pronunciation scoring by SpeechSuper (api.speechsuper.com).
 *
 * The learner reads a known line; the service compares the recording with it
 * sound by sound. From our server in Hong Kong the request is answered in
 * Hong Kong too.
 *
 * Nothing about the learner goes with it: not their name, not an id - the
 * service gets the line and the sound, and a fixed user id. The audio lives in
 * memory for the length of the request and is never written anywhere.
 */

const BASE_URL = "https://api.speechsuper.com";
const CORE = "sent.eval.promax";
/** A sentence takes one to three seconds; this is a stalled connection. */
const TIMEOUT_MS = 25_000;
/** Below this a sound counts as wrong. */
const WEAK_SOUND = 60;

export class PronounceError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const keys = () => ({
  app: process.env.SPEECHSUPER_APP_KEY ?? "",
  secret: process.env.SPEECHSUPER_SECRET_KEY ?? "",
});

/** Without both keys the feature does not exist anywhere in the app. */
export function canScoreVoice(): boolean {
  const { app, secret } = keys();
  return app.length > 0 && secret.length > 0;
}

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

type Phone = { phoneme?: string; pronunciation?: number; sound_like?: string };
type Word = { word?: string; scores?: { overall?: number }; phonemes?: Phone[] };
type Reply = {
  result?: {
    overall?: number;
    pronunciation?: number;
    fluency?: number;
    rhythm?: number;
    integrity?: number;
    words?: Word[];
  };
  error?: string;
  errId?: number;
};

/** Score one line read aloud. `wav` is 16 kHz mono WAV. */
export async function scoreLine(wav: Uint8Array, line: string): Promise<Pronounced> {
  const { app, secret } = keys();
  if (!app || !secret) throw new PronounceError("Pronunciation checks are switched off.", 503);

  const timestamp = String(Math.floor(Date.now() / 1000));
  // A fixed id: the service has no reason to tell one learner from another.
  const userId = "aloudli";
  const text = {
    connect: {
      cmd: "connect",
      param: {
        sdk: { version: 16777472, source: 9, protocol: 2 },
        app: { applicationId: app, sig: sha1(app + timestamp + secret), timestamp },
      },
    },
    start: {
      cmd: "start",
      param: {
        app: {
          userId,
          applicationId: app,
          timestamp,
          sig: sha1(app + timestamp + userId + secret),
        },
        audio: { audioType: "wav", channel: 1, sampleBytes: 2, sampleRate: 16000 },
        request: { coreType: CORE, refText: line, dict_type: "IPA88", tokenId: randomUUID() },
      },
    },
  };

  const form = new FormData();
  form.append("text", JSON.stringify(text));
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio");

  let reply: Reply;
  try {
    const res = await fetch(`${BASE_URL}/${CORE}`, {
      method: "POST",
      headers: { "Request-Index": "0" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    reply = (await res.json()) as Reply;
    if (!res.ok && !reply.result) {
      throw new PronounceError(
        res.status === 429 ? "Too many checks at once - try again in a moment." : "The pronunciation check failed. Try again.",
        res.status === 429 ? 503 : 502,
      );
    }
  } catch (e) {
    if (e instanceof PronounceError) throw e;
    throw new PronounceError("Could not reach the pronunciation check. Try again.");
  }

  const r = reply.result;
  if (!r || typeof r.overall !== "number") {
    console.error("[pronounce]", reply.errId ?? "", reply.error ?? "no result");
    throw new PronounceError("The pronunciation check failed. Try again.");
  }

  return {
    overall: r.overall,
    pronunciation: r.pronunciation ?? r.overall,
    fluency: r.fluency ?? 0,
    rhythm: r.rhythm ?? 0,
    complete: r.integrity ?? 100,
    words: (r.words ?? []).map(toWord),
    at: new Date().toISOString(),
  };
}

function toWord(w: Word): PronouncedWord {
  const phones = w.phonemes ?? [];
  // "-" is the service's mark for a sound it did not hear at all.
  const missed = phones.length > 0 && phones.every((p) => p.sound_like === "-");
  const sounds = phones
    .filter((p) => (p.pronunciation ?? 100) < WEAK_SOUND && p.phoneme)
    .map((p) => ({
      sound: p.phoneme!,
      heard: p.sound_like && p.sound_like !== "-" && p.sound_like !== p.phoneme ? p.sound_like : undefined,
    }));
  return {
    word: w.word ?? "",
    score: w.scores?.overall ?? 0,
    ...(missed ? { missed: true } : {}),
    ...(!missed && sounds.length ? { sounds } : {}),
  };
}
