import type { MetadataRoute } from "next";

/**
 * What "Add to Home Screen" / "Install app" makes of the site: the aloudli
 * icon, and a window of its own without the browser's bars. `start` is where
 * the icon opens: the tutor's home, a signed-in child's page, or the private
 * link a parent or child added it from - never a sign-in page they cannot pass.
 */
export function appManifest(start: string): MetadataRoute.Manifest {
  return {
    // Each start is its own app, so a parent's icon and a tutor's on one
    // device do not replace each other.
    id: start,
    name: "aloudli",
    short_name: "aloudli",
    description: "Lessons, homework and notes for home.",
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f7b63",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** The manifest for a page reached by private link, served beside it. */
export function linkManifest(start: string): Response {
  return new Response(JSON.stringify(appManifest(start)), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
