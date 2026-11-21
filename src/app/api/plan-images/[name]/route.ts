import { NextResponse } from "next/server";
import { planFor } from "@/lib/plans";
import { readPlanImage } from "@/lib/store";

type Params = { params: Promise<{ name: string }> };

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A plan's picture, for the tutor who owns the plan. The name starts with its id. */
export async function GET(_request: Request, { params }: Params) {
  const { name } = await params;
  const planId = name.slice(0, 36);
  if (!(await planFor(planId))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const data = await readPlanImage(name);
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
