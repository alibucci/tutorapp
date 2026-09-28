import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTutor } from "./store";

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
export type Session = {
  role: Role;
  id: string;
  name: string;
  /** Tutors only: the tutor's tokenVersion when this session was issued. */
  v?: number;
};

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
    return {
      role: claims.role,
      id: claims.id,
      name: claims.name,
      v: claims.v,
    };
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

/**
 * The signed cookie proves who issued it, not that the account is still good.
 *
 * A suspended tutor, a reset password or a self-service password change all
 * have to take effect now rather than in fourteen days, so a tutor session is
 * re-checked against the stored record. That is one small file read on a
 * request that almost always reads the store anyway.
 *
 * Admin sessions need no lookup - those credentials live in the environment.
 */
export async function getSession(): Promise<Session | null> {
  let session: Session | null;
  try {
    session = decode((await cookies()).get(COOKIE)?.value);
  } catch {
    return null;
  }
  if (!session || session.role !== "tutor") return session;

  const tutor = await getTutor(session.id);
  if (!tutor || !tutor.active || tutor.tokenVersion !== session.v) return null;

  // The name can change under an old cookie; trust the record.
  return { ...session, name: tutor.name };
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

export { MIN_PASSWORD_LENGTH } from "./auth-constants";

// --- login throttling ------------------------------------------------------

/**
 * In-process, per identifier. Enough for a pilot of five people on one server:
 * it stops a script, and it resets when the process does. A second server or a
 * determined attacker needs this moved into the store.
 *
 * The two limits are deliberately far apart. Guessing one account's password is
 * the attack worth stopping hard, so the per-email limit is strict. The per-IP
 * limit only exists to slow enumeration across many accounts, and it has to
 * stay loose: a whole school behind one NAT shares an address, and a strict
 * limit there would lock out the people who typed their password correctly.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS: Record<string, number> = { email: 10, ip: 60 };
const attempts = new Map<string, number[]>();

function limitFor(key: string): number {
  return LIMITS[key.split(":")[0]] ?? 10;
}

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= limitFor(key);
}

export function recordAttempt(key: string): void {
  const now = Date.now();
  attempts.set(key, [...(attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS), now]);
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

export { randomUUID };
