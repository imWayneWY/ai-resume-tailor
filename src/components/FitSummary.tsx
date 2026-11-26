"use client";

import { useMemo } from "react";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";
import type { KeywordCategory } from "@/app/api/extract-keywords/route";

export interface FitSummaryKeyword {
  term: string;
  category: KeywordCategory;
  required: boolean;
}

export interface VerifiedSupportedKeyword {
  term: string;
  evidence: string;
}

interface FitSummaryProps {
  originalResume: string;
  jobDescription: string;
  /** Categorized JD keywords from /api/extract-keywords. Falls back to regex extraction (all "domain", not required) if not provided. */
  llmKeywords?: FitSummaryKeyword[];
  /** JD terms the tailoring model backed with a verbatim quote from the original resume. */
  verifiedSupportedKeywords?: VerifiedSupportedKeyword[];
  /** JD terms the AI flagged as unsupported by the original resume/confirmed facts. */
  missingKeywords?: { term: string; question: string }[];
  /** JD terms the candidate has confirmed they actually have experience with. */
  confirmedKeywords?: string[];
  /** Called when the user wants to jump to the Missing Keywords confirmation flow for a term. */
  onReviewTerm?: (term: string) => void;
}

function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[\s/-]+/g, " ");
}

interface BackedGroup {
  total: number;
  backed: number;
  items: { term: string; backed: boolean; evidence?: string }[];
}

function KeywordChips({
  items,
  onReviewTerm,
}: {
  items: { term: string; backed: boolean; evidence?: string }[];
  onReviewTerm?: (term: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted">None identified.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(({ term, backed, evidence }) => {
        const chipClasses = backed
          ? "border-success-border bg-success-bg text-success-text"
          : "border-error-border bg-error-bg text-error-text";
        const content = (
          <>
            <span aria-hidden="true">{backed ? "✓" : "✗"}</span> {term}
          </>
        );
        const title = backed && evidence ? `Backed by: ${evidence}` : undefined;
        if (!backed && onReviewTerm) {
          return (
            <li key={term}>
              <button
                type="button"
                onClick={() => onReviewTerm(term)}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${chipClasses}`}
              >
                {content}
              </button>
            </li>
          );
        }
        return (
          <li
            key={term}
            title={title}
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chipClasses}`}
          >
            {content}
          </li>
        );
      })}
    </ul>
  );
}

export default function FitSummary({
  originalResume,
  jobDescription,
  llmKeywords,
  verifiedSupportedKeywords,
  confirmedKeywords,
  onReviewTerm,
}: FitSummaryProps) {
  // Fall back to regex-extracted keywords (treated as domain, not required)
  // when the LLM extraction isn't available.
  const keywords = useMemo<FitSummaryKeyword[]>(() => {
    if (llmKeywords && llmKeywords.length > 0) {
      return llmKeywords;
    }
    return Array.from(extractKeywords(jobDescription)).map((term) => ({
      term,
      category: "domain" as KeywordCategory,
      required: false,
    }));
  }, [jobDescription, llmKeywords]);

  // Soft-category keywords are excluded entirely from the fit computation.
  const technicalAndDomain = useMemo(
    () => keywords.filter((k) => k.category !== "soft"),
    [keywords]
  );

  const verifiedSet = useMemo(
    () => new Set((verifiedSupportedKeywords ?? []).map((v) => normalizeTerm(v.term))),
    [verifiedSupportedKeywords]
  );

  const evidenceByTerm = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of verifiedSupportedKeywords ?? []) {
      map.set(normalizeTerm(v.term), v.evidence);
    }
    return map;
  }, [verifiedSupportedKeywords]);

  const confirmedSet = useMemo(
    () => new Set((confirmedKeywords ?? []).map(normalizeTerm)),
    [confirmedKeywords]
  );

  // Fallback signal: regex/string match against the ORIGINAL resume, used
  // only when evidence-verified / user-confirmed signals aren't available.
  const originalMatch = useMemo(() => {
    const jdKeywordSet = new Set(technicalAndDomain.map((k) => k.term.toLowerCase().trim()));
    return calculateMatchScore(originalResume, jdKeywordSet);
  }, [originalResume, technicalAndDomain]);

  const originalMatchedSet = useMemo(
    () => new Set(originalMatch.matchedKeywords.map(normalizeTerm)),
    [originalMatch]
  );

  const isBacked = useMemo(
    () => (term: string) => {
      const normalized = normalizeTerm(term);
      return (
        verifiedSet.has(normalized) ||
        confirmedSet.has(normalized) ||
        originalMatchedSet.has(normalized)
      );
    },
    [verifiedSet, confirmedSet, originalMatchedSet]
  );

  const { requiredGroup, niceToHaveGroup, weightedScore } = useMemo(() => {
    const required: BackedGroup = { total: 0, backed: 0, items: [] };
    const niceToHave: BackedGroup = { total: 0, backed: 0, items: [] };

    for (const kw of technicalAndDomain) {
      const backed = isBacked(kw.term);
      const group = kw.required ? required : niceToHave;
      group.total += 1;
      if (backed) group.backed += 1;
      group.items.push({ term: kw.term, backed, evidence: evidenceByTerm.get(normalizeTerm(kw.term)) });
    }

    const denom = required.total * 2 + niceToHave.total * 1;
    const score =
      denom > 0
        ? Math.round(((required.backed * 2 + niceToHave.backed * 1) / denom) * 100)
        : 0;

    return { requiredGroup: required, niceToHaveGroup: niceToHave, weightedScore: score };
  }, [technicalAndDomain, isBacked, evidenceByTerm]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Fit summary
          </h2>
          <p className="mt-1 text-xs text-muted">
            JD keywords grouped by how critical they are, and whether your resume
            or confirmed facts back them up. Soft skills are excluded.
          </p>
        </div>
        {(requiredGroup.total > 0 || niceToHaveGroup.total > 0) && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold">{weightedScore}</div>
            <div className="text-xs text-muted">weighted fit</div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">
            Required: {requiredGroup.backed} / {requiredGroup.total} backed
          </p>
          <KeywordChips items={requiredGroup.items} onReviewTerm={onReviewTerm} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">
            Nice-to-have: {niceToHaveGroup.backed} / {niceToHaveGroup.total} backed
          </p>
          <KeywordChips items={niceToHaveGroup.items} onReviewTerm={onReviewTerm} />
        </div>
      </div>
    </div>
  );
}
