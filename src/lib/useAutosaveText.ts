"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A text field that saves itself: on blur (wire `commit` to `onBlur`),
 * when it unmounts, and when the app goes to the background — a phone can
 * close a backgrounded app without ever blurring the field. Only a changed,
 * trimmed value is saved. */
export function useAutosaveText(initial: string, onSave: (text: string) => void) {
  const [text, setTextState] = useState(initial);
  const saved = useRef(initial.trim());
  const latest = useRef(initial);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const commit = useCallback(() => {
    const next = latest.current.trim();
    if (next === saved.current) return;
    saved.current = next;
    onSaveRef.current(next);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") commit();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      commit();
    };
  }, [commit]);

  const setText = useCallback((value: string) => {
    latest.current = value;
    setTextState(value);
  }, []);

  return { text, setText, commit };
}
