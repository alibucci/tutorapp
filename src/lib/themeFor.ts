import { makeTheme } from "./themeGen";
import { updateStudent } from "./store";
import type { Student } from "./types";

/**
 * Make a learner's own theme and switch them to it. A failure is reported, not
 * thrown: the profile it came from is already saved, and the tutor can try
 * again or pick a ready-made theme.
 */
export async function themeFor(student: Student): Promise<{ student?: Student; error?: string }> {
  if (!student.profile?.about) return { error: "Write a line about the learner first." };
  try {
    const customStyle = await makeTheme(student);
    const saved = await updateStudent(student.id, { customStyle, gameStyle: "custom" });
    return { student: saved ?? undefined };
  } catch (e) {
    console.error("[theme]", e);
    return { error: "Could not make a theme from the description. Try again, or pick one." };
  }
}
