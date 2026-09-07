const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** False until the client ID is set — mirrors supabaseConfigured: the My
 * Drive page shows a "not set up" message instead of erroring. */
export const googleDriveConfigured = Boolean(clientId);

export const GOOGLE_CLIENT_ID = clientId;

/** Two narrow scopes:
 * - `drive.metadata.readonly` — browse the whole Drive by metadata only
 *   (name, type, size, webViewLink, …); no file content.
 * - `drive.file` — create/read/manage only the files this app itself makes
 *   (the uploaded attachments and the folder they go in). Non-sensitive, no
 *   Google verification.
 * Requested together so a linked file can come from either the existing
 * Drive or a fresh upload. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.file";
