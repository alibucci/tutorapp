import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGameStyle } from "@/lib/gameStyles";
import { readProfile } from "@/lib/profile";
import { createStudent, listStudents, updateStudent } from "@/lib/store";
import { themeFor } from "@/lib/themeFor";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  // The superadmin sees everyone; a tutor sees only their own.
  return NextResponse.json(
    await listStudents(session.role === "admin" ? undefined : session.id),
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "tutor") {
    return NextResponse.json(
      { error: "Only a tutor can add a student." },
      { status: 403 },
    );
  }

  const parsed = await readJson<{
    name?: string;
    consentFrom?: string;
    gameStyle?: string;
    profile?: unknown;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const body = parsed;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }
  const profile = body.profile === undefined ? undefined : readProfile(body.profile);
  if (profile === null) {
    return NextResponse.json({ error: "Check the age, level and goal." }, { status: 400 });
  }
  const wantsOwn = body.gameStyle === "custom";

  const student = await createStudent(body.name.trim(), session.id);
  const extra: Parameters<typeof updateStudent>[1] = {};
  if (body.consentFrom?.trim()) {
    extra.recordingConsent = {
      grantedAt: new Date().toISOString(),
      grantedBy: body.consentFrom.trim(),
    };
  }
  if (isGameStyle(body.gameStyle)) extra.gameStyle = body.gameStyle;
  if (profile && Object.keys(profile).length) extra.profile = profile;
  let saved = Object.keys(extra).length ? await updateStudent(student.id, extra) : student;

  // A theme of their own, from the description. The student exists either
  // way; a theme that could not be made is a note, not a failed add.
  let themeError: string | undefined;
  if (saved && (wantsOwn || (!extra.gameStyle && profile?.about))) {
    const made = await themeFor(saved);
    saved = made.student ?? saved;
    themeError = made.error;
  }
  return NextResponse.json({ ...saved, ...(themeError && { themeError }) }, { status: 201 });
}
