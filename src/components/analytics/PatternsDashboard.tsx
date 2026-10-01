"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { usePreferences } from "@/lib/usePreferences";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { Sheet } from "@/components/ui/Sheet";
import { FormGroup } from "@/components/ui/FormGroup";
import { Field } from "@/components/ui/Field";
import { ChevronIcon } from "@/components/ui/icons";
import { ComboBox } from "@/components/doctors/shared";
import { TrendGroup, TrendRow } from "@/components/analytics/TrendList";
import {
  allCauseOptions,
  computeLaggedAssociations,
  generateTopPatterns,
  linkByDelay,
  patternOutcomes,
  patternLinkKey,
  type AssociationResult,
} from "@/lib/aggregations/patterns";
import { TYPE_ACCENT } from "@/taxonomy/categories";
import type { CanonicalEvent, RawPeriodLog } from "@/lib/types";
import type { CheckIn } from "@/lib/supabase/checkins";
import { useCheckIns } from "@/lib/useCheckIns";

const WITHOUT_COLOR = "color-mix(in oklab, var(--text-muted) 60%, var(--surface-1))";

const FOOTNOTE = "Share of days the symptom appeared. Links, not proof of cause.";

/** "the same day as X" / "the day after X" / "2 days after X" */
function lagPhrase(lagDays: number): string {
  if (lagDays === 0) return "the same day as";
  if (lagDays === 1) return "the day after";
  return `${lagDays} days after`;
}

function delayLabel(lagDays: number): string {
  if (lagDays === 0) return "Same day";
  if (lagDays === 1) return "Next day";
  return `${lagDays} days later`;
}

function isPhase(causeLabel: string): boolean {
  return causeLabel.endsWith(" phase");
}

/** "With Milk" / "In the luteal phase" */
function withLabel(causeLabel: string): string {
  return isPhase(causeLabel) ? `In the ${causeLabel.toLowerCase()}` : `With ${causeLabel}`;
}

/** "More often the day after Milk" / "More often in the luteal phase" */
function linkSentence(link: AssociationResult): string {
  const more = link.diffPct > 0 ? "More" : "Less";
  if (isPhase(link.causeLabel)) return `${more} often in the ${link.causeLabel.toLowerCase()}`;
  return `${more} often ${lagPhrase(link.lagDays)} ${link.causeLabel}`;
}

function withColor(link: AssociationResult): string {
  return link.diffPct > 0 ? "var(--status-serious)" : "var(--status-good)";
}

/** "Since January", with the year once it isn't this year's January. */
function sinceLabel(events: CanonicalEvent[]): string {
  let first: string | null = null;
  for (const e of events) if (!first || e.date < first) first = e.date;
  if (!first) return "";
  const d = new Date(`${first}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Since ${d.toLocaleDateString(undefined, { month: "long", year: sameYear ? undefined : "numeric" })}`;
}

/** With / Without as two thin bars, each filled to its share of days. */
function PairedBars({ link, withLabel = "With", withoutLabel = "Without" }: { link: AssociationResult; withLabel?: string; withoutLabel?: string }) {
  const rows = [
    { label: withLabel, pct: link.withPct, color: withColor(link) },
    { label: withoutLabel, pct: link.withoutPct, color: WITHOUT_COLOR },
  ];
  return (
    <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 text-xs">
      {rows.map((r) => (
        <span key={r.label} className="contents">
          <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
          <span className="block h-[5px] overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(r.pct > 0 ? 2 : 0, r.pct)}%`, background: r.color }} />
          </span>
          <span className="text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
            {Math.round(r.pct)}%
          </span>
        </span>
      ))}
    </span>
  );
}

export function PatternsDashboard() {
  const { status, events, workoutLogs, periodLogs } = useData();
  const { checkIns: allCheckIns, loading: checkInsLoading, error: checkInsError } = useCheckIns();
  const checkIns = useMemo(() => (checkInsLoading || checkInsError ? [] : allCheckIns), [allCheckIns, checkInsLoading, checkInsError]);
  const { prefs, update } = usePreferences();
  const hiddenLinks = prefs.hiddenPatternLinks;
  const hidden = useMemo(() => new Set((hiddenLinks ?? []).map((l) => patternLinkKey(l.symptom, l.trigger))), [hiddenLinks]);
  // Links need the whole history — a month holds too few days on each side
  // of a comparison — so this tab has no range filter.
  const links = useMemo(() => generateTopPatterns(events, hidden, periodLogs, checkIns), [events, hidden, periodLogs, checkIns]);
  const [openLink, setOpenLink] = useState<AssociationResult | null>(null);
  const [exploring, setExploring] = useState(false);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  function hideLink(link: AssociationResult) {
    update({ hiddenPatternLinks: [...(hiddenLinks ?? []), { symptom: link.outcomeLabel, trigger: link.causeLabel }] });
    setOpenLink(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {links.length > 0 ? (
        <TrendGroup caption={`Possible links · ${sinceLabel(events)}`} note={FOOTNOTE}>
          {links.map((link) => (
            <button
              key={patternLinkKey(link.outcomeLabel, link.causeLabel)}
              type="button"
              onClick={() => setOpenLink(link)}
              className="block min-h-11 w-full px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {link.outcomeLabel}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                    {linkSentence(link)}
                  </span>
                </span>
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                  <ChevronIcon dir="right" size={14} />
                </span>
              </span>
              <span className="mt-2 block">
                {isPhase(link.causeLabel) ? <PairedBars link={link} withLabel="In phase" withoutLabel="Other days" /> : <PairedBars link={link} />}
              </span>
            </button>
          ))}
        </TrendGroup>
      ) : (
        <TrendGroup caption={`Possible links · ${sinceLabel(events)}`}>
          <div className="px-3.5 py-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              No clear links yet
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              A link shows once a food or supplement has two weeks of days with it and without it, and the difference holds up after every
              combination is checked together.
            </p>
          </div>
        </TrendGroup>
      )}

      <TrendGroup caption="Explore">
        <TrendRow label="Compare a symptom and a food…" onClick={() => setExploring(true)} />
      </TrendGroup>

      {openLink && <LinkSheet link={openLink} events={events} periodLogs={periodLogs} checkIns={checkIns} onHide={() => hideLink(openLink)} onClose={() => setOpenLink(null)} />}
      {exploring && <ExploreSheet events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} checkIns={checkIns} onClose={() => setExploring(false)} />}
    </div>
  );
}

/** Each delay from the same day to 3 days after, as With / Without bars. */
function DelayRows({ results, causeLabel }: { results: AssociationResult[]; causeLabel: string }) {
  const phase = isPhase(causeLabel);
  return (
    <FormGroup title={phase ? undefined : "By delay"} footer={FOOTNOTE}>
      {results.map((r) => (
        <div key={r.lagDays} className="px-3.5 py-2.5">
          <p className="mb-1.5 flex items-baseline justify-between gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
            <span>{phase ? causeLabel : delayLabel(r.lagDays)}</span>
            {r.sampleTier === "insufficient" && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Not enough days
              </span>
            )}
          </p>
          {r.sampleTier !== "insufficient" && <PairedBars link={r} withLabel={withLabel(causeLabel)} withoutLabel={phase ? "Other days" : "Without"} />}
        </div>
      ))}
    </FormGroup>
  );
}

