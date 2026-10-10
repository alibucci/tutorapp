import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { hashPassword, temporaryPassword } from "@/lib/auth";
import { getStudentByUsername, updateStudent } from "@/lib/store";
import type { FamilyLogin, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };
type Who = "student" | "parent";

function who(value: unknown): Who | null {
  return value === "student" || value === "parent" ? value : null;
}

/** "Yeva Petrova" -> "yeva", "yeva.parent"; a number on the end if taken. */
async function freeUsername(student: Student, role: Who): Promise<string> {
  const first =
    student.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .split(/\s+/)[0] || "student";
  const base = role === "student" ? first : `${first}.parent`;
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const taken = await getStudentByUsername(candidate);
    if (!taken || (taken.student.id === student.id && taken.role === role)) {
      return candidate;
    }
  }
  throw new Error("Could not find a free username.");
}

/**
 * Create a login, or reset its password. Either way the password is returned
 * once, for the tutor to pass on, and every device already signed in with the
 * old one is signed out.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const role = who(((await request.json()) as { who?: unknown }).who);
  if (!role) {
    return NextResponse.json({ error: "Say whose login." }, { status: 400 });
  }

  const { student } = found;
  const current = student.logins?.[role];
  const password = temporaryPassword();
  const login: FamilyLogin = {
    username: current?.username ?? (await freeUsername(student, role)),
    passwordHash: hashPassword(password),
    tokenVersion: (current?.tokenVersion ?? 0) + 1,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  };

  await updateStudent(id, { logins: { ...student.logins, [role]: login } });
  return NextResponse.json({ username: login.username, password });
}

/** Remove a login. Its sessions stop working at once - the record is gone. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const role = who(new URL(request.url).searchParams.get("who"));
  if (!role) {
    return NextResponse.json({ error: "Say whose login." }, { status: 400 });
  }
  const logins = { ...found.student.logins };
  delete logins[role];
  await updateStudent(id, { logins });
  return NextResponse.json({ ok: true });
}
