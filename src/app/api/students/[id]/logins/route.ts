import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { hashPassword, temporaryPassword } from "@/lib/auth";
import { getStudentByUsername, updateStudent } from "@/lib/store";
import type { FamilyLogin, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * A session version that has never been used for this student before.
 *
 * Counting up from the current login reused numbers after a removal: delete
 * the login, create a new one, and it started again at 1 - so a phone the
 * tutor had just signed out, still holding a v=1 cookie, was signed back in.
 * The clock only goes forward, so a timestamp cannot repeat.
 */
function nextVersion(previous: number | undefined): number {
  return Math.max(Date.now(), (previous ?? 0) + 1);
}

/** "Yeva Petrova" -> "yeva"; a number on the end if that is taken. */
async function freeUsername(student: Student): Promise<string> {
  const base =
    student.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .split(/\s+/)[0] || "student";
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const taken = await getStudentByUsername(candidate);
    if (!taken || taken.id === student.id) return candidate;
  }
  throw new Error("Could not find a free username.");
}

/**
 * Create the family's sign-in, or reset its password. Either way the password
 * is returned once, for the tutor to pass on, and every device already signed
 * in with the old one is signed out.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }

  const { student } = found;
  const password = temporaryPassword();
  const passwordHash = hashPassword(password);
  const fresh = student.login ? null : await freeUsername(student);

  // Decided under the student's lock, so a double tap cannot store one
  // password while showing the tutor another.
  const updated = await updateStudent(id, (current) => {
    const login: FamilyLogin = {
      username: current.login?.username ?? fresh ?? current.id,
      passwordHash,
      tokenVersion: nextVersion(current.login?.tokenVersion),
      createdAt: current.login?.createdAt ?? new Date().toISOString(),
    };
    return { login };
  });
  return NextResponse.json({ username: updated?.login?.username, password });
}

/** Remove the sign-in. Its sessions stop working at once - the record is gone. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  await updateStudent(id, { login: undefined });
  return NextResponse.json({ ok: true });
}
