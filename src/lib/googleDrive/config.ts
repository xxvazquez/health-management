const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** False until the client ID is set — mirrors supabaseConfigured: the My
 * Drive page shows a "not set up" message instead of erroring. */
export const googleDriveConfigured = Boolean(clientId);

export const GOOGLE_CLIENT_ID = clientId;

/** Narrowest scope that covers browsing: file/folder metadata only (name,
 * mimeType, modifiedTime, size, webViewLink, starred, parents) — no file
 * content, no write access. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
