import { linkManifest } from "@/lib/appManifest";

/** Added to a home screen from the parent's link: the icon opens that link. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  return linkManifest(`/p/${encodeURIComponent((await params).key)}`);
}
