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
  /**
   * How pictures in this style are described to the image model. Never the
   * game's name or its characters: the service refuses prompts it reads as
   * trademark use, and we should not be asking for them anyway.
   */
  imageStyle: string;
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
    imageStyle:
      "3D voxel art: a blocky world built entirely from cubes, cube-shaped trees, square sun, blocky characters with square heads, pixelated textures, bright saturated colours, soft daylight, video game screenshot look",
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
