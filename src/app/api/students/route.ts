import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const student = await createStudent(body.name.trim(), session.id);
  if (body.consentFrom?.trim()) {
    const withConsent = await updateStudent(student.id, {
      recordingConsent: {
        grantedAt: new Date().toISOString(),
        grantedBy: body.consentFrom.trim(),
      },
    });
    return NextResponse.json(withConsent, { status: 201 });
  }

  return NextResponse.json(student, { status: 201 });
}
