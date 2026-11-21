import type { Session } from "./auth";
import { owns } from "./access";
import { getStudent, listGroups, updateGroup } from "./store";
import type { Student, StudentGroup } from "./types";

import { GROUP_MAX, GROUP_MIN, GROUP_NAME_MAX } from "./groupRules";

export { GROUP_MAX, GROUP_MIN, GROUP_NAME_MAX };

/**
 * The children a group may hold: 2 to 6, all this tutor's, none archived.
 * The error is what the tutor reads.
 */
export async function groupMembers(
  session: Session,
  ids: unknown,
): Promise<{ students: Student[] } | { error: string; status: number }> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return { error: "Pick the children in the group.", status: 400 };
  }
  const unique = [...new Set(ids as string[])];
  if (unique.length < GROUP_MIN || unique.length > GROUP_MAX) {
    return { error: `A group is ${GROUP_MIN} to ${GROUP_MAX} children.`, status: 400 };
  }
  const students = await Promise.all(unique.map((id) => getStudent(id)));
  // Somebody else's child looks exactly like no child at all.
  if (students.some((s) => !s || !owns(session, s))) {
    return { error: "No such student.", status: 404 };
  }
  const found = students as Student[];
  if (new Set(found.map((s) => s.tutorId)).size !== 1) {
    return { error: "No such student.", status: 404 };
  }
  if (found.some((s) => s.archivedAt)) {
    return { error: "One of these children is archived. Restore them first.", status: 409 };
  }
  return { students: found };
}

export function readGroupName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, GROUP_NAME_MAX);
  return trimmed || null;
}

/**
 * An archived child leaves every group they were in. Returns the names of the
 * groups they left, for the tutor to be told.
 */
export async function leaveGroups(student: Student): Promise<string[]> {
  const left: string[] = [];
  for (const group of await listGroups(student.tutorId)) {
    if (!group.studentIds.includes(student.id)) continue;
    await updateGroup(group.id, (current) => ({
      studentIds: current.studentIds.filter((id) => id !== student.id),
    }));
    left.push(group.name);
  }
  return left;
}

/** Ready for a lesson: not archived, and still at least two children. */
export function groupUsable(group: StudentGroup): boolean {
  return !group.archivedAt && group.studentIds.length >= GROUP_MIN;
}
