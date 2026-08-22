import { Card } from "@/components/ui/Card";
import { buildDayStory, type DayStoryEntry } from "@/lib/aggregations/myDay";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import type { CanonicalEvent, RawWorkoutLog } from "@/lib/types";

const KIND_ACCENT: Record<DayStoryEntry["kind"], string> = {
  meal: TYPE_ACCENT.food,
  exercise: TYPE_ACCENT.workout,
  symptom: TYPE_ACCENT.outcome,
};

/** Thin crescent, same stroke language as every other icon in the app —
 * not an emoji, to match Lauva's own visual vocabulary. */
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11.8A6 6 0 1 1 8.2 5.5a5 5 0 0 0 6.3 6.3Z" />
    </svg>
  );
}

/**
 * Read-only "day at a glance" — a short, natural-language story built from
 * today's own logged data (meals, exercise, notable symptoms), not a
 * second place to edit anything. Renders nothing at all on a day with
 * nothing logged yet, rather than an empty shell with placeholder rows.
 */
export function MyDay({ events, workoutLogs, date }: { events: CanonicalEvent[]; workoutLogs: RawWorkoutLog[]; date: string }) {
  const story = buildDayStory(events, workoutLogs, date);
  if (story.entries.length === 0 && story.alsoLogged.length === 0) return null;

  return (
    <Card tier="raw">
      <p className="mb-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
        My day
      </p>

      {story.entries.length > 0 && (
        <div className="flex max-h-64 flex-col overflow-y-auto pr-1">
          {story.entries.map((entry, i) => (
            <div key={entry.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_ACCENT[entry.kind] }} />
                {i < story.entries.length - 1 && <span className="w-px flex-1" style={{ background: "var(--gridline)" }} />}
              </div>
              <div className={i < story.entries.length - 1 ? "pb-3" : ""}>
                <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {entry.time}
                </p>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold" style={{ color: KIND_ACCENT[entry.kind] }}>
                    {entry.label}
                  </span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>— {entry.description}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {story.alsoLogged.length > 0 && (
        <p className={story.entries.length > 0 ? "mt-3 text-xs" : "text-xs"} style={{ color: "var(--text-secondary)" }}>
          Also logged: {story.alsoLogged.join(", ")}
        </p>
      )}

      {story.fastingHours !== null && (
        <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          <MoonIcon /> {story.fastingHours}h fasting window
        </p>
      )}
    </Card>
  );
}
