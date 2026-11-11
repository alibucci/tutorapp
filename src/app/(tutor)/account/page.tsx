import { EmailNotices } from "@/components/EmailNotices";
import { PasswordForm } from "@/components/PasswordForm";
import { TelegramConnect } from "@/components/TelegramConnect";
import { requireSession } from "@/lib/auth";
import { canEmail } from "@/lib/email";
import { getTutor } from "@/lib/store";
import { canNotify } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const session = await requireSession();
  const tutor = await getTutor(session.id);

  return (
    <div className="stack-lg" style={{ maxWidth: "26rem" }}>
      <header>
        <p className="t-eyebrow">Your account</p>
        <h1 className="t-display mt-2">{session.name}</h1>
      </header>
      <PasswordForm first={Boolean(tutor?.mustChangePassword)} />

      {canEmail() && tutor && (
        <EmailNotices
          // Fresh state after a confirmation or a change elsewhere.
          key={`${tutor.noticeEmail?.address}-${Boolean(tutor.noticeEmail?.confirmedAt)}`}
          saved={
            tutor.noticeEmail
              ? { address: tutor.noticeEmail.address, confirmed: Boolean(tutor.noticeEmail.confirmedAt) }
              : null
          }
          just={email === "confirmed" || email === "expired" ? email : undefined}
        />
      )}
      {canNotify() && <TelegramConnect connectedTo={tutor?.telegram?.name} />}
    </div>
  );
}
