import { NextResponse } from "next/server";
import {
  checkAdmin,
  clearAttempts,
  endSession,
  recordAttempt,
  startFamilySession,
  startSession,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { getStudentByUsername, getTutorByEmail } from "@/lib/store";

/** Throttle per account and per source, so one does not mask the other. */
function keys(request: Request, email: string): string[] {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return [`email:${email.trim().toLowerCase()}`, `ip:${ip}`];
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };
  // Phones add a trailing space after autocomplete, and capitalise the first
  // letter of a username. Neither should cost anyone a sign-in.
  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email or username, and password, are required." },
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
    return NextResponse.json({ role: admin.role, next: "/admin" });
  }

  // No @ means a username, and usernames belong to families.
  if (!email.includes("@")) {
    const student = await getStudentByUsername(email);
    const login = student?.login;
    if (!student || !login || !verifyPassword(password, login.passwordHash)) {
      throttleKeys.forEach(recordAttempt);
      return NextResponse.json(
        { error: "That username and password do not match." },
        { status: 401 },
      );
    }
    throttleKeys.forEach(clearAttempts);
    await startFamilySession({ id: student.id, v: login.tokenVersion });
    return NextResponse.json({ role: "family", next: "/me" });
  }

  const tutor = await getTutorByEmail(email);
  // Same message either way: do not reveal which accounts exist.
  if (!tutor || !tutor.active || !verifyPassword(password, tutor.passwordHash)) {
    throttleKeys.forEach(recordAttempt);
    return NextResponse.json(
      { error: "That email and password do not match." },
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
    // A tutor still on the password the admin sent goes straight to change it.
    next: tutor.mustChangePassword ? "/account" : "/",
  });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
