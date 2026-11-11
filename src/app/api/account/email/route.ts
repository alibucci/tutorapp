import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEmail, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { LIMIT, readJson } from "@/lib/http";
import { getTutor, updateTutor } from "@/lib/store";

async function tutorOrNull() {
  const session = await getSession();
  if (session?.role !== "tutor") return null;
  return getTutor(session.id);
}

/** Email notices on or off. */
export async function PATCH(request: Request) {
  if (!canEmail()) {
    return NextResponse.json({ error: "Email is not set up on this server." }, { status: 404 });
  }
  const tutor = await tutorOrNull();
  if (!tutor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await readJson<{ on?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  if (typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Say on or off." }, { status: 400 });
  }
  // Undefined is the default, which is on.
  await updateTutor(tutor.id, { emailNotices: body.on ? undefined : false });
  return NextResponse.json({ on: body.on });
}

/**
 * A test message, so a tutor knows it arrives - and finds it if it went to
 * spam - before the first real one matters.
 */
export async function POST() {
  if (!canEmail()) {
    return NextResponse.json({ error: "Email is not set up on this server." }, { status: 404 });
  }
  const tutor = await tutorOrNull();
  if (!tutor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const sent = await sendEmail({
    to: tutor.email,
    subject: "Test message from aloudli",
    text: `This is how homework notices will reach you.\n\nIf this landed in spam, mark it "not spam" so the next ones arrive in your inbox.\n\n${siteUrl()}/account`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:32rem"><p style="margin:0 0 12px">This is how homework notices will reach you.</p><p style="margin:0 0 12px">If this landed in spam, mark it &ldquo;not spam&rdquo; so the next ones arrive in your inbox.</p><p style="margin:0"><a href="${escapeHtml(siteUrl())}/account" style="color:#1f6f5c">Your account</a></p></div>`,
  });
  if (!sent) {
    return NextResponse.json({ error: "Could not send it. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ sentTo: tutor.email });
}
