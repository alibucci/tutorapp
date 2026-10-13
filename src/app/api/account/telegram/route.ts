import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { botUsername, canNotify, findLinker, linkCode, notify } from "@/lib/telegram";
import { getTutor, updateTutor } from "@/lib/store";

/** How long a connection code is good for. Long enough to find the app. */
const CODE_MINUTES = 10;

async function tutorOrNull() {
  const session = await getSession();
  if (session?.role !== "tutor") return null;
  return getTutor(session.id);
}

/** Start connecting: hand back the link the tutor taps. */
export async function POST() {
  if (!canNotify()) {
    return NextResponse.json({ error: "Telegram is not set up on this server." }, { status: 404 });
  }
  const tutor = await tutorOrNull();
  if (!tutor) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const username = await botUsername();
  if (!username) {
    return NextResponse.json(
      { error: "Could not reach Telegram. Try again in a moment." },
      { status: 502 },
    );
  }

  const code = linkCode();
  await updateTutor(tutor.id, {
    telegramLink: {
      code,
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    },
  });

  return NextResponse.json({ url: `https://t.me/${username}?start=${code}`, code });
}

/**
 * Has the tutor pressed Start yet? The page asks this every couple of seconds
 * while the tutor is away in Telegram.
 */
export async function GET() {
  const tutor = await tutorOrNull();
  if (!tutor) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (tutor.telegram) {
    return NextResponse.json({ linked: true, name: tutor.telegram.name });
  }

  const pending = tutor.telegramLink;
  if (!pending || pending.expiresAt < new Date().toISOString()) {
    return NextResponse.json({ linked: false, expired: Boolean(pending) });
  }

  const found = await findLinker(pending.code);
  if (!found) return NextResponse.json({ linked: false });

  await updateTutor(tutor.id, {
    telegram: { ...found, linkedAt: new Date().toISOString() },
    telegramLink: undefined,
  });
  await notify(
    found.chatId,
    `Connected. I'll message you here when a child finishes their homework.`,
  );
  return NextResponse.json({ linked: true, name: found.name });
}

/** Stop sending. The chat stays; we just forget where to write. */
export async function DELETE() {
  const tutor = await tutorOrNull();
  if (!tutor) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  await updateTutor(tutor.id, { telegram: undefined, telegramLink: undefined });
  return NextResponse.json({ ok: true });
}
