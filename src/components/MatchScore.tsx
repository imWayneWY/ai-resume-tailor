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

export default function MatchScore({
  originalResume,
  tailoredResume,
  jobDescription,
  llmKeywords,
  serverBeforeScore,
  serverAfterScore,
  missingKeywords,
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

  // "Keyword coverage backed by real experience": only credit JD keywords the
  // model actually matched in the tailored resume AND did not flag as
  // unsupported in missingKeywords — i.e. keywords genuinely backed by the
  // original resume or facts the candidate has since confirmed.
  const unconfirmedTerms = useMemo(() => {
    const terms = new Set<string>();
    for (const mk of missingKeywords || []) {
      if (mk?.term) terms.add(mk.term.toLowerCase().trim());
    }
    return terms;
  }, [missingKeywords]);

  const backedCoverageNum = useMemo(() => {
    if (totalKw === 0) return 0;
    let backedCount = 0;
    for (const matched of afterScore.matchedKeywords) {
      if (!unconfirmedTerms.has(matched.toLowerCase().trim())) {
        backedCount += 1;
      }
    }
    return curveScore(Math.round((backedCount / totalKw) * 100));
  }, [afterScore, unconfirmedTerms, totalKw]);

  const afterScoreNum = backedCoverageNum;
  const scoreImprovement = afterScoreNum - beforeScoreNum;

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

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
        Keyword coverage backed by real experience
      </h2>
      <p className="mb-4 text-xs text-muted">
        &quot;Before&quot; is the raw JD match score for context. &quot;After&quot; only counts keywords the
        original resume or your confirmed facts actually support.
      </p>

      {/* Score circles */}
      <div className="flex items-center justify-center gap-6 sm:gap-8">
        <ScoreCircle
          score={beforeScoreNum}
          label="Before (raw match)"
        />

        {/* Arrow with improvement */}
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
          {scoreImprovement > 0 && (
            <span className="text-xs font-semibold text-success-text">
              +{scoreImprovement}
            </span>
          )}
        </div>

        <ScoreCircle
          score={afterScoreNum}
          label="After (backed)"
        />
      </div>

    </div>
  );
}
