import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main
      data-density="comfortable"
      className="page flex flex-1 items-center justify-center py-14"
    >
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
