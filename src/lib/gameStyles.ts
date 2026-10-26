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
    /** The heading over a new homework. "New quest!" when not set. */
    heading?: string;
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
  {
    id: "basketball",
    name: "Basketball",
    imageStyle:
      "bold sporty cartoon illustration: indoor basketball court with a polished wooden floor, orange basketball, hoop and net, bright arena lights, energetic action poses, clean vector shapes, vivid orange and navy colours",
    words: {
      start: "Tip off",
      step: "Round",
      done: "Game won!",
      reward: "points",
      submit: "Take the shot",
      cheer: "Slam dunk!",
      heading: "Game day!",
    },
    palette: {
      ground: "#14213d",
      panel: "#fff7ed",
      ink: "#1c1917",
      accent: "#c2410c",
      accentInk: "#ffffff",
    },
  },
  {
    id: "zootopia",
    // The name children ask for. The pictures below describe a city of
    // animals in general - no film, studio or character - for the reason
    // given on `imageStyle`.
    name: "Zootopia",
    imageStyle:
      "polished 3D animated film look: a bustling modern city where animals walk upright and wear clothes - rabbits, foxes, sloths, giraffes, elephants - districts of rainforest, desert and snowy streets, warm cinematic lighting, expressive friendly faces, soft rendered fur",
    words: {
      start: "Open the case",
      step: "Clue",
      done: "Case closed!",
      reward: "badges",
      submit: "Crack the case",
      cheer: "Great detective work!",
      heading: "New case!",
    },
    palette: {
      ground: "#0f3d3e",
      panel: "#fdf6e9",
      ink: "#1f2a2e",
      accent: "#f2a541",
      accentInk: "#1f2a2e",
    },
  },
  {
    id: "avengers",
    // The team children ask for. Pictures and art describe superheroes in
    // general - no studio, team logo or character - for the reason given on
    // `imageStyle`. The games' text may name heroes the child loves.
    name: "Avengers",
    imageStyle:
      "bold comic-book illustration: thick black ink outlines, halftone dots, superheroes in capes and armour in dynamic action poses over a modern city at night, glowing energy blasts, searchlights, red, gold and navy colours, dramatic angles",
    words: {
      start: "Assemble the team!",
      step: "Mission",
      done: "Mission complete!",
      reward: "stars",
      submit: "Save the day",
      cheer: "POW!",
      heading: "Hero alert!",
    },
    palette: {
      ground: "#14162b",
      panel: "#fff8e7",
      ink: "#1a1a2e",
      accent: "#c1121f",
      accentInk: "#ffffff",
    },
  },
];

/**
 * The theme's own class, beside its skin. A palette theme with pictures of its
 * own - a court, a city - hangs them on this in globals.css, on top of the
 * shared palette skin.
 */
export function themeOf(style: GameStyle): string {
  return `theme-${style.id}`;
}

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
