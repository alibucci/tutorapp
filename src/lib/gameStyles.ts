import { lookFor } from "./profile";
import type { SentStyle, Student } from "./types";

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
  /**
   * The two things a child counts in math practice, one for each side of a
   * sum. They have to look different at a glance, and from each other in a
   * row of ten, so 8 + 5 shows where one number stops.
   */
  mathItems: [string, string];
  /** A hand-made skin in globals.css. Without one, the palette skin is used. */
  skin?: "minecraft";
  /**
   * For a learner past the age of games: the same colours, but no points,
   * quests or levels, and plain words on every button.
   */
  plain?: boolean;
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
    mathItems: ["/game/minecraft/dirt.svg", "/game/minecraft/diamond-ore.svg"],
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
    mathItems: ["/game/fairytale/crown.svg", "/game/fairytale/mushroom.svg"],
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
    mathItems: ["/game/basketball/ball.svg", "/game/basketball/ball-blue.svg"],
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
    mathItems: ["/game/zootopia/paw-ink.svg", "/game/zootopia/badge.svg"],
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
    mathItems: ["/game/avengers/star.svg", "/game/avengers/emblem.svg"],
    palette: {
      ground: "#14162b",
      panel: "#fff8e7",
      ink: "#1a1a2e",
      accent: "#c1121f",
      accentInk: "#ffffff",
    },
  },
];

/** Any theme, as words for someone too old for a game. */
export const PLAIN_WORDS: GameStyle["words"] = {
  start: "Start",
  step: "Task",
  done: "Homework done.",
  reward: "correct",
  submit: "Check",
  cheer: "Well done",
  heading: "Homework",
};

/** For a learner with no theme of their own and no game: calm and neutral. */
export const PLAIN_STYLE: GameStyle = {
  id: "plain",
  name: "Clean",
  imageStyle:
    "clean modern editorial illustration: realistic proportions, calm natural colours, soft daylight, uncluttered composition",
  words: PLAIN_WORDS,
  mathItems: ["/game/plain/dot.svg", "/game/plain/square.svg"],
  palette: {
    ground: "#eef1f5",
    panel: "#ffffff",
    ink: "#1f2933",
    accent: "#1f6f5c",
    accentInk: "#ffffff",
  },
};

/**
 * The look of this learner's homework: the theme the tutor picked, or the one
 * made for them, and without the game for someone too old for it.
 */
export function styleFor(student: Pick<Student, "gameStyle" | "customStyle" | "profile">): GameStyle {
  const custom = student.customStyle;
  const plain = lookFor(student.profile) === "plain";
  const base: GameStyle =
    student.gameStyle === "custom" && custom
      ? {
          id: "custom",
          name: custom.name,
          imageStyle: custom.imageStyle,
          words: custom.words,
          palette: custom.palette,
          // Its own pictures cannot be drawn ahead; counters in its colours.
          mathItems: PLAIN_STYLE.mathItems,
        }
      : student.gameStyle
        ? gameStyle(student.gameStyle)
        : plain
          ? PLAIN_STYLE
          : DEFAULT_GAME_STYLE;
  if (!plain) return base;
  // Its colours, nothing else: no blocks, no court, no quest.
  return { ...base, words: PLAIN_WORDS, skin: undefined, plain: true };
}

/** What a homework keeps of its look when it is sent. */
export function sentStyle(style: GameStyle): SentStyle {
  return {
    id: style.id,
    name: style.name,
    imageStyle: style.imageStyle,
    words: style.words,
    palette: style.palette,
    ...(style.skin && { skin: style.skin }),
    ...(style.plain && { plain: true }),
  };
}

/** A sent homework's look, back as a theme to draw it with. */
export function fromSent(sent: SentStyle): GameStyle {
  const preset = GAME_STYLES.find((s) => s.id === sent.id);
  return {
    ...sent,
    mathItems: preset?.mathItems ?? PLAIN_STYLE.mathItems,
  };
}

/** WCAG contrast between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * A palette that passes 4.5:1 on both pairs. Text that fails becomes black or
 * white, whichever reads; an accent too pale or too dark for either is pulled
 * towards black until white on it reads.
 */
export function readablePalette(p: GameStyle["palette"]): GameStyle["palette"] {
  const pick = (bg: string, ink: string) =>
    contrast(ink, bg) >= 4.5
      ? ink
      : contrast("#111111", bg) >= contrast("#ffffff", bg)
        ? "#111111"
        : "#ffffff";
  let accent = p.accent;
  for (let i = 0; i < 12 && Math.max(contrast("#111111", accent), contrast("#ffffff", accent)) < 4.5; i++) {
    accent = mix(accent, "#000000", 0.15);
  }
  return {
    ground: p.ground,
    panel: p.panel,
    ink: pick(p.panel, p.ink),
    accent,
    accentInk: pick(accent, p.accentInk),
  };
}

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The theme's own class, beside its skin. A palette theme with pictures of its
 * own - a court, a city - hangs them on this in globals.css, on top of the
 * shared palette skin.
 */
export function themeOf(style: GameStyle): string {
  // The plain look keeps a theme's colours, not its pictures.
  return style.plain ? "theme-plain" : `theme-${style.id}`;
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
