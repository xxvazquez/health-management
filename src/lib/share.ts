export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Opens the system share sheet where there is one (iPhone, Android,
 * desktop Chrome on macOS/Windows); elsewhere copies the text and link. */
export async function shareOrCopy(content: ShareContent): Promise<ShareResult> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav?.share && (!nav.canShare || nav.canShare(content))) {
    try {
      await nav.share(content);
      return "shared";
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return "cancelled";
      // Not allowed here (no user gesture, policy) — fall back to copying.
    }
  }
  const plain = [content.text, content.url].filter(Boolean).join("\n");
  if (!plain || !nav?.clipboard) return "failed";
  try {
    await nav.clipboard.writeText(plain);
    return "copied";
  } catch {
    return "failed";
  }
}
