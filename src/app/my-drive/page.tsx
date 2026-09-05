"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Card, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { driveFileIcon, DriveFolderIcon } from "@/components/icons/DriveFileIcons";
import { CloseIcon } from "@/components/ui/icons";
import { useGoogleDriveAuth } from "@/lib/googleDrive/useGoogleDriveAuth";
import { listFolder, searchDrive, isFolder, DriveApiError, type DriveFile } from "@/lib/googleDrive/api";
import { useAuth } from "@/lib/supabase/AuthContext";

interface Crumb {
  id: string;
  name: string;
}

const ROOT_CRUMB: Crumb = { id: "root", name: "My Drive" };

function formatModified(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function humanizeError(err: unknown): string {
  if (err instanceof DriveApiError) return err.message;
  return "Something went wrong talking to Google Drive.";
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16.5 16.5 13 13" />
    </svg>
  );
}

function Breadcrumbs({ crumbs, onNavigate }: { crumbs: Crumb[]; onNavigate: (index: number) => void }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${crumb.id}-${i}`} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden style={{ color: "var(--text-muted)" }}>
                /
              </span>
            )}
            {isLast ? (
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {crumb.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(i)}
                className="underline decoration-dotted"
                style={{ color: "var(--text-secondary)" }}
              >
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function FolderCard({ folder, onOpen }: { folder: DriveFile; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-[var(--page-plane)]"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span className="shrink-0" style={{ color: "var(--series-1)" }}>
        {DriveFolderIcon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {folder.name}
      </span>
    </button>
  );
}

function FileRow({ file }: { file: DriveFile }) {
  const modified = formatModified(file.modifiedTime);
  const size = formatSize(file.size);
  const meta = [modified, size].filter(Boolean).join(" · ");
  const content = (
    <>
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        {driveFileIcon(file.mimeType)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {file.name}
        </span>
        {meta && (
          <span className="block text-xs sm:hidden" style={{ color: "var(--text-muted)" }}>
            {meta}
          </span>
        )}
      </span>
      {file.starred && (
        <span aria-label="Starred" className="shrink-0 text-sm" style={{ color: "var(--brand-dot)" }}>
          ★
        </span>
      )}
      {meta && (
        <span className="hidden shrink-0 text-xs tabular-nums sm:block" style={{ color: "var(--text-muted)" }}>
          {meta}
        </span>
      )}
    </>
  );
  const className = "flex w-full items-center gap-3 border-b px-2.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[var(--page-plane)]";
  const style = { borderColor: "var(--gridline)" };

  if (file.webViewLink) {
    return (
      <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {content}
      </a>
    );
  }
  return (
    <div className={clsx(className, "opacity-70 hover:bg-transparent")} style={style}>
      {content}
    </div>
  );
}

function ConnectCard({
  status,
  errorMessage,
  onConnect,
}: {
  status: "disconnected" | "connecting" | "connected" | "expired" | "error";
  errorMessage: string | null;
  onConnect: () => void;
}) {
  const expired = status === "expired";
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        My Drive
      </p>
      <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--text-secondary)" }}>
        {expired
          ? "Your Google Drive session expired. Reconnect to keep browsing."
          : "Connect your Google Drive to access your files and folders here."}
      </p>
      <Button type="button" size="lg" onClick={onConnect} disabled={status === "connecting"} className="mt-5">
        {status === "connecting" ? "Connecting…" : expired ? "Reconnect Google Drive" : "Connect Google Drive"}
      </Button>
      {errorMessage && (
        <p className="mt-3 max-w-sm text-xs" style={{ color: "var(--status-critical)" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default function MyDrivePage() {
  const { configured, status: authStatus, errorMessage: authError, connect, disconnect, getAccessToken, markExpired } = useGoogleDriveAuth();
  const { session } = useAuth();

  // Drive's access token lives only in useGoogleDriveAuth's local state (see
  // its own doc comment) and is never tied to Supabase's session lifecycle
  // on its own — signing out of Supabase doesn't unmount this page or clear
  // it. Without this, a second person signing into their own Supabase
  // account on the same device/tab right after someone else signs out would
  // still see the previous person's connected Drive listing.
  useEffect(() => {
    if (!session) disconnect();
  }, [session, disconnect]);

  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT_CRUMB]);
  const [items, setItems] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);

  const loadListing = useCallback(
    async (opts: { folderId?: string; search?: string; pageToken?: string }) => {
      const token = getAccessToken();
      if (!token) return;
      const isMore = Boolean(opts.pageToken);
      if (isMore) setListLoadingMore(true);
      else setListLoading(true);
      setListError(null);
      try {
        const result = opts.search
          ? await searchDrive(opts.search, token, opts.pageToken)
          : await listFolder(opts.folderId ?? "root", token, opts.pageToken);
        setItems((prev) => (isMore ? [...prev, ...result.files] : result.files));
        setNextPageToken(result.nextPageToken);
      } catch (err) {
        if (err instanceof DriveApiError && err.authExpired) {
          markExpired();
        } else {
          setListError(humanizeError(err));
        }
      } finally {
        if (isMore) setListLoadingMore(false);
        else setListLoading(false);
      }
    },
    [getAccessToken, markExpired],
  );

  // Load the root folder once per successful connection — not on every
  // render, and not again just because some other state on the page
  // changed. Mirrors the ref-guard pattern DataContext uses for "sync once
  // per sign-in".
  const loadedForConnection = useRef(false);
  useEffect(() => {
    if (authStatus === "connected" && !loadedForConnection.current) {
      loadedForConnection.current = true;
      setCrumbs([ROOT_CRUMB]);
      setActiveSearch(null);
      setSearchInput("");
      setItems([]);
      setNextPageToken(undefined);
      void loadListing({ folderId: "root" });
    }
    if (authStatus !== "connected") loadedForConnection.current = false;
  }, [authStatus, loadListing]);

  const folders = useMemo(() => items.filter(isFolder), [items]);
  const files = useMemo(() => items.filter((f) => !isFolder(f)), [items]);

  function openFolder(folder: DriveFile) {
    const next = [...crumbs, { id: folder.id, name: folder.name }];
    setCrumbs(next);
    setActiveSearch(null);
    setSearchInput("");
    setItems([]);
    setNextPageToken(undefined);
    void loadListing({ folderId: folder.id });
  }

  function goToCrumb(index: number) {
    const next = crumbs.slice(0, index + 1);
    setCrumbs(next);
    setActiveSearch(null);
    setSearchInput("");
    setItems([]);
    setNextPageToken(undefined);
    void loadListing({ folderId: next[next.length - 1].id });
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setActiveSearch(q);
    setItems([]);
    setNextPageToken(undefined);
    void loadListing({ search: q });
  }

  function clearSearch() {
    setActiveSearch(null);
    setSearchInput("");
    setItems([]);
    setNextPageToken(undefined);
    void loadListing({ folderId: crumbs[crumbs.length - 1].id });
  }

  function loadMore() {
    if (!nextPageToken) return;
    if (activeSearch) void loadListing({ search: activeSearch, pageToken: nextPageToken });
    else void loadListing({ folderId: crumbs[crumbs.length - 1].id, pageToken: nextPageToken });
  }

  return (
    <div className="relative overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)" }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/background.png)" }} />
      {/* Semi-transparent wash over the artwork so text and controls keep
          full contrast — the image itself is calibrated for --surface-1's
          dark text, not guaranteed everywhere (e.g. the leaf/circle
          accents in its corners). */}
      <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.6)" }} />
      <div className="relative flex flex-col gap-5 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            My Drive
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Browse your Google Drive files and folders — read-only.
          </p>
        </div>

      {!configured && (
        <Card tier="supporting">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Google Drive isn&apos;t set up for this deployment yet.
          </p>
        </Card>
      )}

      {configured && authStatus !== "connected" && <ConnectCard status={authStatus} errorMessage={authError} onConnect={() => void connect()} />}

      {configured && authStatus === "connected" && (
        <>
          <form onSubmit={submitSearch} className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
              <SearchIcon />
            </span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search your Drive"
              className="w-full rounded-md border py-2 pr-9 pl-9 text-sm"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute top-1/2 right-3 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                <CloseIcon size={12} />
              </button>
            )}
          </form>

          {activeSearch ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Search results for &ldquo;{activeSearch}&rdquo;
            </p>
          ) : (
            <Breadcrumbs crumbs={crumbs} onNavigate={goToCrumb} />
          )}

          {listError && (
            <Card tier="raw">
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {listError}
              </p>
            </Card>
          )}

          {listLoading ? (
            <ListSkeleton />
          ) : (
            !listError &&
            (folders.length === 0 && files.length === 0 ? (
              <EmptyState
                title={activeSearch ? "No matches" : "This folder is empty"}
                description={activeSearch ? "Try a different search term." : "Nothing here yet."}
                showLogLink={false}
              />
            ) : (
              <>
                {folders.length > 0 && (
                  <div>
                    <CardTitle size="sm">Folders</CardTitle>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {folders.map((folder) => (
                        <FolderCard key={folder.id} folder={folder} onOpen={() => openFolder(folder)} />
                      ))}
                    </div>
                  </div>
                )}

                {files.length > 0 && (
                  <div>
                    <CardTitle size="sm">Files</CardTitle>
                    <Card tier="raw" padded={false}>
                      {files.map((file) => (
                        <FileRow key={file.id} file={file} />
                      ))}
                    </Card>
                  </div>
                )}

                {nextPageToken && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={listLoadingMore}
                    className="self-start rounded-md border px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                  >
                    {listLoadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </>
            ))
          )}

          <button
            type="button"
            onClick={disconnect}
            className="self-start text-xs font-medium underline decoration-dotted"
            style={{ color: "var(--text-muted)" }}
          >
            Disconnect Google Drive
          </button>
        </>
      )}
      </div>
    </div>
  );
}
