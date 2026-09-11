"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/icons";
import { driveFileIcon, DriveFolderIcon } from "@/components/icons/DriveFileIcons";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { useGoogleDriveAuth } from "@/lib/googleDrive/useGoogleDriveAuth";
import {
  DriveApiError,
  ensureLauvaFolder,
  isFolder,
  listFolder,
  searchDrive,
  toDriveAttachment,
  uploadFile,
  type DriveAttachment,
  type DriveFile,
} from "@/lib/googleDrive/api";

interface Crumb {
  id: string;
  name: string;
}

const ROOT: Crumb = { id: "root", name: "My Drive" };

/** A modal Drive browser + uploader for attaching one file. Picking an
 * existing file stores a pointer to it; uploading puts the file in a
 * "Lauva attachments" folder in the user's Drive and links that. Reuses the
 * same OAuth as the My Drive page. */
export function DriveFilePicker({ onPick, onClose }: { onPick: (file: DriveAttachment) => void; onClose: () => void }) {
  const { configured, status, errorMessage, connect, getAccessToken, markExpired } = useGoogleDriveAuth();
  const containerRef = useDialogA11y(true, onClose);

  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT]);
  const [items, setItems] = useState<DriveFile[]>([]);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (opts: { folderId?: string; search?: string }) => {
      const token = getAccessToken();
      if (!token) {
        markExpired();
        return;
      }
      setLoading(true);
      setListError(null);
      try {
        const result = opts.search ? await searchDrive(opts.search, token) : await listFolder(opts.folderId ?? "root", token);
        setItems(result.files);
      } catch (err) {
        if (err instanceof DriveApiError && err.authExpired) markExpired();
        else setListError(err instanceof DriveApiError ? err.message : "Google Drive couldn't be reached.");
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, markExpired],
  );

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (status === "connected" && !loadedOnce.current) {
      loadedOnce.current = true;
      void load({ folderId: "root" });
    }
    if (status !== "connected") loadedOnce.current = false;
  }, [status, load]);

  function openFolder(folder: DriveFile) {
    setCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setActiveSearch(null);
    setSearch("");
    void load({ folderId: folder.id });
  }

  function goToCrumb(index: number) {
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    setActiveSearch(null);
    setSearch("");
    void load({ folderId: next[next.length - 1].id });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    setActiveSearch(q);
    void load({ search: q });
  }

  async function handleUpload(file: File) {
    const token = getAccessToken();
    if (!token) {
      markExpired();
      return;
    }
    setUploading(true);
    setListError(null);
    try {
      const folderId = await ensureLauvaFolder(token);
      const created = await uploadFile(file, folderId, token);
      onPick(toDriveAttachment(created));
    } catch (err) {
      if (err instanceof DriveApiError && err.authExpired) markExpired();
      else setListError(err instanceof DriveApiError ? err.message : "The upload didn't go through.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="drive-picker-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative flex max-h-[80vh] w-full max-w-md flex-col gap-3 rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center justify-between">
          <h2 id="drive-picker-title" className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Attach a Google Drive file
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)", background: "var(--page-plane)" }}
          >
            <CloseIcon />
          </button>
        </div>

        {!configured && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Google Drive isn&apos;t set up for this deployment yet.
          </p>
        )}

        {configured && status !== "connected" && (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {status === "expired"
                ? "Your Google Drive session expired — reconnect to keep going."
                : "Connect your Google Drive to attach a file — pick one you already have, or upload a new one."}
            </p>
            <Button type="button" onClick={() => void connect()} disabled={status === "connecting"}>
              {status === "connecting" ? "Connecting…" : status === "expired" ? "Reconnect" : "Connect Google Drive"}
            </Button>
            {errorMessage && (
              <p className="text-xs" style={{ color: "var(--status-critical)" }}>
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {configured && status === "connected" && (
          <>
            <div className="flex items-center gap-2">
              <form onSubmit={submitSearch} className="flex-1">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your Drive"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
                />
              </form>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
            <p className="-mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Uploads go to a &ldquo;Lauva attachments&rdquo; folder in your Drive.
            </p>

            {!activeSearch && (
              <nav className="flex flex-wrap items-center gap-1 text-xs" aria-label="Breadcrumb">
                {crumbs.map((crumb, i) => (
                  <span key={`${crumb.id}-${i}`} className="flex items-center gap-1">
                    {i > 0 && <span style={{ color: "var(--text-muted)" }}>/</span>}
                    {i === crumbs.length - 1 ? (
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {crumb.name}
                      </span>
                    ) : (
                      <button type="button" onClick={() => goToCrumb(i)} className="font-medium" style={{ color: "var(--ui-accent)" }}>
                        {crumb.name}
                      </button>
                    )}
                  </span>
                ))}
              </nav>
            )}

            <div className="min-h-24 flex-1 overflow-y-auto rounded-md border" style={{ borderColor: "var(--gridline)" }}>
              {loading ? (
                <p className="p-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  Loading…
                </p>
              ) : listError ? (
                <p className="p-3 text-sm" style={{ color: "var(--status-critical)" }}>
                  {listError}
                </p>
              ) : items.length === 0 ? (
                <p className="p-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  {activeSearch ? "Nothing matched." : "This folder is empty."}
                </p>
              ) : (
                <ul>
                  {items.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => (isFolder(file) ? openFolder(file) : onPick(toDriveAttachment(file)))}
                        className="flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[var(--page-plane)]"
                        style={{ borderColor: "var(--gridline)" }}
                      >
                        <span className="shrink-0" style={{ color: isFolder(file) ? "var(--ui-accent)" : "var(--text-muted)" }}>
                          {isFolder(file) ? DriveFolderIcon : driveFileIcon(file.mimeType)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                          {file.name}
                        </span>
                        {!isFolder(file) && (
                          <span className="shrink-0 text-xs font-medium" style={{ color: "var(--baseline)" }}>
                            Link
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
