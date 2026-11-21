import { getTutor } from "./store";

/**
 * Whether a tutor is on a release list kept in an environment variable:
 * tutor emails or ids, comma-separated, or "*" for everyone. Unset: nobody.
 *
 * By tutor id rather than a session, so work running in the background after
 * a request (a parent message, a plan being built) can ask too.
 */
export async function tutorListed(variable: string, tutorId: string): Promise<boolean> {
  const list = (process.env[variable] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  if (list.includes("*") || list.includes(tutorId.toLowerCase())) return true;
  try {
    const tutor = await getTutor(tutorId);
    return Boolean(tutor && list.includes(tutor.email.toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Lesson plans, materials and saved groups: Victor's account first, then
 * whoever he opens them to (LESSON_PLANS_TUTORS).
 */
export function plansOpenTo(tutorId: string): Promise<boolean> {
  return tutorListed("LESSON_PLANS_TUTORS", tutorId);
}
