/**
 * The look of a child's homework. One entry per theme children ask for.
 *
 * Adding a theme means adding an entry here - nothing else. Its pictures are
 * drawn in `imageStyle`, its words appear on the game screen, and its
 * `palette` colours a shared game skin. A theme can instead name a bespoke
 * `skin` with its own textures in globals.css, which only Minecraft has.
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
    /** The line above "done" when the homework is handed in. */
    cheer: string;
  };
  /**
   * Colours for the shared skin. `ground` is behind everything, `panel` holds
   * the text, `accent` is buttons and progress; `ink` and `accentInk` are the
   * text on panel and on accent. Keep 4.5:1 contrast on both pairs.
   */
  palette: {
    ground: string;
    panel: string;
    ink: string;
    accent: string;
    accentInk: string;
  };
  /** A hand-made skin in globals.css. Without one, the palette skin is used. */
  skin?: "minecraft";
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
      cheer: "Achievement get!",
    },
    palette: {
      ground: "#3b2a1d",
      panel: "#c6c6c6",
      ink: "#1d1d1d",
      accent: "#5b9b2c",
      accentInk: "#ffffff",
    },
    skin: "minecraft",
  },
  {
    id: "fairytale",
    name: "Fairy tale",
    imageStyle:
      "storybook illustration: soft watercolour and gouache, warm pastel colours, gentle hand-drawn outlines, cosy fairy-tale village, round friendly characters, golden evening light, children's picture book look",
    words: {
      start: "Open the story",
      step: "Page",
      done: "The story is finished!",
      reward: "stars",
      submit: "Finish the story",
      cheer: "Well done!",
    },
    palette: {
      ground: "#3b2f6b",
      panel: "#fffaf0",
      ink: "#2a2340",
      accent: "#f2b632",
      accentInk: "#2a2340",
    },
  },
];

/** The skin class for a theme: its own, or the shared palette one. */
export function skinOf(style: GameStyle): string {
  return style.skin ?? "palette";
}

/** The palette as CSS variables, for the shared skin to read. */
export function paletteVars(style: GameStyle): Record<string, string> {
  const p = style.palette;
  return {
    "--g-ground": p.ground,
    "--g-panel": p.panel,
    "--g-ink": p.ink,
    "--g-accent": p.accent,
    "--g-accent-ink": p.accentInk,
  };
}

/** Used when a student has no style picked, so homework always has a look. */
export const DEFAULT_GAME_STYLE = GAME_STYLES[0];

export function gameStyle(id: string | undefined): GameStyle {
  return GAME_STYLES.find((s) => s.id === id) ?? DEFAULT_GAME_STYLE;
}

export function isGameStyle(id: unknown): id is string {
  return typeof id === "string" && GAME_STYLES.some((s) => s.id === id);
}
