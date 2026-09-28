"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChunkUploader } from "@/lib/client";
import type { CaptureInterruption } from "@/lib/types";

export type GateOptions = {
  /** RMS (0..1) the tutor's voice must exceed for audio to be written. */
  threshold: number;
  /** How long the gate stays open after the level drops below threshold. */
  holdMs: number;
};

export type RecorderState =
  | "idle"
  | "ready"
  | "recording"
  | "paused"
  | "stopped";

/** Why the recording paused on its own, if it did. */
export type AutoPauseReason = "screen-off" | null;

type Options = {
  /** Classroom mode gates the signal so only near-mic speech is written. */
  gate?: GateOptions | null;
  /** Fired when the recording pauses itself, so callers can stop their own work. */
  onAutoPause?: (reason: NonNullable<AutoPauseReason>) => void;
  /**
   * Where to stream chunks. Without it the recorder still works but nothing is
   * kept - which is what the device check page wants.
   */
  upload?: { lessonId: string; kind: "lesson" | "debrief" };
};

type MeterMessage = {
  level: number;
  open: boolean;
  elapsedMs: number;
  openMs: number;
};

const WORKLET_URL = "/tutor-gate-worklet.js";

/**
 * Captures the tutor's microphone only.
 *
 * Signal path: mic -> AudioWorklet (measure + gate) -> MediaRecorder. All
 * metering, gating and timekeeping happen on the audio thread, so a hidden page
 * or a locked screen cannot freeze them - see public/tutor-gate-worklet.js.
 *
 * What the audio thread cannot survive is the capture itself being torn down,
 * which is what iOS does on lock. Those events are recorded as interruptions
 * rather than passing silently.
 */
