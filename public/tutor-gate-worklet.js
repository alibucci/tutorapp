/**
 * The tutor gate, running on the audio thread.
 *
 * This lives in an AudioWorklet rather than a requestAnimationFrame loop on
 * purpose: rAF does not fire for a hidden page, so a screen lock would freeze
 * the gate at whatever gain it happened to hold - either silencing the rest of
 * the lesson or, worse, recording the whole room unfiltered. The audio thread
 * keeps running as long as the AudioContext does, so gating stays correct while
 * the page is in the background.
 *
 * Timekeeping is in frames, not wall clock, so throttled timers cannot skew it.
 */
class TutorGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.enabled = false;
    this.threshold = 0.04;
    this.holdFrames = Math.round(0.7 * sampleRate);

    // Current and target gain. One-pole smoothing at ~20ms: an instant cut
    // clicks, a slow ramp lets the room in between words.
    this.gain = 1;
    this.targetGain = 1;
    this.coeff = 1 - Math.exp(-1 / (0.02 * sampleRate));

    this.openUntilFrame = 0;
    this.counting = false;
    this.elapsedFrames = 0;
    this.openFrames = 0;

    this.framesSincePost = 0;
    this.postEvery = Math.round(sampleRate / 24);
    this.peakSincePost = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "config") {
        this.enabled = Boolean(msg.enabled);
        if (typeof msg.threshold === "number") this.threshold = msg.threshold;
        if (typeof msg.holdMs === "number") {
          this.holdFrames = Math.round((msg.holdMs / 1000) * sampleRate);
        }
        if (!this.enabled) {
          this.targetGain = 1;
          this.openUntilFrame = Infinity;
        }
      } else if (msg.type === "start") {
        this.counting = true;
        this.elapsedFrames = 0;
        this.openFrames = 0;
      } else if (msg.type === "pause") {
        // Keep the totals, just stop adding to them.
        this.counting = false;
      } else if (msg.type === "resume") {
        this.counting = true;
      } else if (msg.type === "stop") {
        this.counting = false;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const channel = input && input[0];
    const out = output && output[0];
    if (!out) return true;

    const blockSize = out.length;

    if (!channel) {
      out.fill(0);
      this.advanceClock(blockSize, false);
      return true;
    }

    let sum = 0;
    for (let i = 0; i < blockSize; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / blockSize);
    if (rms > this.peakSincePost) this.peakSincePost = rms;

    let open = true;
    if (this.enabled) {
      if (rms >= this.threshold) {
        this.openUntilFrame = currentFrame + this.holdFrames;
      }
      open = currentFrame < this.openUntilFrame;
      this.targetGain = open ? 1 : 0;
    } else {
      this.targetGain = 1;
    }

    for (let i = 0; i < blockSize; i++) {
      this.gain += (this.targetGain - this.gain) * this.coeff;
      out[i] = channel[i] * this.gain;
    }

    this.advanceClock(blockSize, open);
    return true;
  }

  advanceClock(blockSize, open) {
    if (this.counting) {
      this.elapsedFrames += blockSize;
      if (open) this.openFrames += blockSize;
    }

    this.framesSincePost += blockSize;
    if (this.framesSincePost >= this.postEvery) {
      this.port.postMessage({
        level: this.peakSincePost,
        open,
        elapsedMs: (this.elapsedFrames / sampleRate) * 1000,
        openMs: (this.openFrames / sampleRate) * 1000,
      });
      this.framesSincePost = 0;
      this.peakSincePost = 0;
    }
  }
}

registerProcessor("tutor-gate", TutorGateProcessor);
