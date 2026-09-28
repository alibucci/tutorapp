import { NextResponse } from "next/server";
import {
  checkAdmin,
  clearAttempts,
  endSession,
  recordAttempt,
  startSession,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { getTutorByEmail } from "@/lib/store";

/** Throttle per account and per source, so one does not mask the other. */
function keys(request: Request, email: string): string[] {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return [`email:${email.trim().toLowerCase()}`, `ip:${ip}`];
}

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

  const throttleKeys = keys(request, email);
  if (throttleKeys.some(tooManyAttempts)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait fifteen minutes and try again." },
      { status: 429 },
    );
  }

  const admin = checkAdmin(email, password);
  if (admin) {
    throttleKeys.forEach(clearAttempts);
    await startSession(admin);
    return NextResponse.json({ role: admin.role });
  }

  const tutor = await getTutorByEmail(email);
  // Same message either way: do not reveal which accounts exist.
  if (!tutor || !tutor.active || !verifyPassword(password, tutor.passwordHash)) {
    throttleKeys.forEach(recordAttempt);
    return NextResponse.json(
      { error: "Those details do not match an account." },
      { status: 401 },
    );
  }

  throttleKeys.forEach(clearAttempts);
  await startSession({
    role: "tutor",
    id: tutor.id,
    name: tutor.name,
    v: tutor.tokenVersion,
  });
  return NextResponse.json({
    role: "tutor",
    mustChangePassword: tutor.mustChangePassword,
  });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