export function useTutorRecorder(options: Options = {}) {
  const { gate = null, onAutoPause, upload } = options;

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [gateOpen, setGateOpen] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [openMs, setOpenMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [interruptions, setInterruptions] = useState<CaptureInterruption[]>([]);
  /** Chunks still on their way to the server, and whether any were lost. */
  const [pending, setPending] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [autoPaused, setAutoPaused] = useState<AutoPauseReason>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const uploaderRef = useRef<ChunkUploader | null>(null);
  const moduleLoadedRef = useRef(false);
  const recordingRef = useRef(false);
  const onAutoPauseRef = useRef(onAutoPause);

  useEffect(() => {
    onAutoPauseRef.current = onAutoPause;
  }, [onAutoPause]);

  /** Only worth flagging while the tape is rolling. */
  const noteInterruption = useCallback((kind: CaptureInterruption["kind"]) => {
    if (!recordingRef.current) return;
    setInterruptions((prev) =>
      prev.length && prev[prev.length - 1].kind === kind
        ? prev
        : [...prev, { at: new Date().toISOString(), kind }],
    );
  }, []);

  const gateRef = useRef(gate);

  /** Hand the worklet the current gate settings. */
  const pushConfig = useCallback((g: GateOptions | null) => {
    nodeRef.current?.port.postMessage({
      type: "config",
      enabled: g !== null,
      threshold: g?.threshold,
      holdMs: g?.holdMs,
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput"));
  }, []);

  /** Asks for the mic, builds the graph, and starts metering. */
  const arm = useCallback(
    async (id?: string) => {
      setError(null);
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: id ? { exact: id } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        streamRef.current = stream;

        const track = stream.getAudioTracks()[0];
        // iOS fires these when the audio session is taken away on lock.
        track?.addEventListener("mute", () => noteInterruption("track-muted"));
        track?.addEventListener("ended", () => noteInterruption("track-ended"));

        await refreshDevices();
        const actual = track?.getSettings().deviceId;
        if (actual) setDeviceId(actual);

        const ctx = ctxRef.current ?? new AudioContext();
        ctxRef.current = ctx;
        ctx.onstatechange = () => {
          if (ctx.state !== "running") noteInterruption("audio-suspended");
        };
        if (ctx.state !== "running") await ctx.resume();

        if (!moduleLoadedRef.current) {
          await ctx.audioWorklet.addModule(WORKLET_URL);
          moduleLoadedRef.current = true;
        }

        const source = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "tutor-gate", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        node.port.onmessage = (event: MessageEvent<MeterMessage>) => {
          const { level: l, open, elapsedMs: e, openMs: o } = event.data;
          setLevel(l);
          setGateOpen(open);
          if (recordingRef.current) {
            setElapsedMs(e);
            setOpenMs(o);
          }
        };
        const dest = ctx.createMediaStreamDestination();

        source.connect(node);
        node.connect(dest);
        nodeRef.current = node;
        pushConfig(gateRef.current);

        const recorder = new MediaRecorder(dest.stream, {
          mimeType: pickMimeType(),
          // Mono speech is transparent well below the browser default, and this
          // is uploaded over mobile data.
          audioBitsPerSecond: 24000,
        });
        // Each chunk goes out as it arrives rather than accumulating in the
        // tab, so nothing is waiting to be lost and there is no upload to sit
        // through at the end of a lesson.
        recorder.ondataavailable = (e) => {
          if (e.data.size === 0) return;
          uploaderRef.current?.add(e.data);
        };
        recorderRef.current = recorder;

        setState("ready");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not open the microphone.",
        );
        setState("idle");
      }
    },
    [refreshDevices, noteInterruption, pushConfig],
  );

  useEffect(() => {
    gateRef.current = gate;
    pushConfig(gate);
  }, [gate, pushConfig]);

  const start = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "recording") return;

    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "running") await ctx.resume();

    uploaderRef.current = upload
      ? new ChunkUploader(upload.lessonId, upload.kind, (state) => {
          setPending(state.pending);
          setUploadFailed(state.failed);
        })
      : null;
    setPending(0);
    setUploadFailed(false);
    setElapsedMs(0);
    setOpenMs(0);
    setInterruptions([]);
    setAutoPaused(null);
    recordingRef.current = true;
    nodeRef.current?.port.postMessage({ type: "start" });
    recorder.start(1000);
    setState("recording");
  }, [upload]);

  const pause = useCallback(
    (reason: AutoPauseReason = null) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return;
      recordingRef.current = false;
      nodeRef.current?.port.postMessage({ type: "pause" });
      recorder.pause();
      setAutoPaused(reason);
      setState("paused");
    },
    [],
  );

  const resume = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;

    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "running") await ctx.resume();

    recordingRef.current = true;
    nodeRef.current?.port.postMessage({ type: "resume" });
    recorder.resume();
    setAutoPaused(null);
    setState("recording");
  }, []);

  /** Stops, then waits for the tail of the queue. Resolves false if any chunk
   *  was lost, so the caller can tell the tutor rather than pretend. */
  const stop = useCallback(async (): Promise<boolean> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return true;
    recordingRef.current = false;
    nodeRef.current?.port.postMessage({ type: "stop" });
    recorder.stop();
    setState("stopped");
    return (await uploaderRef.current?.flush()) ?? true;
  }, []);

  // A hidden page means the screen went off or the tutor switched apps. The
  // tutor cannot see the gate indicator, and on iOS the capture is about to be
  // torn down anyway - so stop cleanly here rather than record something we
  // cannot vouch for. Everything captured so far is kept; resuming is one tap.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "hidden") return;
      if (recorderRef.current?.state !== "recording") return;
      noteInterruption("page-hidden");
      pause("screen-off");
      onAutoPauseRef.current?.("screen-off");
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [noteInterruption, pause]);

  const release = useCallback(() => {
    recordingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    moduleLoadedRef.current = false;
  }, []);

  useEffect(() => release, [release]);

  return {
    devices,
    deviceId,
    state,
    level,
    gateOpen,
    elapsedMs,
    openMs,
    error,
    pending,
    uploadFailed,
    interruptions,
    autoPaused,
    arm,
    start,
    pause,
    resume,
    stop,
    release,
    refreshDevices,
  };
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}
