/**
 * The look of a child's homework. One entry per game children ask for.
 *
 * Adding a style means adding an entry here and a `.game-<id>` block in
 * globals.css - the homework screen itself does not change. Words are part of
 * the style too: the same screen says "quest" or "mission" depending on it.
 */
export type GameStyle = {
  id: string;
  name: string;
  words: {
    start: string;
    step: string;
    done: string;
    reward: string;
    submit: string;
  };
};

export const GAME_STYLES: GameStyle[] = [
  {
    id: "minecraft",
    name: "Minecraft",
    words: {
      start: "Start the quest",
      step: "Level",
      done: "Quest complete!",
      reward: "XP",
      submit: "Craft it",
    },
  },
];

/** Used when a student has no style picked, so homework always has a look. */
export const DEFAULT_GAME_STYLE = GAME_STYLES[0];

export function gameStyle(id: string | undefined): GameStyle {
  return GAME_STYLES.find((s) => s.id === id) ?? DEFAULT_GAME_STYLE;
}

export function isGameStyle(id: unknown): id is string {
  return typeof id === "string" && GAME_STYLES.some((s) => s.id === id);
}
