/**
 * Family usernames. Shared by the server (which checks and stores them) and
 * the tutor's screen (which suggests one), so the two can never disagree.
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Kazakh letters
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

/**
 * A username to offer for a student's name. Latin and Cyrillic names give a
 * readable one ("Даулет" -> "daulet"). Chinese characters cannot be turned
 * into pinyin without a dictionary, so those give "" - the tutor types it.
 */
export function suggestUsername(name: string): string {
  const first = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const latin = Array.from(first)
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
  return latin.length >= 3 ? latin.slice(0, 32) : "";
}

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase();
}
