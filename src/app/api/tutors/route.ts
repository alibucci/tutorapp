import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { getSession, hashPassword, temporaryPassword } from "@/lib/auth";
import { createTutor, getTutorByEmail, listTutors } from "@/lib/store";

async function guard() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await guard())) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const tutors = await listTutors();
  // Never let a hash off the server.
  return NextResponse.json(
    tutors.map((t) => ({
      id: t.id,
      email: t.email,
      name: t.name,
      active: t.active,
      mustChangePassword: t.mustChangePassword,
      createdAt: t.createdAt,
    })),
  );
}

export async function POST(request: Request) {
  if (!(await guard())) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const parsed = await readJson<{
    email?: string;
    name?: string;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const { email, name } = parsed;
  if (!email?.trim() || !name?.trim()) {
    return NextResponse.json(
      { error: "Name and email are required." },
      { status: 400 },
    );
  }
  if (await getTutorByEmail(email)) {
    return NextResponse.json(
      { error: "That email already has an account." },
      { status: 409 },
    );
  }

  const password = temporaryPassword();
  const tutor = await createTutor({
    email,
    name: name.trim(),
    passwordHash: hashPassword(password),
  });

  // Shown once, so the superadmin can pass it on.
  return NextResponse.json(
    { id: tutor.id, email: tutor.email, name: tutor.name, password },
    { status: 201 },
  );
}
