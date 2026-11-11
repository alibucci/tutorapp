import { NextResponse } from "next/server";
import { CONFIRM_HOURS, siteUrl } from "@/lib/email";
import { listTutors, updateTutor } from "@/lib/store";

/**
 * The link in the confirmation email. Opening it is the proof that the
 * mailbox is real and belongs to the tutor; it works without signing in,
 * since the link is often opened on a phone.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const done = (state: "confirmed" | "expired") =>
    NextResponse.redirect(`${siteUrl()}/account?email=${state}`, 303);
  if (token.length < 20) return done("expired");

  const tutor = (await listTutors()).find((t) => t.noticeEmail?.token === token);
  const sentAt = tutor?.noticeEmail?.sentAt ? Date.parse(tutor.noticeEmail.sentAt) : NaN;
  if (!tutor || !(Date.now() - sentAt < CONFIRM_HOURS * 3600_000)) return done("expired");

  await updateTutor(tutor.id, (current) => {
    // Replaced by another address since the link went out.
    if (current.noticeEmail?.token !== token) return null;
    return {
      noticeEmail: { address: current.noticeEmail.address, confirmedAt: new Date().toISOString() },
    };
  });
  return done("confirmed");
}
