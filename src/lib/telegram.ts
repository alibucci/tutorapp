/**
 * Telegram, used as a notice board rather than a push service.
 *
 * The whole thing is HTTP calls to one address - no library, no webhook, no
 * second process. That matters for where this runs: the server is in Hong
 * Kong and reaches Telegram fine, while a tutor in mainland China may need a
 * VPN to *read* the message. Telegram keeps messages until the client fetches
 * them, so a tutor who connects hours later still sees everything, with the
 * original times. Nothing is lost by being offline; only the live popup is.
 *
 * The site's own feed stays the source of truth. If Telegram is unreachable
 * when something happens, the message is dropped rather than queued: a queue
 * would be a second system to keep true, for a convenience.
 */

import { randomBytes } from "crypto";

const API = "https://api.telegram.org";

function token(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

/** Without a bot token the feature does not exist anywhere in the UI. */
export function canNotify(): boolean {
  return token().length > 0;
}

type Reply<T> = { ok: boolean; result?: T; description?: string };

async function call<T>(method: string, body?: unknown): Promise<T | null> {
  if (!canNotify()) return null;
  try {
    const res = await fetch(`${API}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    const reply = (await res.json()) as Reply<T>;
    if (!reply.ok) {
      console.error(`[telegram] ${method}: ${reply.description ?? res.status}`);
      return null;
    }
    return reply.result ?? null;
  } catch (e) {
    console.error(`[telegram] ${method} failed`, e);
    return null;
  }
}

/** The bot's @name, for building the link a tutor taps. Asked once. */
let botName: string | null = null;
export async function botUsername(): Promise<string | null> {
  if (botName) return botName;
  const me = await call<{ username?: string }>("getMe");
  botName = me?.username ?? null;
  return botName;
}

/** Send one message. Never throws: a lost notice must not break a request. */
export async function notify(chatId: string, text: string): Promise<void> {
  await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

type Update = {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id: number; first_name?: string; username?: string };
  };
};

/**
 * Where we have read up to in the bot's update queue.
 *
 * In memory on purpose: losing it on a restart only means re-reading a few
 * old updates, and a link code is single-use and short-lived, so nothing can
 * be linked twice by a replayed message.
 */
let offset = 0;

/**
 * Look for someone who has just pressed Start with this code.
 *
 * Telegram hands updates to whoever asks first, so two tutors linking in the
 * same few seconds can take each other's updates. With a handful of tutors
 * that is a retry, not a problem; a second server would need a real webhook.
 */
export async function findLinker(
  code: string,
): Promise<{ chatId: string; name: string } | null> {
  const updates = await call<Update[]>("getUpdates", {
    offset: offset || undefined,
    timeout: 0,
    allowed_updates: ["message"],
  });
  if (!updates?.length) return null;

  offset = Math.max(...updates.map((u) => u.update_id)) + 1;

  for (const update of updates) {
    const text = update.message?.text?.trim() ?? "";
    const chat = update.message?.chat;
    if (!chat) continue;
    // Telegram sends "/start <code>" when the deep link is tapped.
    if (text === `/start ${code}` || text === code) {
      return {
        chatId: String(chat.id),
        name: chat.first_name ?? chat.username ?? "Telegram",
      };
    }
  }
  return null;
}

/**
 * A link code. Properly random, not Math.random: whoever presents this code
 * gets wired to a tutor's account, so guessing one must not be possible.
 */
export function linkCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12), (b) => alphabet[b % alphabet.length]).join("");
}
