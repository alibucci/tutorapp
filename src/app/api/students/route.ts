import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isGameStyle } from "@/lib/gameStyles";
import { createStudent, listStudents, updateStudent } from "@/lib/store";

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

  const body = (await request.json()) as {
    name?: string;
    consentFrom?: string;
    gameStyle?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const student = await createStudent(body.name.trim(), session.id);
  const extra: Parameters<typeof updateStudent>[1] = {};
  if (body.consentFrom?.trim()) {
    extra.recordingConsent = {
      grantedAt: new Date().toISOString(),
      grantedBy: body.consentFrom.trim(),
    };
  }
  if (isGameStyle(body.gameStyle)) extra.gameStyle = body.gameStyle;
  if (Object.keys(extra).length) {
    return NextResponse.json(await updateStudent(student.id, extra), {
      status: 201,
    });
  }

  return NextResponse.json(student, { status: 201 });
}
