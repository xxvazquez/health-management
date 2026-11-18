"use client";

import { useEffect, useState } from "react";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "number", "password"]);

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Taller than any accessory bar, shorter than any phone keyboard. */
const KEYBOARD_MIN_HEIGHT = 150;

/** True while the on-screen keyboard is up: a text field has focus on a
 * touch device and the visible area has shrunk. Both are needed — iOS can
 * shift the whole page up for the keyboard rather than covering it, and
 * its Done button hides the keyboard while leaving the field focused. */
export function useSoftKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia?.("(pointer: coarse)");
    let frame = 0;
    // Checked a frame later so moving between two fields doesn't flicker.
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        const covered = vv ? document.documentElement.clientHeight - vv.height * vv.scale > KEYBOARD_MIN_HEIGHT : true;
        setOpen(!!touch?.matches && covered && isTextEntry(document.activeElement));
      });
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return open;
}

/** Marks `<html data-keyboard>` while the on-screen keyboard is up, so the
 * tab bar and footer step aside like they do in native apps. */
export function SoftKeyboardFlag() {
  const open = useSoftKeyboardOpen();
  useEffect(() => {
    if (open) document.documentElement.dataset.keyboard = "";
    else delete document.documentElement.dataset.keyboard;
  }, [open]);
  return null;
}
