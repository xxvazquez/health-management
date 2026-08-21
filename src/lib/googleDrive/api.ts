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
