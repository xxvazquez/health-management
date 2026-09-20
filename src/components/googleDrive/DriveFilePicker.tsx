"use client";

import { CONTROL_CLS, CONTROL_STYLE } from "@/components/ui/Chip";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/icons";
import { FormGroup } from "@/components/ui/FormGroup";
import { SearchField } from "@/components/ui/SearchField";
import { Sheet } from "@/components/ui/Sheet";
import { driveFileIcon, DriveFolderIcon } from "@/components/icons/DriveFileIcons";
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
    <Sheet title="Attach a Google Drive file" titleId="drive-picker-title" onClose={onClose}>
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
              <SearchField value={search} onChange={setSearch} placeholder="Search your Drive" className="w-full" />
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
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`${CONTROL_CLS} disabled:opacity-50`} style={CONTROL_STYLE}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>

          {!activeSearch && (
            <nav className="flex flex-wrap items-center gap-1 px-0.5 text-xs" aria-label="Breadcrumb">
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

          <FormGroup footer="Uploads go to a “Lauva attachments” folder in your Drive.">
            {loading ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                Loading…
              </p>
            ) : listError ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: "var(--status-critical)" }}>
                {listError}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3.5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                {activeSearch ? "Nothing matched." : "This folder is empty."}
              </p>
            ) : (
              items.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => (isFolder(file) ? openFolder(file) : onPick(toDriveAttachment(file)))}
                  className="flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left transition-colors hover:bg-black/[0.04]"
                >
                  <span className="shrink-0" style={{ color: isFolder(file) ? "var(--ui-accent)" : "var(--text-muted)" }}>
                    {isFolder(file) ? DriveFolderIcon : driveFileIcon(file.mimeType)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {file.name}
                  </span>
                  {isFolder(file) && (
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                      <ChevronIcon dir="right" size={14} />
                    </span>
                  )}
                </button>
              ))
            )}
          </FormGroup>
        </>
      )}
    </Sheet>
  );
}
