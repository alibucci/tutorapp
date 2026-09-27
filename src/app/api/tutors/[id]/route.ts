import { NextResponse } from "next/server";
import { getSession, hashPassword, temporaryPassword } from "@/lib/auth";
import { updateTutor } from "@/lib/store";

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

  if (body.resetPassword) {
    const password = temporaryPassword();
    const tutor = await updateTutor(id, {
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    });
    if (!tutor) {
      return NextResponse.json({ error: "No such tutor." }, { status: 404 });
    }
    return NextResponse.json({ password });
  }

  if (typeof body.active === "boolean") {
    const tutor = await updateTutor(id, { active: body.active });
    if (!tutor) {
      return NextResponse.json({ error: "No such tutor." }, { status: 404 });
    }
    return NextResponse.json({ active: tutor.active });
  }

  return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
}
