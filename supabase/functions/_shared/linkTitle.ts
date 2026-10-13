// Fetches a web page server-side and returns its title (og:title, else
// <title>) — for the Wishlist's "add link" form and the share shortcut.
// Returns null for anything it can't or shouldn't fetch.

/** Block obviously-internal targets so this can't be turned into a request
 * proxy into the project's own network. Hostname-only — a domain that
 * resolves to a private address slips through (redirects are checked hop by hop), which is an acceptable risk
 * for a two-person app; the platform also restricts egress. */
function isDisallowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  // IPv6 literals other than public ones, and bare-number hosts (2130706433 = 127.0.0.1).
  if (/^\[(::|f[cd]|fe[89ab])/.test(h) || /^\[::ffff:/.test(h) || /^(0x[0-9a-f]+|\d+)$/.test(h)) return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function safeFromCodePoint(code: number): string {
  try {
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

function extractTitle(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  const raw = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;
  const title = decodeEntities(raw).replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 300) : null;
}

const MAX_REDIRECTS = 5;

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }
  if ((target.protocol !== "http:" && target.protocol !== "https:") || isDisallowedHost(target.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    // Redirects are followed by hand so every hop gets the same host check.
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LauvaBot/1.0; +https://lauva.pl)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      res.body?.cancel().catch(() => {});
      res = null;
      try {
        target = new URL(location, target);
      } catch {
        return null;
      }
      if ((target.protocol !== "http:" && target.protocol !== "https:") || isDisallowedHost(target.hostname)) return null;
    }
    if (!res || !res.ok || !res.body) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|xml/i.test(contentType)) return null;

    // Read at most ~256 KB — a <title> lives in <head>, near the top.
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let html = "";
    let read = 0;
    while (read < 262_144) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html) || /<\/title>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return extractTitle(html);
  } catch (err) {
    console.error("fetchPageTitle: fetch failed", String(err));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
