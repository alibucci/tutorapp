import Link from "next/link";
import { PolicyForm } from "@/components/PolicyForm";
import { requireAdmin } from "@/lib/auth";
import { tutorEngagement } from "@/lib/overview";
import { BUILT_IN_TEMPLATE } from "@/lib/schedule";
import { getLearningPolicy, listLessons, listStudents, listTutors } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learning" };

const share = (n: number, of: number) => (of ? `${n} of ${of}` : "-");

/**
 * Practice between lessons across the agency: the standard programme and the
 * limits every tutor works within, and how each tutor's children are doing -
 * without opening dozens of student pages. Costs are on the Usage page.
 */
export default async function LearningAdminPage() {
  await requireAdmin();
  const [policy, tutors, lessons] = await Promise.all([getLearningPolicy(), listTutors(), listLessons()]);
  const rows = await Promise.all(
    tutors.map(async (t) => ({
      tutor: t,
      open: await learningOpenTo(t.id),
      e: tutorEngagement(t.id, await listStudents(t.id), lessons),
    })),
  );
  return (
    <div className="stack-lg">
      <header>
        <Link href="/admin" className="t-small t-muted">
          &larr; Tutors
        </Link>
        <h1 className="t-display mt-2">Learning</h1>
        <p className="t-muted mt-2 max-w-[44rem]">
          Smart Reviews between lessons, agency-wide. What each tutor&rsquo;s children did in the last four weeks; costs are on{" "}
          <Link href="/admin/usage" className="underline">
            Usage
          </Link>
          .
        </p>
      </header>

      <PolicyForm policy={policy ?? { template: BUILT_IN_TEMPLATE, requireApproval: false, maxPerWeekCap: 3 }} />

      <section className="space-y-3">
        <h2 className="t-title">By tutor · last four weeks</h2>
        <div className="card overflow-x-auto">
          <table className="w-full t-small">
            <thead className="t-muted text-left">
              <tr>
                <th className="p-3">Tutor</th>
                <th className="p-3">Continuous learning</th>
                <th className="p-3 text-right">Children</th>
                <th className="p-3 text-right">On a schedule</th>
                <th className="p-3 text-right">Smart Reviews finished</th>
                <th className="p-3 text-right">Waiting for the tutor</th>
                <th className="p-3 text-right">Lesson homework finished</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tutor, open, e }) => (
                <tr key={tutor.id} className="border-t border-line">
                  <td className="p-3">
                    <span className="font-medium">{tutor.name}</span>
                    <span className="block t-caption t-muted">{tutor.email}</span>
                  </td>
                  <td className="p-3">{open ? "On" : <span className="t-muted">Not yet</span>}</td>
                  <td className="p-3 text-right tabular-nums">{e.learners}</td>
                  <td className="p-3 text-right tabular-nums">
                    {e.scheduled}
                    {e.paused > 0 && <span className="t-muted"> (+{e.paused} paused)</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{share(e.reviewsDone, e.reviewsSent)}</td>
                  <td className="p-3 text-right tabular-nums">{e.waiting || "-"}</td>
                  <td className="p-3 text-right tabular-nums">{share(e.homeworkDone, e.homeworkSent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Finished out of sent. A Smart Review the tutor skipped or archived is left out.</p>
      </section>
    </div>
  );
}
