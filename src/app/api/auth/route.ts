import { NextResponse } from "next/server";
import {
  checkAdmin,
  endSession,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { getTutorByEmail } from "@/lib/store";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const admin = checkAdmin(email, password);
  if (admin) {
    await startSession(admin);
    return NextResponse.json({ role: admin.role });
  }

  const tutor = await getTutorByEmail(email);
  // Same message either way: do not reveal which accounts exist.
  if (!tutor || !tutor.active || !verifyPassword(password, tutor.passwordHash)) {
    return NextResponse.json(
      { error: "Those details do not match an account." },
      { status: 401 },
    );
  }

  await startSession({ role: "tutor", id: tutor.id, name: tutor.name });
  return NextResponse.json({
    role: "tutor",
    mustChangePassword: tutor.mustChangePassword,
  });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
