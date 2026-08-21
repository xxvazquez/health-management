"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { googleDriveConfigured } from "./config";
import { requestDriveAccessToken, revokeDriveAccessToken } from "./gis";

export type DriveConnectionStatus = "disconnected" | "connecting" | "connected" | "expired" | "error";

/** Google's access token never touches storage — kept in a ref for the
 * lifetime of the tab only, matching "don't persist sensitive Google
 * credentials". Reconnecting after a reload (or after the ~1hr token
 * expires) is one click, and Google usually re-grants silently since
 * consent was already given. */
export function useGoogleDriveAuth() {
  const [status, setStatus] = useState<DriveConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const expiresAtRef = useRef(0);

  useEffect(() => {
    if (status !== "connected") return;
    const msUntilExpiry = expiresAtRef.current - Date.now();
    if (msUntilExpiry <= 0) {
      setStatus("expired");
      return;
    }
    const timer = setTimeout(() => setStatus("expired"), msUntilExpiry);
    return () => clearTimeout(timer);
  }, [status]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const token = await requestDriveAccessToken();
      accessTokenRef.current = token.accessToken;
      expiresAtRef.current = token.expiresAt;
      setStatus("connected");
    } catch (err) {
      accessTokenRef.current = null;
      setErrorMessage(err instanceof Error ? err.message : "Couldn't connect to Google Drive.");
      setStatus("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    if (accessTokenRef.current) revokeDriveAccessToken(accessTokenRef.current);
    accessTokenRef.current = null;
    expiresAtRef.current = 0;
    setErrorMessage(null);
    setStatus("disconnected");
  }, []);

  /** Null once expired — callers should treat that as "go back to the
   * reconnect state" rather than trying the request anyway. */
  const getAccessToken = useCallback((): string | null => {
    if (status !== "connected" || Date.now() >= expiresAtRef.current) return null;
    return accessTokenRef.current;
  }, [status]);

  /** For a 401 the Drive API itself rejects — token looked valid client-side
   * (not past expiresAt yet) but Google has already invalidated it. */
  const markExpired = useCallback(() => {
    accessTokenRef.current = null;
    setStatus("expired");
  }, []);

  return { configured: googleDriveConfigured, status, errorMessage, connect, disconnect, getAccessToken, markExpired };
}
