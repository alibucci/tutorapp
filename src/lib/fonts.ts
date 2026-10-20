import { Bebas_Neue, Figtree, Fredoka, Press_Start_2P } from "next/font/google";

/**
 * The blocky game font. Self-hosted at build time - the browser fetches
 * nothing from Google, which matters for children in China.
 */
export const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

/** The interface font. Bundled the same way, for the same reason. */
export const uiFont = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

/**
 * Two theme fonts, bundled like the rest. Not preloaded: a child sees one
 * theme, and the other two would be downloads for nothing.
 */
/** Basketball: scoreboard lettering. Capitals only, so short words only. */
export const sportFont = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-sport",
  display: "swap",
  preload: false,
});

/** The animal city: round and friendly, readable at length. */
export const roundFont = Fredoka({
  subsets: ["latin"],
  variable: "--font-round",
  display: "swap",
  preload: false,
});

/** Every game font, on the elements a theme can restyle. */
export const gameFonts = [pixelFont.variable, sportFont.variable, roundFont.variable].join(" ");
