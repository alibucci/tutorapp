import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { runAutoHomework } from "@/lib/autoHomework";

type Params = { params: Promise<{ id: string }> };

/**
 * Make and send this lesson's homework now, if it has not gone yet: the
 * review page joins the server's own run, or tries again after a failure.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const result = await runAutoHomework(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.value ?? null);
}