function LinkSheet({
  link,
  events,
  periodLogs,
  checkIns,
  onHide,
  onClose,
}: {
  link: AssociationResult;
  events: CanonicalEvent[];
  periodLogs: RawPeriodLog[];
  checkIns: CheckIn[];
  onHide: () => void;
  onClose: () => void;
}) {
  const byDelay = useMemo(() => linkByDelay(events, link.causeLabel, link.outcomeLabel, periodLogs, checkIns), [events, link, periodLogs, checkIns]);
  return (
    <Sheet title={link.outcomeLabel} subtitle={linkSentence(link)} titleId="pattern-link-title" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <FormGroup title={delayLabel(link.lagDays)}>
          {[
            { label: withLabel(link.causeLabel), count: link.withCount, total: link.withTotal, pct: link.withPct, color: withColor(link) },
            { label: isPhase(link.causeLabel) ? "Other days" : "Without", count: link.withoutCount, total: link.withoutTotal, pct: link.withoutPct, color: "var(--text-primary)" },
          ].map((r) => (
            <div key={r.label} className="flex min-h-11 items-center gap-3 px-3.5">
              <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {r.label}
              </span>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {r.count} of {r.total} days
              </span>
              <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: r.color }}>
                {Math.round(r.pct)}%
              </span>
            </div>
          ))}
        </FormGroup>

        {!isPhase(link.causeLabel) && <DelayRows results={byDelay} causeLabel={link.causeLabel} />}

        <FormGroup footer="Hides this link for good. You can bring it back in Settings → Hidden links.">
          <button type="button" onClick={onHide} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
            Not related
          </button>
        </FormGroup>
      </div>
    </Sheet>
  );
}

const CAUSE_PREFIX = /^(Food|Food category|Supplement|Habit|Workout|Cycle): /;

function ExploreSheet({
  events,
  workoutLogs,
  periodLogs,
  checkIns,
  onClose,
}: {
  events: CanonicalEvent[];
  workoutLogs: ReturnType<typeof useData>["workoutLogs"];
  periodLogs: RawPeriodLog[];
  checkIns: CheckIn[];
  onClose: () => void;
}) {
  const causeOptions = useMemo(() => allCauseOptions(events, workoutLogs, periodLogs), [events, workoutLogs, periodLogs]);
  const outcomeOptions = useMemo(() => patternOutcomes(events, checkIns).sort((a, b) => a.label.localeCompare(b.label)), [events, checkIns]);
  const symptomOptions = useMemo(() => outcomeOptions.map((o) => o.label), [outcomeOptions]);
  const [symptom, setSymptom] = useState("");
  const [cause, setCause] = useState("");

  const causeOption = causeOptions.find((o) => o.label === cause);
  const outcomeOption = outcomeOptions.find((o) => o.label === symptom);
  const causeName = cause.replace(CAUSE_PREFIX, "");
  const results = useMemo(
    () => (causeOption && outcomeOption ? computeLaggedAssociations(causeOption, outcomeOption, isPhase(causeName) ? [0] : undefined) : []),
    [causeOption, outcomeOption, causeName],
  );

  return (
    <Sheet title="Compare" titleId="pattern-explore-title" onClose={onClose}>
      {/* Tall from the start, so the pickers' suggestions have room below them. */}
      <div className="flex min-h-[60dvh] flex-col gap-5">
        <FormGroup>
          <Field label="Symptom" plain>
            <ComboBox value={symptom} onChange={setSymptom} options={symptomOptions} placeholder="Search symptoms" allowCreate={false} accent={TYPE_ACCENT.outcome} />
          </Field>
          <Field label="Compare with" plain>
            <ComboBox
              value={cause}
              onChange={setCause}
              options={causeOptions.map((o) => o.label)}
              placeholder="Food, supplement, habit or cycle phase"
              allowCreate={false}
              accent={TYPE_ACCENT.food}
            />
          </Field>
        </FormGroup>
        {results.length > 0 && <DelayRows results={results} causeLabel={causeName} />}
      </div>
    </Sheet>
  );
}
