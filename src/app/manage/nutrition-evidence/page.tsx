"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import { EVIDENCE_RECORDS, type EvidenceStrength, type EvidenceType } from "@/lib/nutritionEvidenceRecords";

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

/**
 * The research behind Food Analytics' recommendations, moved here so the
 * analytics page itself stays citation-free — this is the one place PubMed
 * IDs, DOIs, and study details are meant to be read. Reuses the same
 * EVIDENCE_RECORDS the recommendation engine's `evidenceId` fields point
 * into; nothing here is a second evidence system.
 */
export default function NutritionEvidencePage() {
  const records = Object.values(EVIDENCE_RECORDS);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Link href="/manage" className="underline decoration-dotted">Manage</Link>
          <span>→</span>
          <span>Nutrition evidence</span>
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Nutrition evidence
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          The research behind Food Analytics&apos; suggestions — systematic reviews, meta-analyses, and cohort
          studies, each with its actual source and limitations. Food Analytics itself never shows this; it only
          ever says what&apos;s underrepresented in what you&apos;ve logged and what to consider adding.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {records.map((record) => (
          <Card key={record.id} tier="raw">
            <div className="flex items-start justify-between gap-3">
              <CardTitle size="sm">{record.topic}</CardTitle>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{
                  color: STRENGTH_COLOR[record.strength],
                  background: `color-mix(in oklab, ${STRENGTH_COLOR[record.strength]} 14%, transparent)`,
                }}
              >
                {record.strength} evidence
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {record.evidenceTypes.map((type) => EVIDENCE_TYPE_LABEL[type]).join(" + ")}
                {record.publicationYear && ` · ${record.publicationYear}`}
              </span>
            </div>

            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{record.claim}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{record.explanation}</p>

            <p className="mt-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              Limitations
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{record.limitations}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs" style={{ borderColor: "var(--gridline)", color: "var(--text-muted)" }}>
              {record.pubmedId && (
                <a
                  href={record.url ?? `https://pubmed.ncbi.nlm.nih.gov/${record.pubmedId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                  style={{ color: "var(--series-2)" }}
                >
                  PubMed {record.pubmedId}
                </a>
              )}
              {record.doi && <span>DOI: {record.doi}</span>}
              {!record.pubmedId && !record.doi && <span>No direct source link available yet.</span>}
              <span>Reviewed {record.reviewedDate}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
