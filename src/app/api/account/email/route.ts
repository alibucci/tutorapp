import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { CONFIRM_HOURS, canEmail, deliverable, escapeHtml, sendEmail, siteUrl } from "@/lib/email";
import { LIMIT, readJson } from "@/lib/http";
import { noticeAddress } from "@/lib/notices";
import { getTutor, updateTutor } from "@/lib/store";

/** One link a minute: a typo resent in a loop would only bounce. */
const RESEND_AFTER_MS = 60_000;

async function tutorOrNull() {
  const session = await getSession();
  if (session?.role !== "tutor") return null;
  return getTutor(session.id);
}

function off() {
  return NextResponse.json({ error: "Email is not set up on this server." }, { status: 404 });
}

const wrap = (body: string) =>
  `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:32rem">${body}</div>`;

/**
 * The address to send notices to. Nothing is sent to it but a link: notices
 * start once the tutor opens that link, which proves the mailbox is real and
 * theirs. A made-up address simply never gets confirmed.
 */
export async function PUT(request: Request) {
  if (!canEmail()) return off();
  const tutor = await tutorOrNull();
  if (!tutor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = await readJson<{ address?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (
    address.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address) ||
    !deliverable(address)
  ) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }

  const pending = tutor.noticeEmail;
  if (
    pending?.address === address &&
    pending.sentAt &&
    Date.now() - Date.parse(pending.sentAt) < RESEND_AFTER_MS
  ) {
    return NextResponse.json(
      { error: "A link was sent a moment ago. Give it a minute, and look in spam." },
      { status: 429 },
    );
  }

  const token = randomBytes(24).toString("base64url");
  const link = `${siteUrl()}/api/account/email/confirm?token=${token}`;
  const sent = await sendEmail({
    to: address,
    subject: "Confirm your email for aloudli notices",
    text: `Open this link to get an email when a student finishes their homework:\n\n${link}\n\nIt works for ${CONFIRM_HOURS} hours. If you did not ask for this, ignore this email - nothing will be sent.`,
    html: wrap(
      `<p style="margin:0 0 16px">Open this link to get an email when a student finishes their homework.</p><p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="color:#1f6f5c;font-weight:600">Confirm this address</a></p><p style="margin:0;font-size:13px;color:#78716c">It works for ${CONFIRM_HOURS} hours. If you did not ask for this, ignore this email - nothing will be sent.</p>`,
    ),
  });
  if (!sent) {
    return NextResponse.json({ error: "Could not send the link. Try again in a minute." }, { status: 502 });
  }
  // A new address replaces the old one, confirmed or not, until it is confirmed.
  await updateTutor(tutor.id, {
    noticeEmail: { address, token, sentAt: new Date().toISOString() },
  });
  return NextResponse.json({ address, confirmed: false });
}

/** Stop emailing. */
export async function DELETE() {
  if (!canEmail()) return off();
  const tutor = await tutorOrNull();
  if (!tutor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  await updateTutor(tutor.id, { noticeEmail: undefined });
  return NextResponse.json({ ok: true });
}

/** A test message to the confirmed address. */
export async function POST() {
  if (!canEmail()) return off();
  const tutor = await tutorOrNull();
  if (!tutor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const address = noticeAddress(tutor);
  if (!address) {
    return NextResponse.json({ error: "Confirm an address first." }, { status: 400 });
  }

  const sent = await sendEmail({
    to: address,
    subject: "Test message from aloudli",
    text: `This is how homework notices will reach you.\n\nIf this landed in spam, mark it "not spam" so the next ones arrive in your inbox.\n\n${siteUrl()}/account`,
    html: wrap(
      `<p style="margin:0 0 12px">This is how homework notices will reach you.</p><p style="margin:0 0 12px">If this landed in spam, mark it &ldquo;not spam&rdquo; so the next ones arrive in your inbox.</p><p style="margin:0"><a href="${escapeHtml(siteUrl())}/account" style="color:#1f6f5c">Your account</a></p>`,
    ),
  });
  if (!sent) {
    return NextResponse.json({ error: "Could not send it. Try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ sentTo: address });
}
