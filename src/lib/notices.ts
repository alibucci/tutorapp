import { gameScore, homeworkDone, resultScore } from "./homework";
import { getStudent, getTutor } from "./store";
import { canEmail, escapeHtml, sendEmail, siteUrl } from "./email";
import { canNotify, notify } from "./telegram";
import type { Lesson, Tutor } from "./types";

/**
 * The two things worth interrupting a tutor for.
 *
 * "Finished" is the one they asked for. "Struggled" is the one that earns the
 * notification: a child who got a third of it right needs the topic explained
 * again, and that is worth knowing before the next lesson rather than after.
 * Anything more and the bot gets muted within a week.
 */
const STRUGGLED_BELOW = 0.5;

/** Fire and forget: a notice must never fail the request that caused it. */
export function noticeHomeworkDone(before: Lesson, after: Lesson | null): void {
  if ((!canNotify() && !canEmail()) || !after) return;
  if (homeworkDone(before.homework) || !homeworkDone(after.homework)) return;
  void send(after).catch((e) => console.error("[notice]", e));
}

/** The confirmed address to email notices to, if there is one. */
export function noticeAddress(tutor: Pick<Tutor, "noticeEmail">): string | null {
  return tutor.noticeEmail?.confirmedAt ? tutor.noticeEmail.address : null;
}

async function send(lesson: Lesson): Promise<void> {
  const student = await getStudent(lesson.studentId);
  if (!student) return;
  const tutor = await getTutor(student.tutorId);
  if (!tutor) return;

  const score = gameScore(lesson.homework);
  const struggled = score.total > 0 && score.right / score.total < STRUGGLED_BELOW;

  const headline = struggled
    ? `${student.name} finished the homework, but found it hard.`
    : `${student.name} finished the homework.`;
  const details: string[] = [];
  if (score.total > 0) {
    details.push(`${score.right} of ${score.total} right${struggled ? " - worth going over again" : ""}`);
  }
  for (const result of lesson.homework?.results ?? []) {
    const r = resultScore(result);
    if (r.total) details.push(`${result.topic}: ${r.right}/${r.total}`);
  }
  const link = `${siteUrl()}/lesson/${lesson.id}/review#homework`;

  const sends: Promise<unknown>[] = [];
  const chatId = tutor.telegram?.chatId;
  if (chatId && canNotify()) {
    sends.push(
      notify(
        chatId,
        [
          struggled
            ? `<b>${escapeHtml(student.name)}</b> finished the homework, but found it hard.`
            : `<b>${escapeHtml(student.name)}</b> finished the homework.`,
          escapeHtml(lesson.title),
          ...details.map((line, i) => escapeHtml(i === 0 && score.total > 0 ? line : `· ${line}`)),
        ].join("\n"),
      ),
    );
  }
  const address = noticeAddress(tutor);
  if (canEmail() && address) {
    sends.push(
      sendEmail({
        to: address,
        subject: struggled
          ? `${student.name} found the homework hard`
          : `${student.name} finished the homework`,
        text: [headline, lesson.title, "", ...details, "", `See the answers: ${link}`, "", OFF_TEXT].join("\n"),
        html: emailHtml(headline, lesson.title, details, link),
      }),
    );
  }
  await Promise.all(sends);
}

const OFF_TEXT = `You get this because you switched on email notices in your aloudli account. Switch them off on your account page: ${siteUrl()}/account`;

function emailHtml(headline: string, title: string, details: string[], link: string): string {
  const e = escapeHtml;
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:32rem">
<p style="font-size:18px;font-weight:600;margin:0 0 4px">${e(headline)}</p>
<p style="margin:0 0 16px;color:#57534e">${e(title)}</p>
${details.length ? `<ul style="margin:0 0 16px;padding-left:20px">${details.map((d) => `<li>${e(d)}</li>`).join("")}</ul>` : ""}
<p style="margin:0 0 24px"><a href="${e(link)}" style="color:#1f6f5c;font-weight:600">See the answers</a></p>
<p style="margin:0;font-size:13px;color:#78716c">You get this because you switched on email notices in your aloudli account. <a href="${e(siteUrl())}/account" style="color:#78716c">Switch them off</a>.</p>
</div>`;
}

/**
 * A scheduled Smart Review is ready and waits for the tutor's yes. Worth a
 * notice: with approval on, nothing reaches the child until they look.
 */
export function noticeReviewWaiting(lesson: Lesson): void {
  if (!canNotify() && !canEmail()) return;
  void (async () => {
    const student = await getStudent(lesson.studentId);
    const tutor = student && (await getTutor(student.tutorId));
    if (!student || !tutor) return;
    const headline = `A Smart Review for ${student.name} is ready for you to check.`;
    const link = `${siteUrl()}/lesson/${lesson.id}/review#homework`;
    const sends: Promise<unknown>[] = [];
    const chatId = tutor.telegram?.chatId;
    if (chatId && canNotify()) {
      sends.push(notify(chatId, `<b>${escapeHtml(student.name)}</b>: a Smart Review is ready for you to check and send.\n${escapeHtml(link)}`));
    }
    const address = noticeAddress(tutor);
    if (canEmail() && address) {
      sends.push(
        sendEmail({
          to: address,
          subject: `Smart Review for ${student.name} - check and send`,
          text: [headline, "It goes to the child once you send it.", "", link, "", OFF_TEXT].join("\n"),
          html: emailHtml(headline, "It goes to the child once you send it.", [], link),
        }),
      );
    }
    await Promise.all(sends);
  })().catch((e) => console.error("[notice] review", e));
}
