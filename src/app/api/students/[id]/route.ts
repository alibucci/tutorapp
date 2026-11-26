import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { isGameStyle } from "@/lib/gameStyles";
import { leaveGroups } from "@/lib/groups";
import { LEARNING_MAX, cleanLearning, readProfile } from "@/lib/profile";
import { themeFor } from "@/lib/themeFor";
import { accessKey, updateStudent } from "@/lib/store";
import type { Student, StudentProfile } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** The learning programme as the form sends it; cleaned before it is stored. */
const text = (max: number) => z.string().max(max).optional();
const LearningIn = z
  .object({
    objectives: text(LEARNING_MAX.objectives),
    curriculum: text(LEARNING_MAX.curriculum),
    include: text(LEARNING_MAX.include),
    avoid: text(LEARNING_MAX.avoid),
    requirements: text(LEARNING_MAX.requirements),
    difficulty: z.enum(["easier", "level", "stretch"]).optional(),
    approval: z.boolean().optional(),
  })
  .strip();

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
    profile?: unknown;
    /** The learning programme, saved on its own: the profile form never sends it. */
    learning?: unknown;
    /** Make the learner's own theme again from the description. */
    remakeTheme?: boolean;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  const patch: Partial<Student> = {};

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

  // The profile is worked out from the record as it is under the lock, not as
  // it was read above: the "About" form and the learning programme save
  // separately, and each must keep what the other just saved.
  let profileFor: ((current: StudentProfile | undefined) => StudentProfile) | undefined;
  const form = body.profile === undefined ? undefined : readProfile(body.profile);
  if (form === null) {
    return NextResponse.json({ error: "Check the age, level and goal." }, { status: 400 });
  }
  if (form) {
    // The profile is replaced whole, so a form that does not know about the
    // parent's wish (a tab opened before it existed) would wipe it. Only a
    // form that sends the field, empty or not, may change it. The learning
    // programme is never the profile form's to change.
    const sent = body.profile as Record<string, unknown>;
    profileFor = (current) => ({
      ...form,
      ...(current?.parentWish && !("parentWish" in sent) && { parentWish: current.parentWish }),
      ...(current?.learning && { learning: current.learning }),
    });
  }

  if (body.learning !== undefined) {
    const parsed = LearningIn.safeParse(body.learning);
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the learning programme: one of the boxes is too long." }, { status: 400 });
    }
    // An emptied form clears it: nothing is stored rather than empty strings.
    const learning = cleanLearning(parsed.data);
    const before = profileFor;
    profileFor = (current) => {
      const next: StudentProfile = { ...(before ? before(current) : current) };
      delete next.learning;
      return learning ? { ...next, learning } : next;
    };
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

  if (Object.keys(patch).length === 0 && !profileFor && !body.remakeTheme) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // A new description makes a new theme, when the learner has their own or
  // has none picked yet. A ready-made theme the tutor chose stays theirs. The
  // learning programme never does: it is what is taught, not how it looks.
  const about = form?.about ?? "";
  const style = patch.gameStyle ?? found.student.gameStyle;
  const remake =
    body.remakeTheme ||
    (form !== undefined &&
      about !== (found.student.customStyle?.madeFrom ?? "") &&
      Boolean(about) &&
      (!style || style === "custom"));

  const saved = await updateStudent(id, (current) => ({
    ...patch,
    ...(profileFor && { profile: profileFor(current.profile) }),
  }));
  // An archived child leaves their saved groups; the tutor is told which.
  if (saved && patch.archivedAt) {
    const leftGroups = await leaveGroups(saved);
    if (leftGroups.length) return NextResponse.json({ ...saved, leftGroups });
  }
  if (saved && remake) {
    const made = await themeFor(saved);
    return NextResponse.json({ ...(made.student ?? saved), ...(made.error && { themeError: made.error }) });
  }
  return NextResponse.json(saved);
}
