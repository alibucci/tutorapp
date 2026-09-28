import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { accessKey, updateStudent } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  return NextResponse.json(found.student);
}

/**
 * A deliberately small surface.
 *
 * This used to take a blanket `Partial<Student>`, which meant a tutor could
 * write `recordingConsent` straight onto a record and then record a child whose
 * parents had signed nothing. Consent is a legal artefact, so it gets its own
 * action below, with the server stamping the time.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }

  const body = (await request.json()) as {
    name?: string;
    consentFrom?: string | null;
    rotateLinks?: boolean;
  };

  const patch: Parameters<typeof updateStudent>[1] = {};

  if (typeof body.name === "string") {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "A name is required." }, { status: 400 });
    }
    patch.name = body.name.trim();
  }

  // Granting names who gave it and when, from the server clock. Passing null
  // withdraws it, which must also be possible.
  if (body.consentFrom !== undefined) {
    patch.recordingConsent = body.consentFrom?.trim()
      ? { grantedAt: new Date().toISOString(), grantedBy: body.consentFrom.trim() }
      : undefined;
  }

  // A shared link cannot be taken back once it is out; a new one can replace it.
  if (body.rotateLinks) {
    patch.studentKey = accessKey();
    patch.parentKey = accessKey();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  return NextResponse.json(await updateStudent(id, patch));
}
