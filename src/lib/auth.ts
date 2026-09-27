import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Sessions for the two roles that log in.
 *
 * Tutors and the superadmin get a password and a signed cookie. Students and
 * parents do not: a nine-year-old with a password is a support queue, and a
 * parent will not keep an account either. They get an unguessable link that
 * only ever shows content a tutor has already approved, and that a tutor can
 * rotate. The blast radius of a leaked family link is one weekly note.
 *
 * Nobody signs themselves up. The superadmin comes from the environment and
 * creates tutors; tutors create their own students.
 */

export type Role = "admin" | "tutor";
export type Session = { role: Role; id: string; name: string };

const COOKIE = "tutor_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Put a long random string in .env.local.",
    );
  }
  return s;
}

// --- passwords -------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// --- session cookie --------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(session: Session): string {
  const body = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as
      | (Session & { exp: number })
      | null;
    if (!claims || claims.exp < Date.now()) return null;
    return { role: claims.role, id: claims.id, name: claims.name };
  } catch {
    return null;
  }
}

export async function startSession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  try {
    return decode((await cookies()).get(COOKIE)?.value);
  } catch {
    return null;
  }
}

// --- guards, used next to the data rather than in proxy.ts -----------------

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/");
  return session;
}

// --- the superadmin lives in the environment, not in the store -------------

export function adminCredentials(): { email: string; password: string } | null {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  return email && password ? { email, password } : null;
}

export function checkAdmin(email: string, password: string): Session | null {
  const creds = adminCredentials();
  if (!creds) return null;

  const emailOk = email.trim().toLowerCase() === creds.email.toLowerCase();
  const passBuf = Buffer.from(password);
  const expectBuf = Buffer.from(creds.password);
  const passOk =
    passBuf.length === expectBuf.length && timingSafeEqual(passBuf, expectBuf);

  return emailOk && passOk
    ? { role: "admin", id: "superadmin", name: "Administrator" }
    : null;
}

/** A one-time password for a tutor the superadmin has just created. */
export function temporaryPassword(): string {
  return randomBytes(6).toString("base64url");
}

export { randomUUID };
