import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { getReport, saveReport } from "@/lib/store";
import type { ParentReportBody } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Edit the draft and/or approve it. Approval is what makes it visible. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report || !(await studentFor(report.studentId))) {
    return NextResponse.json({ error: "No such report." }, { status: 404 });
  }

  const patch = (await request.json()) as {
    body?: ParentReportBody;
    approved?: boolean;
  };

  const next = { ...report };
  if (patch.body) {
    next.body = patch.body;
    next.editedByTutor = true;
  }
  if (patch.approved === true) next.approvedAt = new Date().toISOString();
  if (patch.approved === false) delete next.approvedAt;

  return NextResponse.json(await saveReport(next));
}
