import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { isGameStyle } from "@/lib/gameStyles";
import { isMathLevel } from "@/lib/math";
import { readProfile } from "@/lib/profile";
import { themeFor } from "@/lib/themeFor";
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

  const parsed = await readJson<{
    name?: string;
    consentFrom?: string | null;
    rotateLinks?: boolean;
    gameStyle?: string;
    archived?: boolean;
    math?: { on?: boolean; level?: number };
    profile?: unknown;
    /** Make the learner's own theme again from the description. */
    remakeTheme?: boolean;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

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

  if (body.gameStyle !== undefined) {
    // Their own theme only once there is one to switch to.
    const own = body.gameStyle === "custom" && found.student.customStyle;
    if (!isGameStyle(body.gameStyle) && !own) {
      return NextResponse.json({ error: "Unknown game style." }, { status: 400 });
    }
    patch.gameStyle = body.gameStyle;
  }

  if (body.profile !== undefined) {
    const profile = readProfile(body.profile);
    if (!profile) {
      return NextResponse.json({ error: "Check the age, level and goal." }, { status: 400 });
    }
    patch.profile = profile;
  }

  // Archiving keeps everything; restoring is the same call with false.
  if (typeof body.archived === "boolean") {
    patch.archivedAt = body.archived ? new Date().toISOString() : undefined;
  }

  // A shared link cannot be taken back once it is out; a new one can replace it.
  if (body.rotateLinks) {
    patch.studentKey = accessKey();
    patch.parentKey = accessKey();
  }

  const math = body.math;
  if (math?.on !== undefined && typeof math.on !== "boolean") {
    return NextResponse.json({ error: "Math practice is on or off." }, { status: 400 });
  }
  if (math?.level !== undefined && !isMathLevel(math.level)) {
    return NextResponse.json({ error: "Unknown math level." }, { status: 400 });
  }

  if (Object.keys(patch).length === 0 && !math && !body.remakeTheme) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // A new description makes a new theme, when the learner has their own or
  // has none picked yet. A ready-made theme the tutor chose stays theirs.
  const about = patch.profile?.about ?? "";
  const style = patch.gameStyle ?? found.student.gameStyle;
  const remake =
    body.remakeTheme ||
    (patch.profile !== undefined &&
      about !== (found.student.customStyle?.madeFrom ?? "") &&
      Boolean(about) &&
      (!style || style === "custom"));

  // Against the record as it is now: the child may be saving a game.
  const saved = await updateStudent(id, (current) => ({
    ...patch,
    ...(math && {
      math: {
        on: math.on ?? current.math?.on ?? false,
        level: math.level ?? current.math?.level ?? 1,
        games: current.math?.games ?? [],
      },
    }),
  }));
  if (saved && remake) {
    const made = await themeFor(saved);
    return NextResponse.json({ ...(made.student ?? saved), ...(made.error && { themeError: made.error }) });
  }
  return NextResponse.json(saved);
}
