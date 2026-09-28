"use client";

/**
 * Sends recorder chunks to the server as they arrive.
 *
 * Strictly one request at a time and strictly in order: the file is built by
 * appending, so a chunk that overtakes another corrupts everything after it.
 * A failed chunk is retried before the queue moves on, for the same reason - a
 * hole makes the rest of the recording undecodable.
 *
 * The queue is the reason a crashed tab now costs the last second or two
 * instead of the whole lesson.
 */
export class ChunkUploader {
  private queue: Blob[] = [];
  private seq = 0;
  private running = false;
  private failed = false;

  constructor(
    private lessonId: string,
    private kind: "lesson" | "debrief",
    private onState: (state: { pending: number; failed: boolean }) => void,
  ) {}

  /** Hand a chunk over. Returns immediately; sending happens in the background. */
  add(chunk: Blob): void {
    this.queue.push(chunk);
    this.report();
    void this.drain();
  }

  /** Resolves once everything queued has landed, or the wait runs out. */
  async flush(timeoutMs = 20_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length > 0 || this.running) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return this.queue.length === 0 && !this.failed;
  }

  private report() {
    this.onState({ pending: this.queue.length, failed: this.failed });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const chunk = this.queue[0];
      const sent = await this.send(chunk, this.seq);

      if (sent) {
        this.queue.shift();
        this.seq++;
      } else {
        // Give up on this chunk rather than stall forever, but say so: the
        // recording is damaged from here on and the tutor needs to know.
        this.queue.shift();
        this.seq++;
        this.failed = true;
      }
      this.report();
    }

    this.running = false;
  }

  private async send(chunk: Blob, seq: number): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const form = new FormData();
        form.append("kind", this.kind);
        form.append("seq", String(seq));
        form.append("audio", chunk, `${this.kind}.webm`);

        const res = await fetch(`/api/lessons/${this.lessonId}/audio`, {
          method: "POST",
          body: form,
        });
        if (res.ok) return true;
        // A rejected chunk will be rejected again; only retry transient failures.
        if (res.status >= 400 && res.status < 500) return false;
      } catch {
        // Network dropped - worth another go.
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return false;
  }
}
