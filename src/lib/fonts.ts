import { Figtree, Press_Start_2P } from "next/font/google";

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
