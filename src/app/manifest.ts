import type { MetadataRoute } from "next";
import { getFamilySession } from "@/lib/auth";
import { appManifest } from "@/lib/appManifest";

/**
 * The site's manifest: a child signed in with their own password opens on
 * their page, everyone else on the home page. Pages reached by private link
 * point at their own manifest instead (see app.webmanifest beside them).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return appManifest((await getFamilySession()) ? "/me" : "/");
}
