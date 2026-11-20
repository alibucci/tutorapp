/**
 * The fixed lines code adds to a parent's WeChat message: the child's own
 * words, and the link to the parent's page. Never written by the model, so a
 * quote cannot be invented and a link cannot be mangled.
 *
 * Pure: the server builds the message with these, and the review page adds
 * the link when the tutor copies it. Victor checks the Chinese wording with a
 * native speaker; change it here and nowhere else.
 */

/** The child's words stay in English in both versions. */
export function quoteLine(name: string, quote: string): { en: string; zh: string } {
  return {
    en: `Today ${name} said: “${quote}”`,
    zh: `今天${name}说了：“${quote}”`,
  };
}

/**
 * The parent's page, added at the moment of copying and never stored: a new
 * pair of links makes a stored one dead.
 */
export function parentLinkLine(url: string): { en: string; zh: string } {
  return {
    en: `Weekly notes are here: ${url}`,
    zh: `每周学习报告在这里：${url}`,
  };
}
