"use client";

import { useState, useSyncExternalStore } from "react";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";

/**
 * Saying an answer instead of typing it, and hearing a sentence read out.
 *
 * Both stay in the browser: speech becomes text through the browser's own
 * recogniser, the same one the picture tasks use, and the sentence is read by
 * the phone's own voice. No recording is made or kept. Where the browser has
 * neither, the learner types - every spoken task can be done by typing.
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
  const speech = useSpeechTranscript("en-US");
  const [listening, setListening] = useState(false);

  async function stop() {
    setListening(false);
    const said = (await speech.stopAndFlush()).map((s) => s.text).join(" ").trim();
    if (said) onChange(value.trim() ? `${value.trim()} ${said}` : said);
  }

  const Field = multiline ? "textarea" : "input";
  return (
    <div className="mt-3">
      {speech.supported && !disabled && (
        <MicButton
          listening={listening}
          busy={false}
          interim={listening ? speech.interim : ""}
          error={listening ? null : speech.error}
          onStart={() => {
            speech.start();
            setListening(true);
          }}
          onStop={() => void stop()}
        />
      )}
      <Field
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)}
        disabled={disabled}
        rows={multiline ? 3 : undefined}
        placeholder={placeholder ?? (speech.supported ? "Or type it here" : "Type it here")}
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
  busy,
  interim,
  error,
  onStart,
  onStop,
}: {
  listening: boolean;
  busy: boolean;
  interim: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={listening ? onStop : onStart}
        disabled={busy}
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
          ? interim || "I'm listening… tap again when you finish."
          : error
            ? "The microphone did not work. You can type instead."
            : "Tap and say it - or type below."}
      </p>
    </div>
  );
}
