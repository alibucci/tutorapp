/**
 * A recording, whatever the browser made of it, as 16 kHz mono WAV.
 *
 * Browsers disagree on what MediaRecorder writes: WebM/Opus in Chrome, Arc and
 * Firefox, MP4/AAC in Safari. The recogniser is happiest with plain PCM at the
 * rate it works in, and the browser can already decode its own output - so the
 * clip is decoded here and sent as WAV, and the server never has to care which
 * browser it came from. A minute of it is about 2 MB.
 */

const RATE = 16_000;

/** Null when the clip is too short to hold a word. */
export async function toSpeechWav(clip: Blob): Promise<Blob | null> {
  const bytes = await clip.arrayBuffer();
  if (bytes.byteLength === 0) return null;
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes);
  const length = Math.ceil(decoded.duration * RATE);
  if (length < RATE / 4) return null;

  // A one-channel context mixes down whatever the recording had.
  const ctx = new OfflineAudioContext(1, length, RATE);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return encodeWav(rendered.getChannelData(0));
}

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
