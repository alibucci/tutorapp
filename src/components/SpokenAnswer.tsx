"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAnswerMic } from "@/hooks/useAnswerMic";

/**
 * Saying an answer instead of typing it, and hearing a sentence read out.
 *
 * A spoken answer is recorded and read into text by the server (useAnswerMic),
 * the same way as the picture tasks; the recording is not kept. The sentence is
 * read by the phone's own voice. Every spoken task can still be done by typing.
 */

const subscribeNever = () => () => {};

function canSpeakAloud(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Read a sentence out in English, slowly enough to follow. */
export function ListenButton({ text, label = "Listen" }: { text: string; label?: string }) {
  const supported = useSyncExternalStore(subscribeNever, canSpeakAloud, () => false);
  if (!supported) return null;
  function play() {
    const synth = window.speechSynthesis;
    synth.cancel();
    const say = new SpeechSynthesisUtterance(text);
    say.lang = "en-US";
    say.rate = 0.9;
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("en"));
    if (voice) say.voice = voice;
    synth.speak(say);
  }
  return (
    <button type="button" onClick={play} className="game-listen" aria-label={`${label}: ${text}`}>
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
      {label}
    </button>
  );
}

/** A box to say or type an answer in. */
export function SpokenAnswer({
  value,
  onChange,
  disabled,
  multiline,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const mic = useAnswerMic();
  // The words come back after the tap; add them to what the box holds then.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const Field = multiline ? "textarea" : "input";
  return (
    <div className="mt-3">
      {mic.available && !disabled && (
        <MicButton
          listening={mic.state === "listening"}
          working={mic.state === "working"}
          busy={false}
          error={mic.error}
          onStart={() =>
            void mic.start((said) => {
              const before = valueRef.current.trim();
              onChange(before ? `${before} ${said}` : said);
            })
          }
          onStop={mic.stop}
        />
      )}
      <Field
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)}
        disabled={disabled}
        rows={multiline ? 3 : undefined}
        placeholder={placeholder ?? (mic.available ? "Or type it here" : "Type it here")}
        autoCapitalize="sentences"
        className="game-input mt-3"
      />
    </div>
  );
}

/**
 * The big microphone. Tap to talk, tap again to stop; the words appear in the
 * answer, where the child can still fix them by hand.
 */
export function MicButton({
  listening,
  working = false,
  busy,
  error,
  onStart,
  onStop,
}: {
  listening: boolean;
  /** Stopped, and the words are on their way back. */
  working?: boolean;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={listening ? onStop : onStart}
        disabled={busy || working}
        aria-pressed={listening}
        aria-label={listening ? "Stop recording" : "Say your answer"}
        className={`game-mic ${listening ? "game-mic-on" : ""}`}
      >
        {listening ? (
          <svg aria-hidden width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg aria-hidden width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
          </svg>
        )}
      </button>
      <p className="game-hint text-center min-h-[1.5rem]">
        {listening
          ? "I'm listening… tap again when you finish."
          : working
            ? "Writing down what you said…"
            : error ?? "Tap and say it - or type below."}
      </p>
    </div>
  );
}
