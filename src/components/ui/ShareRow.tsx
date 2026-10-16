"use client";

import { useEffect, useState } from "react";
import { shareOrCopy, type ShareContent } from "@/lib/share";

/** A "Share …" row for a record's sheet (Contacts' Share Contact). Opens the
 * system share sheet, or copies and says so where there isn't one. */
export function ShareRow({
  label,
  content,
  accent,
  align = "start",
}: {
  label: string;
  content: () => ShareContent;
  accent: string;
  align?: "start" | "center";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function share() {
    if ((await shareOrCopy(content())) === "copied") setCopied(true);
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`flex min-h-11 w-full items-center px-3.5 text-sm font-medium ${align === "center" ? "justify-center" : "text-left"}`}
      style={{ color: accent }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
