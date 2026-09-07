export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
  starred?: boolean;
}

export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME_TYPE;
}

/** The subset of a Drive file this app stores against a record (e.g. a care
 * entry) — a pointer, never the file itself. */
export interface DriveAttachment {
  driveFileId: string;
  name: string;
  mimeType: string | null;
  webViewLink: string | null;
  iconLink: string | null;
}

export function toDriveAttachment(file: DriveFile): DriveAttachment {
  return {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType ?? null,
    webViewLink: file.webViewLink ?? null,
    iconLink: file.iconLink ?? null,
  };
}

export class DriveApiError extends Error {
  /** True for expired/invalid-token responses — the page should drop back
   * to the "reconnect" state rather than showing this as a generic error. */
  authExpired: boolean;

  constructor(message: string, authExpired = false) {
    super(message);
    this.authExpired = authExpired;
  }
}

interface ListResult {
  files: DriveFile[];
  nextPageToken?: string;
}

const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
// Only the metadata the UI actually renders — never file content.
const FIELDS = "nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,starred)";
const PAGE_SIZE = 50;

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function callFilesList(q: string, orderBy: string, accessToken: string, pageToken?: string): Promise<ListResult> {
  const url = new URL(FILES_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("orderBy", orderBy);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("spaces", "drive");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status === 401) throw new DriveApiError("Your Google Drive session expired.", true);
    if (res.status === 403) throw new DriveApiError("Lauva doesn't have permission to read your Drive.");
    throw new DriveApiError("Google Drive couldn't be reached right now.");
  }
  const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
  return { files: data.files ?? [], nextPageToken: data.nextPageToken };
}

export function listFolder(folderId: string, accessToken: string, pageToken?: string): Promise<ListResult> {
  return callFilesList(`'${escapeQueryValue(folderId)}' in parents and trashed = false`, "folder,name_natural", accessToken, pageToken);
}

export function searchDrive(query: string, accessToken: string, pageToken?: string): Promise<ListResult> {
  return callFilesList(`name contains '${escapeQueryValue(query)}' and trashed = false`, "name_natural", accessToken, pageToken);
}

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";
const UPLOAD_FIELDS = "id,name,mimeType,webViewLink,iconLink";
export const LAUVA_FOLDER_NAME = "Lauva attachments";

function driveError(status: number): DriveApiError {
  if (status === 401) return new DriveApiError("Your Google Drive session expired.", true);
  if (status === 403) return new DriveApiError("Google Drive rejected the upload — reconnect and try again.");
  return new DriveApiError("The upload didn't go through — try again in a moment.");
}

/** Find (or create) the app's own folder — with the `drive.file` scope,
 * `files.list` only returns files this app made, so this reliably reuses
 * the one folder rather than making a new one each upload. */
export async function ensureLauvaFolder(accessToken: string): Promise<string> {
  const q = `name = '${escapeQueryValue(LAUVA_FOLDER_NAME)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
  const url = new URL(FILES_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("spaces", "drive");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw driveError(res.status);
  const existing = ((await res.json()) as { files?: { id: string }[] }).files ?? [];
  if (existing.length > 0) return existing[0].id;

  const create = await fetch(FILES_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: LAUVA_FOLDER_NAME, mimeType: FOLDER_MIME_TYPE }),
  });
  if (!create.ok) throw driveError(create.status);
  return ((await create.json()) as { id: string }).id;
}

/** Uploads one file into `parentId` and returns the created Drive file's
 * metadata. Multipart upload — fine for the report-scan-sized files this is
 * for; a resumable upload would only matter for very large media. */
export async function uploadFile(file: File, parentId: string, accessToken: string): Promise<DriveFile> {
  const boundary = `lauva-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: file.name, parents: [parentId] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    file,
    `\r\n--${boundary}--\r\n`,
  ]);

  const url = new URL(UPLOAD_ENDPOINT);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", UPLOAD_FIELDS);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw driveError(res.status);
  return (await res.json()) as DriveFile;
}
