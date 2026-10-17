import { NextResponse } from "next/server";

/**
 * Request bodies, read with a ceiling.
 *
 * `request.json()` reads whatever arrives, however large, before anything can
 * object - a 200 MB post to the login route is parsed in full by a server with
 * 2 GB of memory. This reads the stream and stops the moment it passes the
 * limit, whatever the Content-Length header claims.
 */

export const LIMIT = {
  /** Logins, small edits. */
  small: 16 * 1024,
  /** A weekly note, a topic list, homework answers. */
  medium: 128 * 1024,
  /** A lesson's transcript: an hour of speech is well under this. */
  transcript: 2 * 1024 * 1024,
  /** One homework picture, already shrunk to a JPEG in the browser. */
  upload: 5 * 1024 * 1024,
} as const;

function tooLarge() {
  return NextResponse.json({ error: "That request is too large." }, { status: 413 });
}

export async function readBytes(request: Request, limit: number): Promise<Uint8Array | Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return tooLarge();
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Parsed JSON, or a ready error response to return as is. */
export async function readJson<T = Record<string, unknown>>(
  request: Request,
  limit: number = LIMIT.small,
): Promise<T | Response> {
  const bytes = await readBytes(request, limit);
  if (bytes instanceof Response) return bytes;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as T;
  } catch {
    return NextResponse.json({ error: "That is not valid JSON." }, { status: 400 });
  }
}

/** Multipart form data, or a ready error response. */
export async function readForm(request: Request, limit: number): Promise<FormData | Response> {
  const bytes = await readBytes(request, limit);
  if (bytes instanceof Response) return bytes;
  try {
    return await new Response(bytes as BodyInit, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return NextResponse.json({ error: "That upload could not be read." }, { status: 400 });
  }
}
