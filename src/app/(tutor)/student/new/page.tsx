import { AddStudentForm } from "@/components/AddStudentForm";

export const metadata = { title: "Add student" };

export default function NewStudentPage() {
  return (
    <div className="stack-lg max-w-xl">
      <header>
        <h1 className="t-display">Add a student</h1>
        <p className="t-body t-muted mt-2">
          On the next screen you can create the family&rsquo;s sign-in - one
          for the student and their parent together.
        </p>
      </header>
      <AddStudentForm />
    </div>
  );
}
