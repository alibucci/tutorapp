import { NextResponse } from "next/server";
import { getSession, hashPassword, temporaryPassword } from "@/lib/auth";
import { getTutor, updateTutor } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    active?: boolean;
    resetPassword?: boolean;
  };

  const current = await getTutor(id);
  if (!current) {
    return NextResponse.json({ error: "No such tutor." }, { status: 404 });
  }

  if (body.resetPassword) {
    const password = temporaryPassword();
    // Whoever was signed in with the old password is signed out now.
    const tutor = await updateTutor(id, {
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      tokenVersion: current.tokenVersion + 1,
    });
    if (!tutor) {
      return NextResponse.json({ error: "No such tutor." }, { status: 404 });
    }
    return NextResponse.json({ password });
  }

  if (typeof body.active === "boolean") {
    // A suspension has to take effect now, not when the cookie expires.
    const tutor = await updateTutor(id, {
      active: body.active,
      tokenVersion: current.tokenVersion + 1,
    });
    if (!tutor) {
      return NextResponse.json({ error: "No such tutor." }, { status: 404 });
    }
    return NextResponse.json({ active: tutor.active });
  }

  return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
}
