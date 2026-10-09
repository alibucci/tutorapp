import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ship a self-contained bundle instead of building on the server.
   *
   * The box has two cores and 2 GB, and building there took the site down for
   * two minutes a time while every difference between it and a development
   * machine - cache state, memory, HOME, session lifetime - surfaced as its
   * own separate failure. `standalone` emits a server that runs with no
   * node_modules install at all, so a release becomes copy and restart.
   */
  output: "standalone",

  /**
   * Keep the lesson store out of the bundle.
   *
   * File tracing follows `process.cwd()/data` in the store and sweeps whatever
   * happens to be in it on the build machine - transcripts and audio of real
   * lessons - into the release. That would ship a developer's recordings to
   * production. The server keeps its own `data`, symlinked in at release time.
   */
  outputFileTracingExcludes: {
    "**/*": ["./data/**"],
  },
};

export default nextConfig;
