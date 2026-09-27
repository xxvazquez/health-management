"use client";

import { useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { LABEL_CLS, LABEL_STYLE, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";

/** Open entry links in a new tab so the app (an installed PWA) isn't
 * navigated away from. `node` is react-markdown's AST handle — dropped. */
function EntryLink({ node: _node, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  void _node;
  return <a {...props} target="_blank" rel="noreferrer noopener" />;
}

/** Rendered view of a Journal entry. Markdown is the storage format for
 * `body`; raw HTML is not enabled, so this is safe without sanitising. */
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: EntryLink }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Flatten markdown to plain text for the two-line row preview — the list
 * shows what the entry says, not its syntax. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, " ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const TOOLBAR_BTN =
  "min-h-9 min-w-9 shrink-0 rounded-md px-2 text-sm leading-none whitespace-nowrap transition-colors hover:bg-[var(--surface-1)]";

/** Toolbar buttons must not steal focus from the textarea — otherwise the
 * selection collapses before the click handler can read it. */
function ToolbarButton({ label, name, extra, onPress }: { label: string; name: string; extra?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`${TOOLBAR_BTN}${extra ? ` ${extra}` : ""}`}
      title={name}
      aria-label={name}
    >
      {label}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0" style={{ background: "var(--gridline)" }} aria-hidden="true" />;
}

/** Markdown editor: a formatting toolbar over a plain textarea, plus a
 * Write / Preview switch. The textarea stays the source of truth — the
 * toolbar just splices syntax around the current selection. Renders flush
 * (no outer border) so the parent can frame it inside a card. With `label`
 * it's a `FormGroup` row instead: label above a growing text field, the
 * toolbar as a quiet strip under it that shows only while the field is in
 * use. */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 10,
  autoFocus = false,
  required = true,
  label,
}: {
  label?: ReactNode;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Last known selection — kept in a ref because clicking a toolbar button
  // can blur the textarea before the handler runs.
  const selRef = useRef<[number, number]>([0, 0]);
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);

  function currentSel(): [number, number] {
    const [s, e] = selRef.current;
    const max = value.length;
    return [Math.min(s, max), Math.min(e, max)];
  }

  function apply(next: string, selStart: number, selEnd: number) {
    onChange(next);
    selRef.current = [selStart, selEnd];
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function wrap(token: string, placeholderText: string) {
    const [s, e] = currentSel();
    const sel = value.slice(s, e) || placeholderText;
    const next = value.slice(0, s) + token + sel + token + value.slice(e);
    apply(next, s + token.length, s + token.length + sel.length);
  }

  function prefixLines(prefix: string, ordered = false) {
    const [s, e] = currentSel();
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const nl = value.indexOf("\n", e);
    const lineEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const allPrefixed = lines.every((ln) => ln.trimStart().startsWith(prefix.trim()) || (ordered && /^\s*\d+\.\s/.test(ln)));
    const out = lines
      .map((ln, i) => {
        if (allPrefixed) {
          return ln.replace(ordered ? /^(\s*)\d+\.\s/ : new RegExp(`^(\\s*)${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "$1");
        }
        return (ordered ? `${i + 1}. ` : prefix) + ln;
      })
      .join("\n");
    const next = value.slice(0, lineStart) + out + value.slice(lineEnd);
    apply(next, lineStart, lineStart + out.length);
  }

  function insertLink() {
    const [s, e] = currentSel();
    const label = value.slice(s, e) || "link text";
    const snippet = `[${label}](url)`;
    const next = value.slice(0, s) + snippet + value.slice(e);
    const urlAt = s + label.length + 3;
    apply(next, urlAt, urlAt + 3);
  }

  const tools = (
    <>
      <div className="no-scrollbar fade-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1">
        <ToolbarButton label="B" name="Bold" extra="font-semibold" onPress={() => wrap("**", "bold")} />
        <ToolbarButton label="I" name="Italic" extra="italic" onPress={() => wrap("_", "italic")} />
        <ToolbarDivider />
        <ToolbarButton label="H1" name="Heading" onPress={() => prefixLines("# ")} />
        <ToolbarButton label="H2" name="Subheading" onPress={() => prefixLines("## ")} />
        <ToolbarDivider />
        <ToolbarButton label="List" name="Bulleted list" onPress={() => prefixLines("- ")} />
        <ToolbarButton label="1." name="Numbered list" onPress={() => prefixLines("1. ", true)} />
        <ToolbarButton label="Task" name="Checklist" onPress={() => prefixLines("- [ ] ")} />
        <ToolbarButton label="Quote" name="Quote" onPress={() => prefixLines("> ")} />
        <ToolbarButton label="Link" name="Link" onPress={insertLink} />
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPreview((v) => !v)}
        className={`${TOOLBAR_BTN} font-medium`}
        style={{ color: "var(--ui-accent)" }}
      >
        {preview ? "Write" : "Preview"}
      </button>
    </>
  );

  const nothingYet = (
    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
      Nothing to preview yet.
    </p>
  );

  if (label) {
    return (
      <div
        className="flex flex-col"
        onFocus={() => setEditing(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setEditing(false);
        }}
      >
        <label className="flex flex-col gap-0.5 px-3.5 py-2.5">
          <span className={LABEL_CLS} style={LABEL_STYLE}>
            {label}
          </span>
          {preview ? (
            <div className="py-0.5">{value.trim() ? <MarkdownContent>{value}</MarkdownContent> : nothingYet}</div>
          ) : (
            <AutoGrowTextarea
              ref={ref}
              required={required}
              autoFocus={autoFocus}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onSelect={(e) => {
                selRef.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
              }}
              rows={rows}
              maxRows={16}
              placeholder={placeholder}
              className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
              style={ROW_STYLE}
            />
          )}
        </label>
        <div
          className={`ml-3.5 items-center gap-1 border-t pr-2 ${editing || preview ? "flex" : "hidden"}`}
          style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
        >
          {tools}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-1 border-y pr-2 pl-2"
        style={{ borderColor: "var(--gridline)", background: "var(--page-backdrop)", color: "var(--text-secondary)" }}
      >
        {tools}
      </div>

      {preview ? (
        <div className="min-h-[12rem] px-4 py-3.5">
          {value.trim() ? <MarkdownContent>{value}</MarkdownContent> : nothingYet}
        </div>
      ) : (
        <textarea
          ref={ref}
          required={required}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={(e) => {
            selRef.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd];
          }}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-y border-0 bg-transparent px-4 py-3.5 text-sm leading-relaxed outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      )}
    </div>
  );
}
