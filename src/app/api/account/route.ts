import { NextResponse } from "next/server";
import {
  MIN_PASSWORD_LENGTH,
  getSession,
  hashPassword,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { getTutor, updateTutor } from "@/lib/store";

/**
 * A tutor changing their own password.
 *
 * The superadmin issues a one-time password out loud or over a message; until
 * this exists, that password is the account's password forever.
 */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (session?.role !== "tutor") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { currentPassword, newPassword } = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Both the current and the new password are required." },
      { status: 400 },
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "That is the password you already have." },
      { status: 400 },
    );
  }

  const tutor = await getTutor(session.id);
  if (!tutor || !verifyPassword(currentPassword, tutor.passwordHash)) {
    return NextResponse.json(
      { error: "That is not your current password." },
      { status: 401 },
    );
  }

  // Bumping the version signs out every other device, which is the point of
  // changing a password someone else once knew.
  const version = tutor.tokenVersion + 1;
  await updateTutor(tutor.id, {
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false,
    tokenVersion: version,
  });

  // Re-issue this one so the tutor is not signed out of the tab they are in.
  await startSession({
    role: "tutor",
    id: tutor.id,
    name: tutor.name,
    v: version,
  });

  return NextResponse.json({ ok: true });
}
