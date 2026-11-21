import type { Session } from "./auth";
import { christianityOpenTo } from "./christianity";
import { quoteOpenTo } from "./parentMessage";
import { plansOpenTo } from "./tutorList";
import type { HelpAccess } from "./help";

/** Which gated features this tutor has, so Help shows only what they can use. */
export async function helpAccess(session: Session): Promise<HelpAccess> {
  const [plans, stories, quote] = await Promise.all([
    plansOpenTo(session.id),
    christianityOpenTo(session),
    quoteOpenTo(session.id),
  ]);
  return { plans, stories, quote };
}
