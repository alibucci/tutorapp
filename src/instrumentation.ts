/**
 * Runs once when a server starts. The learning schedule's runner lives in
 * Node only; the edge runtime has no timers worth the name and no files.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
