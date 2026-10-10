/**
 * Calling our own API from the browser without ever throwing.
 *
 * A dropped connection throws from fetch, and a proxy's HTML error page throws
 * from res.json(). Either one, uncaught, left a button stuck on "Saving…"
 * for good. This turns both into an ordinary error message.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function api<T = unknown>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  fallback = "Something went wrong. Try again.",
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      ...(json !== undefined && {
        body: JSON.stringify(json),
        headers: { "Content-Type": "application/json", ...rest.headers },
      }),
    });
  } catch {
    return { ok: false, error: "Could not reach the server. Check the connection and try again." };
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) return { ok: false, error: body?.error ?? fallback };
  return { ok: true, data: body as T };
}
