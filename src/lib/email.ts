/**
 * Email, sent through Resend's HTTP API (api.resend.com).
 *
 * One request per message, no library, no queue - the same shape as the
 * Telegram notices. It exists because Telegram needs a VPN to read in
 * mainland China, and every tutor already has an email address: it is their
 * login. If the send fails the message is dropped and logged; the site's own
 * pages stay the source of truth.
 *
 * The domain is verified with Resend (DKIM and SPF on aloudli.com), so mail
 * arrives as from aloudli rather than from a stranger.
 */

const API = "https://api.resend.com/emails";

const key = () => process.env.RESEND_API_KEY ?? "";

/** Without a key, email does not exist anywhere in the app. */
export function canEmail(): boolean {
  return key().length > 0;
}

/** Who the mail says it is from. The domain must be the one verified. */
const from = () => process.env.MAIL_FROM ?? "aloudli <notices@aloudli.com>";

/** The site's own address, for links in a message. */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "https://aloudli.com").replace(/\/+$/, "");
}

/**
 * Addresses that can never receive mail (RFC 2606): the test suite's tutors
 * live there. Sending to them would only bounce, and bounces cost the
 * domain its good name with the mail providers.
 */
function deliverable(to: string): boolean {
  return !/\.(test|example|invalid|localhost)$/i.test(to.trim());
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (!canEmail() || !deliverable(message.to)) return false;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: from(), ...message }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      console.error("[email]", res.status, body?.message ?? "");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email]", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Text safe to put inside HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
