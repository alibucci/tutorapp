import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { readImage } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url);
  const found = await homeworkFor(id, url.searchParams.get("key"));
  const homework = found?.lesson.homework;
  // The chosen picture for anyone allowed; the unpicked options only for the
  // tutor choosing between them.
  const asked = url.searchParams.get("f");
  const name =
    found?.tutor && asked && homework?.candidates?.includes(asked)
      ? asked
      : homework?.imageFile;
  const image = name ? await readImage(name) : null;
  if (!name || !image) {
    return NextResponse.json({ error: "No picture." }, { status: 404 });
  }
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": CONTENT_TYPE[name.split(".").pop() ?? "jpg"] ?? "image/jpeg",
      // Private: it is one child's homework. The name changes on replace, so
      // caching it in the browser is safe.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
