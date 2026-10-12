/**
 * The one place the app asks for a picture to be drawn: Alibaba Model Studio
 * (Wan), reached from the server in its own region. Swapping providers means
 * rewriting this file and nothing else.
 *
 * Drawing is asynchronous on their side: create a task, then ask until it is
 * done. The image comes back as a link that expires after a day, so it is
 * downloaded straight away and kept here.
 */

const KEY = () => process.env.DASHSCOPE_API_KEY ?? "";
const BASE = () =>
  (process.env.DASHSCOPE_BASE_URL ?? "https://dashscope-intl.aliyuncs.com").replace(/\/+$/, "");
export const IMAGE_MODEL = process.env.DASHSCOPE_IMAGE_MODEL ?? "wan2.6-t2i";

/**
 * Drawing is off.
 *
 * It works - see the rest of this file - but homework is built around the
 * practice games now, and the tutor uploads a picture in a few seconds. The
 * code stays because turning it back on is one line, not a rewrite: set
 * HOMEWORK_PICTURE_AI=on and give the server a key. Two switches on purpose,
 * so a key that turns up for something else cannot quietly start spending
 * money here.
 */
export function canDrawPictures(): boolean {
  return process.env.HOMEWORK_PICTURE_AI === "on" && KEY().length > 0;
}

/** Things the picture must never be, whatever the scene says. */
const NEGATIVE =
  "text, letters, words, captions, logos, watermark, signature, violence, blood, weapons, scary, horror, nudity, blurry, distorted faces, extra limbs";

/** wan2.6 speaks a newer, chat-shaped protocol; older models the classic one. */
function usesNewProtocol(model: string): boolean {
  return /^wan2\.[6-9]|^wan[3-9]/.test(model);
}

export type DrawnImage = { data: ArrayBuffer; ext: "png" | "jpg" | "webp" };

export class PictureError extends Error {}

async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY()}`, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(body.code ?? res.status);
    // The service checks prompts and results, and refuses some.
    if (code === "DataInspectionFailed" || code === "IPInfringementSuspect") {
      throw new PictureError("The picture service refused this scene. Draw again for a different one.");
    }
    throw new PictureError(`Picture service error (${code}): ${String(body.message ?? "request failed")}`);
  }
  return body;
}

async function createTask(prompt: string, count: number): Promise<string> {
  const model = IMAGE_MODEL;
  const body = usesNewProtocol(model)
    ? {
        model,
        input: { messages: [{ role: "user", content: [{ text: prompt }] }] },
        parameters: {
          n: count,
          // 4:3, landscape: the picture sits above the text on a phone.
          size: "1472*1104",
          negative_prompt: NEGATIVE,
          prompt_extend: true,
          watermark: false,
        },
      }
    : {
        model,
        input: { prompt, negative_prompt: NEGATIVE },
        parameters: { n: count, size: "1280*960", prompt_extend: true, watermark: false },
      };
  const path = usesNewProtocol(model)
    ? "/api/v1/services/aigc/image-generation/generation"
    : "/api/v1/services/aigc/text2image/image-synthesis";

  const created = await call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DashScope-Async": "enable" },
    body: JSON.stringify(body),
  });
  const id = (created.output as { task_id?: string } | undefined)?.task_id;
  if (!id) throw new PictureError("The picture service did not start the job.");
  return id;
}

/** Every image link in a finished task, whichever protocol produced it. */
function imageLinks(output: Record<string, unknown>): string[] {
  const links: string[] = [];
  const results = output.results as { url?: string }[] | undefined;
  for (const r of results ?? []) if (r.url) links.push(r.url);
  const choices = output.choices as
    | { message?: { content?: { image?: string; type?: string }[] } }[]
    | undefined;
  for (const c of choices ?? []) {
    for (const part of c.message?.content ?? []) if (part.image) links.push(part.image);
  }
  return links;
}

async function waitFor(taskId: string, deadline: number): Promise<string[]> {
  for (;;) {
    const body = await call(`/api/v1/tasks/${taskId}`, { method: "GET" });
    const output = (body.output ?? {}) as Record<string, unknown>;
    const status = String(output.task_status ?? "UNKNOWN");
    if (status === "SUCCEEDED") return imageLinks(output);
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const code = String(output.code ?? "");
      if (code === "DataInspectionFailed" || code === "IPInfringementSuspect") {
        throw new PictureError("The picture service refused this scene. Draw again for a different one.");
      }
      throw new PictureError(`The picture could not be drawn (${status}${code ? `, ${code}` : ""}).`);
    }
    if (Date.now() > deadline) throw new PictureError("Drawing took too long. Try again.");
    await new Promise((r) => setTimeout(r, 4000));
  }
}

/** Only real image bytes are kept, whatever the link claims to be. */
function sniff(data: ArrayBuffer): DrawnImage["ext"] | null {
  const b = new Uint8Array(data.slice(0, 12));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return "webp";
  return null;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function download(url: string): Promise<DrawnImage | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return null;
  const data = await res.arrayBuffer();
  if (data.byteLength > MAX_IMAGE_BYTES) return null;
  const ext = sniff(data);
  return ext ? { data, ext } : null;
}

/** Draw `count` pictures of one scene. Takes from ten seconds to a minute or two. */
export async function drawPictures(prompt: string, count: number): Promise<DrawnImage[]> {
  if (!canDrawPictures()) throw new PictureError("Picture drawing is not set up on this server.");
  const deadline = Date.now() + 180_000;
  const taskId = await createTask(prompt, count);
  const links = await waitFor(taskId, deadline);
  const images = (await Promise.all(links.map(download))).filter(
    (i): i is DrawnImage => i !== null,
  );
  if (!images.length) throw new PictureError("The pictures were drawn but could not be downloaded.");
  return images;
}
