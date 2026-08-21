import type { ReactNode } from "react";
import { FOLDER_MIME_TYPE } from "@/lib/googleDrive/api";

/** Same thin-stroke icon language as the rest of the app (Nav, Bristol
 * icons) — a small fixed set keyed by MIME type rather than one icon per
 * Google file extension. */
function IconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const FOLDER_ICON = (
  <IconWrap>
    <path d="M3 6.2c0-.7.6-1.2 1.2-1.2h3.6l1.4 1.6h6.6c.7 0 1.2.5 1.2 1.2v6.4c0 .7-.5 1.2-1.2 1.2H4.2c-.7 0-1.2-.5-1.2-1.2Z" />
  </IconWrap>
);

const DOC_ICON = (
  <IconWrap>
    <path d="M6 2.8h5.6L15 6.2v10.6a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3.3a.5.5 0 0 1 .5-.5Z" />
    <path d="M11.4 2.8v3.4H15" />
    <path d="M7.3 10.2h5.4M7.3 12.4h5.4M7.3 14.6h3.4" />
  </IconWrap>
);

const SHEET_ICON = (
  <IconWrap>
    <path d="M6 2.8h5.6L15 6.2v10.6a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3.3a.5.5 0 0 1 .5-.5Z" />
    <path d="M11.4 2.8v3.4H15" />
    <path d="M6.5 10h8M6.5 13h8M9.3 10v6.8M12.2 10v6.8" />
  </IconWrap>
);

const SLIDES_ICON = (
  <IconWrap>
    <rect x="3.2" y="4.5" width="13.6" height="9.4" rx="1" />
    <path d="M8.2 17.2h3.6" />
  </IconWrap>
);

const IMAGE_ICON = (
  <IconWrap>
    <rect x="3" y="4" width="14" height="12" rx="1.4" />
    <circle cx="7.2" cy="8" r="1.3" />
    <path d="M4.2 14.8 8.4 10.6a1 1 0 0 1 1.4 0l1.4 1.4" />
    <path d="M11.5 13.5 13.4 11.6a1 1 0 0 1 1.4 0l1.9 1.9" />
  </IconWrap>
);

const PDF_ICON = (
  <IconWrap>
    <path d="M6 2.8h5.6L15 6.2v10.6a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3.3a.5.5 0 0 1 .5-.5Z" />
    <path d="M11.4 2.8v3.4H15" />
    <path d="M6.6 14.5V10.8h1.1c.7 0 1.2.5 1.2 1.1v.4c0 .6-.5 1.1-1.2 1.1H6.6M10.5 10.8v3.7M13.4 10.8H12v3.7M12 12.5h1.1" />
  </IconWrap>
);

const FILE_ICON = (
  <IconWrap>
    <path d="M6 2.8h5.6L15 6.2v10.6a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3.3a.5.5 0 0 1 .5-.5Z" />
    <path d="M11.4 2.8v3.4H15" />
  </IconWrap>
);

const MIME_ICON: Record<string, ReactNode> = {
  [FOLDER_MIME_TYPE]: FOLDER_ICON,
  "application/vnd.google-apps.document": DOC_ICON,
  "application/vnd.google-apps.spreadsheet": SHEET_ICON,
  "application/vnd.google-apps.presentation": SLIDES_ICON,
  "application/pdf": PDF_ICON,
};

export function driveFileIcon(mimeType: string): ReactNode {
  if (MIME_ICON[mimeType]) return MIME_ICON[mimeType];
  if (mimeType.startsWith("image/")) return IMAGE_ICON;
  return FILE_ICON;
}

export const DriveFolderIcon = FOLDER_ICON;
