import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { readImage } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get("key");
  const found = await homeworkFor(id, key);
  const name = found?.lesson.homework?.imageFile;
  const image = name ? await readImage(name) : null;
  if (!image) {
    return NextResponse.json({ error: "No picture." }, { status: 404 });
  }
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      // Private: it is one child's homework. The name changes on replace, so
      // caching it in the browser is safe.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
