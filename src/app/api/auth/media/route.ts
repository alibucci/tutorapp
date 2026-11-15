import { getSession } from "@/lib/auth";

/**
 * Caddy asks this before it serves anything under /media (forward_auth), so
 * the Help films reach signed-in tutors only while Caddy streams the files
 * itself - the app never carries the video bytes.
 */
export async function GET() {
  const session = await getSession();
  if (session && (session.role === "tutor" || session.role === "admin")) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  return new Response("Sign in to watch.", { status: 401, headers: { "Cache-Control": "no-store" } });
}
