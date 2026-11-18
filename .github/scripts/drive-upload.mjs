// Uploads one backup file to a "Lauva backups" folder in Google Drive and
// keeps only the newest KEEP files there. Runs from backup.yml, which keeps
// the file as a workflow artifact instead if this fails.
//
// Auth is the owner's own Google account through an OAuth refresh token
// (make one with drive-token.mjs). The drive.file scope only reaches files
// this script created, so it can't see or touch anything else in the Drive.
//
// Usage: node drive-upload.mjs <file>
// Env:   GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN

import { appendFile, readFile } from "node:fs/promises";
import { basename } from "node:path";

const FOLDER_NAME = "Lauva backups";
const KEEP = 90;
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name";

async function call(url, token, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function accessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Google sign-in failed: ${json.error ?? res.status} ${json.error_description ?? ""}`);
  return json.access_token;
}

async function findOrCreateFolder(token) {
  const q = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const { files } = await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, token);
  if (files.length) return files[0].id;
  const folder = await call(`${API}/files?fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  return folder.id;
}

async function upload(token, folderId, path) {
  const boundary = `lauva-${Date.now()}`;
  const meta = JSON.stringify({ name: basename(path), parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    await readFile(path),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return call(UPLOAD, token, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
}

async function prune(token, folderId) {
  const q = `'${folderId}' in parents and trashed = false`;
  const { files } = await call(`${API}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,name)&pageSize=1000`, token);
  for (const file of files.slice(KEEP)) {
    await call(`${API}/files/${file.id}`, token, { method: "DELETE" });
    console.log(`Removed old backup ${file.name}`);
  }
}

const path = process.argv[2];
const creds = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
};
if (!path) throw new Error("Usage: node drive-upload.mjs <file>");
if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) throw new Error("Google Drive secrets are not set.");

const token = await accessToken(creds);
const folderId = await findOrCreateFolder(token);
const file = await upload(token, folderId, path);
console.log(`Uploaded ${file.name} to Google Drive → ${FOLDER_NAME}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "uploaded=true\n");
await prune(token, folderId);
