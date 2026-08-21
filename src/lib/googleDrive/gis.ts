"use client";

import { GOOGLE_CLIENT_ID, DRIVE_SCOPE } from "./config";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }) => GoogleTokenClient;
  revoke: (token: string, callback?: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleAccountsOAuth2 } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise: Promise<void> | null = null;

/** Google Identity Services' token client — the client-side-only OAuth flow
 * meant for apps with no backend: no client secret involved anywhere, the
 * access token comes straight back to page JS. Fits this static site, which
 * has nowhere to keep a secret even if we wanted one. */
function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load Google's sign-in library."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

let tokenClient: GoogleTokenClient | null = null;

export interface DriveToken {
  accessToken: string;
  expiresAt: number;
}

export async function requestDriveAccessToken(): Promise<DriveToken> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google Drive isn't configured for this deployment.");
  await loadGisScript();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) throw new Error("Couldn't load Google's sign-in library.");

  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {},
    });
  }
  const client = tokenClient;

  return new Promise((resolve, reject) => {
    // A blocked popup never calls back into GIS's callback at all (Google
    // only logs it to the console), so without a timeout a blocked popup
    // would leave the page stuck on "Connecting…" forever.
    const timeout = setTimeout(() => {
      reject(new Error("Google's sign-in window didn't open — check if your browser blocked the popup, then try again."));
    }, 20_000);
    client.callback = (response) => {
      clearTimeout(timeout);
      if (response.error) {
        reject(new Error(response.error_description || "Google denied access to Drive."));
        return;
      }
      resolve({ accessToken: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 });
    };
    client.requestAccessToken({ prompt: "" });
  });
}

export function revokeDriveAccessToken(accessToken: string) {
  window.google?.accounts.oauth2.revoke(accessToken);
}
