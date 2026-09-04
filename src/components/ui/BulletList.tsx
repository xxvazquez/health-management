import type { Bullet } from "@/lib/aggregations/insights";

/**
 * A plain, unbordered list of short observations ("What changed" /
 * "Running differently than usual") — deliberately not wrapped in its own
 * card. Sits directly on the page as CONTEXT beneath the primary Insight,
 * so a page isn't just a stack of identical white rectangles.
 */
export function BulletList({
  title,
  tone,
  bullets,
  emptyText,
  /** Render each bullet's label as a lowercase term rather than a bold
   * noun, for labels that read inside a sentence. */
  termLabels = false,
}: {
  title: string;
  tone?: string;
  bullets: Bullet[];
  emptyText?: string;
  termLabels?: boolean;
}) {
  const dotColor = tone ?? "var(--text-muted)";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold" style={{ color: dotColor }}>
        {title}
      </p>
      {bullets.length === 0 ? (
        emptyText && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {emptyText}
          </p>
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {bullets.map((b) => (
            <li key={b.label} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <span
                  className={termLabels ? "lowercase" : "font-medium"}
                  style={{ color: "var(--text-primary)" }}
                >
                  {b.label}
                </span>
                {b.detail && <> — {b.detail}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
