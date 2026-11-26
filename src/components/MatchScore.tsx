"use client";

import { useMemo, useEffect } from "react";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";
import { curveScore, scoreLabel } from "@/lib/score-curve";

interface MatchScoreProps {
  originalResume: string;
  tailoredResume: string;
  jobDescription: string;
  /** LLM-extracted keywords from /api/extract-keywords. Falls back to regex extraction if not provided. */
  llmKeywords?: string[];
  /** Server-computed before score (0-100), used when available. */
  serverBeforeScore?: number;
  /** Server-computed after score (0-100), used when available. */
  serverAfterScore?: number;
  /** JD terms the AI flagged as unsupported by the original resume/confirmed facts. */
  missingKeywords?: { term: string; question: string }[];
  /** JD terms the candidate has confirmed they actually have experience with. */
  confirmedKeywords?: string[];
}

function ScoreCircle({
  score,
  label,
  size = 80,
}: {
  score: number;
  label: string;
  size?: number;
}) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 70
      ? "text-green-500"
      : score >= 50
        ? "text-yellow-500"
        : "text-red-500";

  const strengthLabel = scoreLabel(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-score-track"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${color} transition-all duration-700`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold">{score}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className={`text-xs font-semibold ${color}`}>{strengthLabel}</span>
    </div>
  );
}

function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[\s/-]+/g, " ");
}

export default function MatchScore({
  originalResume,
  tailoredResume,
  jobDescription,
  llmKeywords,
  serverBeforeScore,
  serverAfterScore,
  missingKeywords,
  confirmedKeywords,
}: MatchScoreProps) {
  // Use LLM-extracted keywords if available, otherwise fall back to regex
  const jdKeywords = useMemo(() => {
    if (llmKeywords && llmKeywords.length > 0) {
      return new Set(llmKeywords.map((k) => k.toLowerCase().trim()));
    }
    return extractKeywords(jobDescription);
  }, [jobDescription, llmKeywords]);

  // Prefer server-computed scores when available
  const hasServerScores = typeof serverBeforeScore === "number" && typeof serverAfterScore === "number";

  // Only compute client-side scores when server scores aren't available
  const beforeScore = useMemo(
    () => hasServerScores ? null : calculateMatchScore(originalResume, jdKeywords),
    [originalResume, jdKeywords, hasServerScores]
  );

  const afterScore = useMemo(
    () => calculateMatchScore(tailoredResume, jdKeywords),
    [tailoredResume, jdKeywords]
  );

  const usingLlm = !!(llmKeywords && llmKeywords.length > 0);

  // Compute 0-100 scores (curved for intuitive display)
  const totalKw = jdKeywords.size;
  // Server scores arrive pre-curved from /api/tailor (raw scores are only stored in DB).
  // Client-side fallback computes raw percentage then curves it here.
  const beforeScoreNum = hasServerScores ? serverBeforeScore! : curveScore(totalKw > 0 && beforeScore ? Math.round((beforeScore.matchCount / totalKw) * 100) : 0);

  // "Backed coverage": JD keywords matched in the ORIGINAL resume (facts the
  // candidate already demonstrably has), plus keywords the candidate has
  // since confirmed via the Missing Keywords flow — divided by the total
  // number of JD keywords. This does not depend on the model reporting
  // itself honestly, and it is not a measurement of the tailored text.
  const jdKeywordsNormalized = useMemo(
    () => new Set(Array.from(jdKeywords).map(normalizeTerm)),
    [jdKeywords]
  );

  const confirmedSet = useMemo(() => {
    const set = new Set<string>();
    for (const term of confirmedKeywords || []) {
      if (!term) continue;
      const normalized = normalizeTerm(term);
      if (jdKeywordsNormalized.has(normalized)) {
        set.add(normalized);
      }
    }
    return set;
  }, [confirmedKeywords, jdKeywordsNormalized]);

  const originalMatchedScore = useMemo(
    () => calculateMatchScore(originalResume, jdKeywords),
    [originalResume, jdKeywords]
  );

  const backedCoverageNum = useMemo(() => {
    if (totalKw === 0) return 0;
    const backed = new Set<string>();
    for (const matched of originalMatchedScore.matchedKeywords) {
      backed.add(normalizeTerm(matched));
    }
    for (const term of confirmedSet) {
      backed.add(term);
    }
    return curveScore(Math.min(100, Math.round((backed.size / totalKw) * 100)));
  }, [originalMatchedScore, confirmedSet, totalKw]);

  const afterScoreNum = backedCoverageNum;

  // Log keywords to browser console for inspection (only when doing client-side scoring)
  useEffect(() => {
    if (hasServerScores) {
      console.debug(`[MatchScore] Using server-computed scores (before=${serverBeforeScore}, after=${serverAfterScore})`);
    } else {
      console.debug(
        `[MatchScore] Using ${usingLlm ? "LLM" : "regex"}-extracted keywords (${jdKeywords.size} total)`
      );
    }
    if (afterScore.matchedKeywords.length > 0) {
      console.debug(
        "[MatchScore] Matched keywords:",
        afterScore.matchedKeywords.join(", ")
      );
    }
    if (afterScore.missedKeywords.length > 0) {
      console.debug(
        "[MatchScore] Unmatched keywords:",
        afterScore.missedKeywords.join(", ")
      );
    }
  }, [afterScore, hasServerScores, serverBeforeScore, serverAfterScore, jdKeywords.size, usingLlm]);

  // Suppress unused-var lint for missingKeywords — kept in the prop list for
  // API compatibility with callers that still pass it, even though scoring
  // no longer depends on it directly.
  void missingKeywords;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
        Keyword coverage backed by real experience
      </h2>
      <p className="mb-4 text-xs text-muted">
        &quot;Before&quot; is the raw JD match score for context. &quot;After&quot; measures JD
        keywords backed by your original resume or facts you&apos;ve confirmed —
        these two scores use different methods and are not directly comparable.
      </p>

      {/* Score circles */}
      <div className="flex items-center justify-center gap-6 sm:gap-8">
        <ScoreCircle
          score={beforeScoreNum}
          label="Before (raw match)"
        />

        {/* Arrow (no numeric improvement indicator — before/after use different scoring methods) */}
        <div className="flex flex-col items-center gap-1">
          <svg
            className="h-6 w-6 text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </div>

        <ScoreCircle
          score={afterScoreNum}
          label="After (backed)"
        />
      </div>

    </div>
  );
}
