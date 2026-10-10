import { AddStudentForm } from "@/components/AddStudentForm";

export const metadata = { title: "Add student" };

export default function NewStudentPage() {
  return (
    <div className="stack-lg max-w-xl">
      <header>
        <h1 className="t-display">Add a student</h1>
        <p className="t-body t-muted mt-2">
          You can create sign-ins for the student and their parent on the next
          screen.
        </p>
      </header>
      <AddStudentForm />
    </div>
  );
}
