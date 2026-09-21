"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SPEECH_LANG, formatSpoken, joinSpoken, recognitionConstructor, speechErrorMessage, transcriptOf, type Recognition } from "./speech";

const noop = () => () => {};

/**
 * Talk instead of type. While it listens, what is heard is put after whatever was already typed, live,
 * through `onText`; the person reads it and sends it as usual. `supported` is false where the browser
 * has no speech recognition, so the button simply doesn't appear there.
 */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noop, () => recognitionConstructor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latestOnText = useRef(onText);
  useEffect(() => {
    latestOnText.current = onText;
  });

  // A message about the microphone is only worth showing for a moment.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const stop = useCallback(() => recognition.current?.stop(), []);

  const start = useCallback((typed: string) => {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = SPEECH_LANG;
    rec.interimResults = true; // show words as they are recognised
    rec.continuous = false; // stops by itself after a pause
    rec.maxAlternatives = 1;
    let heard = "";
    // Live: the raw words as they come. At the end: the finished sentence (capital letter, . or ?).
    rec.onresult = (e) => {
      heard = transcriptOf(e);
      latestOnText.current(joinSpoken(typed, heard));
    };
    rec.onerror = (e) => setError(speechErrorMessage(e.error));
    rec.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard) latestOnText.current(joinSpoken(typed, formatSpoken(heard, typed.trim() !== "" && !/[.?!…]$/.test(typed.trim()))));
    };
    recognition.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setError(speechErrorMessage("unknown")); // e.g. started twice
    }
  }, []);

  const toggle = useCallback((typed: string) => (recognition.current ? stop() : start(typed)), [start, stop]);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, listening, error, toggle, stop };
}
