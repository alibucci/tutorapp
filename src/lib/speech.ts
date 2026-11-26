import { recordUsage } from "./usage";

/**
 * The one place the app turns speech into text, called from the server.
 *
 * Two providers, chosen by which key the server has: Deepgram (Nova-3) when
 * DEEPGRAM_API_KEY is set, otherwise Alibaba Model Studio (Qwen3-ASR). Qwen is
 * reported to be the stronger on Mandarin and keeps the audio with a Chinese
 * provider; Deepgram is the one that needed no account verification.
 *
 * It used to be the browser's own recogniser, which made the browser the
 * deciding factor: Chrome sends audio to Google (unreachable from mainland
 * China), Safari to Apple, and Arc, Brave and other Chromium builds to nobody.
 * Recording in the browser and recognising here works the same everywhere.
 *
 * The audio is held in memory for the length of one request and never written
 * anywhere. Swapping providers means rewriting this file and nothing else.
 */

const DEEPGRAM_KEY = () => process.env.DEEPGRAM_API_KEY ?? "";

const KEY = () => process.env.DASHSCOPE_API_KEY ?? "";
const BASE = () =>
  (process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com").replace(/\/+$/, "");
export const ASR_MODEL = process.env.DASHSCOPE_ASR_MODEL ?? "qwen3-asr-flash";

/**
 * One clip is one piece of a lesson, one debrief answer or one microphone
 * check: compressed, about 4 KB a second, or 16 kHz WAV at 32 KB a second when
 * it has to be. This allows over a minute of WAV - far more than a piece lasts.
 */
export const MAX_CLIP_BYTES = 2.5 * 1024 * 1024;

export function canTranscribe(): boolean {
  return DEEPGRAM_KEY().length > 0 || KEY().length > 0;
}

export class TranscribeError extends Error {
  constructor(
    message: string,
    /** The provider's own HTTP status, when it answered at all. */
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Whether the provider takes the browser's own compressed audio - AAC from
 * Safari, Opus from Chrome - as it comes. Deepgram does, and it is seven or
 * eight times smaller than WAV, which is what lets a lesson through a slow
 * mobile connection at all. Qwen gets WAV.
 */
export function acceptsCompressed(): boolean {
  return DEEPGRAM_KEY().length > 0;
}

/** BCP-47 tag from the lesson to the model's own code. */
function languageCode(tag: string): string | undefined {
  const code = tag.split("-")[0].toLowerCase();
  return code === "en" || code === "zh" ? code : undefined;
}

type AsrResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string; code?: string };
  code?: string;
  message?: string;
  usage?: { seconds?: number };
};

/**
 * How long a clip is, near enough for the usage log, without decoding it.
 * WAV says its own byte rate; compressed audio runs at about 4 KB a second.
 */
export function clipSeconds(audio: Uint8Array, mimeType: string): number {
  if (mimeType === "audio/wav" && audio.byteLength > 44) {
    const byteRate = new DataView(audio.buffer, audio.byteOffset, audio.byteLength).getUint32(28, true);
    if (byteRate > 0) return (audio.byteLength - 44) / byteRate;
  }
  return audio.byteLength / 4000;
}

/** Put one recognition down: billed by the second, and only when it worked. */
function meter(provider: "deepgram" | "dashscope", model: string, seconds: number, ok: boolean): void {
  recordUsage({
    provider,
    model,
    meter: "audio_seconds",
    units: ok ? Math.round(seconds * 10) / 10 : 0,
    ok,
    purpose: "speech",
  });
}

/** Text of one short recording. Empty when nothing was said. */
export async function transcribe(
  audio: Uint8Array,
  mimeType: string,
  languageTag: string,
): Promise<string> {
  return DEEPGRAM_KEY()
    ? transcribeDeepgram(audio, mimeType, languageTag)
    : transcribeQwen(audio, mimeType, languageTag);
}

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: { alternatives?: { transcript?: string }[] }[];
    utterances?: { start?: number; transcript?: string }[];
  };
  err_msg?: string;
};

export type SpokenLine = {
  /** ms from the start of the recording. */
  at: number;
  text: string;
};

/**
 * One recording as separate lines, split at the pauses. In a group lesson a
 * single clip can hold a question and two children answering; a line per
 * sentence is what lets each one be credited to someone.
 */
export async function transcribeLines(
  audio: Uint8Array,
  mimeType: string,
  languageTag: string,
): Promise<SpokenLine[]> {
  if (DEEPGRAM_KEY()) {
    const body = await askDeepgram(audio, mimeType, languageTag, { utterances: "true" });
    return (body.results?.utterances ?? [])
      .map((u) => ({ at: Math.round((u.start ?? 0) * 1000), text: (u.transcript ?? "").trim() }))
      .filter((line) => line.text);
  }
  const text = await transcribeQwen(audio, mimeType, languageTag);
  return text ? [{ at: 0, text }] : [];
}

/** Deepgram's pre-recorded API: the audio as the body, the text back. */
async function transcribeDeepgram(
  audio: Uint8Array,
  mimeType: string,
  languageTag: string,
): Promise<string> {
  const body = await askDeepgram(audio, mimeType, languageTag);
  return (body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}

async function askDeepgram(
  audio: Uint8Array,
  mimeType: string,
  languageTag: string,
  extra: Record<string, string> = {},
): Promise<DeepgramResponse> {
  const params = new URLSearchParams({ model: "nova-3", language: languageTag, ...extra });
  // Smart formatting writes numbers as digits, which reads well in English
  // but turns 四分之一 into 4分之一 in Chinese. There, punctuation only.
  if (languageTag.startsWith("zh")) params.set("punctuate", "true");
  else params.set("smart_format", "true");

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${DEEPGRAM_KEY()}`, "Content-Type": mimeType },
    body: audio as BodyInit,
    signal: AbortSignal.timeout(60_000),
  }).catch((e: unknown) => {
    meter("deepgram", "nova-3", 0, false);
    throw e;
  });
  const body = (await res.json().catch(() => ({}))) as DeepgramResponse;
  meter("deepgram", "nova-3", body.metadata?.duration ?? clipSeconds(audio, mimeType), res.ok);
  if (!res.ok) {
    throw new TranscribeError(
      `Speech service error (${res.status}): ${body.err_msg ?? "request failed"}`,
      res.status,
    );
  }
  return body;
}

async function transcribeQwen(
  audio: Uint8Array,
  mimeType: string,
  languageTag: string,
): Promise<string> {
  const language = languageCode(languageTag);
  const res = await fetch(`${BASE()}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ASR_MODEL,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: `data:${mimeType};base64,${Buffer.from(audio).toString("base64")}`,
              },
            },
          ],
        },
      ],
      // Telling it the language beats letting it guess on a ten-second clip.
      // ITN writes "three quarters" as "3/4", which is what a tutor would type.
      asr_options: { enable_itn: true, ...(language && { language }) },
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e: unknown) => {
    meter("dashscope", ASR_MODEL, 0, false);
    throw e;
  });
  const body = (await res.json().catch(() => ({}))) as AsrResponse;
  meter("dashscope", ASR_MODEL, body.usage?.seconds ?? clipSeconds(audio, mimeType), res.ok);
  if (!res.ok) {
    const code = body.error?.code ?? body.code ?? String(res.status);
    const message = body.error?.message ?? body.message ?? "request failed";
    throw new TranscribeError(`Speech service error (${code}): ${message}`, res.status);
  }
  return (body.choices?.[0]?.message?.content ?? "").trim();
}
