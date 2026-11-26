import { linkManifest } from "@/lib/appManifest";

/** Added to a home screen from the child's link: the icon opens that link. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  return linkManifest(`/s/${encodeURIComponent((await params).key)}`);
}
