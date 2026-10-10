import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { hashPassword, temporaryPassword } from "@/lib/auth";
import { LIMIT, readJson } from "@/lib/http";
import { getStudentByUsername, updateStudent } from "@/lib/store";
import { USERNAME_PATTERN, normaliseUsername, suggestUsername } from "@/lib/usernames";
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

/** The suggestion, with a number on the end if it is taken. */
async function freeUsername(student: Student): Promise<string | null> {
  const base = suggestUsername(student.name);
  if (!base) return null;
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const taken = await getStudentByUsername(candidate);
    if (!taken || taken.id === student.id) return candidate;
  }
  return null;
}

/**
 * Create the family's sign-in, or reset its password. Either way the password
 * is returned once, for the tutor to pass on, and every device already signed
 * in with the old one is signed out.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const parsed = await readJson<{ username?: string }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;

  const { student } = found;
  let fresh: string | null = null;
  if (!student.login) {
    // The tutor's choice when given, else a suggestion from the name. A name
    // in Chinese characters gives no suggestion, so the tutor has to choose.
    const wanted = parsed.username ? normaliseUsername(parsed.username) : null;
    if (wanted) {
      if (!USERNAME_PATTERN.test(wanted)) {
        return NextResponse.json(
          { error: "3-32 characters: lowercase letters, numbers, dot, dash or underscore." },
          { status: 400 },
        );
      }
      const taken = await getStudentByUsername(wanted);
      if (taken && taken.id !== student.id) {
        return NextResponse.json({ error: "That username is taken." }, { status: 409 });
      }
      fresh = wanted;
    } else {
      fresh = await freeUsername(student);
      if (!fresh) {
        return NextResponse.json({ error: "Choose a username." }, { status: 400 });
      }
    }
  }

  const password = temporaryPassword();
  const passwordHash = hashPassword(password);

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
