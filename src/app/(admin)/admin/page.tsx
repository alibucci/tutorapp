import { TutorAdmin } from "@/components/TutorAdmin";
import { listStudents, listTutors } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const [tutors, students] = await Promise.all([listTutors(), listStudents()]);

  const counts = new Map<string, number>();
  for (const student of students) {
    counts.set(student.tutorId, (counts.get(student.tutorId) ?? 0) + 1);
  }

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">Tutors</h1>
        <p className="t-body t-muted mt-2">
          You create tutor accounts here. Tutors then add their own students,
          and each student gets their own private link for the child and the
          parent.
        </p>
      </header>

      <TutorAdmin
        tutors={tutors.map((t) => ({
          id: t.id,
          email: t.email,
          name: t.name,
          active: t.active,
          mustChangePassword: t.mustChangePassword,
          students: counts.get(t.id) ?? 0,
        }))}
      />
    </div>
  );
}
