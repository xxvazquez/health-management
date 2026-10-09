"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
import { Sheet } from "@/components/ui/Sheet";
import { FormGroup } from "@/components/ui/FormGroup";
import { ChevronIcon } from "@/components/ui/icons";
import { GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
import { EVIDENCE_RECORDS, type EvidenceRecord, type EvidenceStrength, type EvidenceType } from "@/lib/nutritionEvidenceRecords";

const STRENGTH_COLOR: Record<EvidenceStrength, string> = {
  Strong: "var(--status-good)",
  Moderate: "var(--series-2)",
  Mixed: "var(--status-warning)",
  Limited: "var(--text-muted)",
};

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  "systematic-review": "Systematic review",
  "meta-analysis": "Meta-analysis",
  "umbrella-review": "Umbrella review",
  cohort: "Prospective cohort study",
  rct: "Randomized controlled trial",
  guideline: "Guideline consensus",
};

function formatReviewed(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** One study's detail: the claim, why, its limitations and the source. */
function EvidenceSheet({ record, onClose }: { record: EvidenceRecord; onClose: () => void }) {
  const titleId = useId();
  const sourceUrl = record.url ?? (record.pubmedId ? `https://pubmed.ncbi.nlm.nih.gov/${record.pubmedId}/` : null);
  return (
    <Sheet
      title={record.topic}
      titleId={titleId}
      onClose={onClose}
      subtitle={
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="font-medium" style={{ color: STRENGTH_COLOR[record.strength] }}>
            {record.strength} evidence
          </span>
          {" · "}
          {record.evidenceTypes.map((type) => EVIDENCE_TYPE_LABEL[type]).join(" + ")}
          {record.publicationYear && ` · ${record.publicationYear}`}
        </span>
      }
    >
      <FormGroup>
        <div className="flex flex-col gap-1.5 px-3.5 py-3">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {record.claim}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {record.explanation}
          </p>
        </div>
      </FormGroup>

      <FormGroup title="Limitations">
        <p className="px-3.5 py-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {record.limitations}
        </p>
      </FormGroup>

      <FormGroup title="Source" footer={`Reviewed ${formatReviewed(record.reviewedDate)}`}>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 px-3.5 text-sm">
            <span className="flex-1" style={{ color: "var(--ui-accent)" }}>
              {record.pubmedId ? `PubMed ${record.pubmedId}` : "Open source"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              <ChevronIcon size={14} />
            </span>
          </a>
        )}
        {record.doi && (
          <div className="flex min-h-11 items-center gap-3 px-3.5 text-sm">
            <span style={{ color: "var(--text-primary)" }}>DOI</span>
            <span className="ml-auto min-w-0 truncate select-all" style={{ color: "var(--text-muted)" }}>
              {record.doi}
            </span>
          </div>
        )}
        {!sourceUrl && !record.doi && (
          <p className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-muted)" }}>
            No direct source link yet.
          </p>
        )}
      </FormGroup>
    </Sheet>
  );
}

/**
 * The research behind the Food dashboard's suggestions — the one place PubMed
 * IDs, DOIs and study details are shown. Reads the same EVIDENCE_RECORDS the
 * recommendation engine's `evidenceId` fields point into.
 */
export default function NutritionEvidencePage() {
  const records = Object.values(EVIDENCE_RECORDS);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? records.find((r) => r.id === openId) : undefined;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/manage" className="-ml-1 mb-1 flex min-h-11 w-fit items-center gap-0.5 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          <ChevronIcon dir="left" size={16} />
          Settings
        </Link>
        <PageHeading>Nutrition evidence</PageHeading>
      </div>

      <div className="flex flex-col gap-1.5">
        <ul className={GROUP_CLS} style={GROUP_STYLE}>
          {records.map((record) => (
            <li key={record.id}>
              <button type="button" onClick={() => setOpenId(record.id)} aria-haspopup="dialog" className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left">
                <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                  {record.topic}
                </span>
                <span className="shrink-0 text-sm" style={{ color: STRENGTH_COLOR[record.strength] }}>
                  {record.strength}
                </span>
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                  <ChevronIcon size={14} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <GroupNote>The research behind the suggestions on Trends &rarr; Food.</GroupNote>
      </div>

      {open && <EvidenceSheet record={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
