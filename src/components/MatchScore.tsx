"use client";

import { useMemo, useEffect } from "react";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";

interface MatchScoreProps {
  originalResume: string;
  tailoredResume: string;
  jobDescription: string;
  /** LLM-extracted keywords from /api/extract-keywords. Falls back to regex extraction if not provided. */
  llmKeywords?: string[];
  /** Server-computed before score (0-100). Used for redacted results where client can't compute. */
  serverBeforeScore?: number;
  /** Server-computed after score (0-100). Used for redacted results where client can't compute. */
  serverAfterScore?: number;
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
    score >= 60
      ? "text-green-500"
      : score >= 35
        ? "text-yellow-500"
        : "text-red-500";

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
            className="text-gray-200"
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
}: MatchScoreProps) {
  // Use LLM-extracted keywords if available, otherwise fall back to regex
  const jdKeywords = useMemo(() => {
    if (llmKeywords && llmKeywords.length > 0) {
      return new Set(llmKeywords.map((k) => k.toLowerCase().trim()));
    }
    return extractKeywords(jobDescription);
  }, [jobDescription, llmKeywords]);

  // Prefer server-computed scores (needed for redacted results where client text is gibberish)
  const hasServerScores = typeof serverBeforeScore === "number" && typeof serverAfterScore === "number";

  // Only compute client-side scores when server scores aren't available
  const beforeScore = useMemo(
    () => hasServerScores ? null : calculateMatchScore(originalResume, jdKeywords),
    [originalResume, jdKeywords, hasServerScores]
  );

  const afterScore = useMemo(
    () => hasServerScores ? null : calculateMatchScore(tailoredResume, jdKeywords),
    [tailoredResume, jdKeywords, hasServerScores]
  );

  const usingLlm = !!(llmKeywords && llmKeywords.length > 0);

  // Compute 0-100 scores
  const totalKw = jdKeywords.size;
  const beforeScoreNum = hasServerScores ? serverBeforeScore : (totalKw > 0 && beforeScore ? Math.round((beforeScore.matchCount / totalKw) * 100) : 0);
  const afterScoreNum = hasServerScores ? serverAfterScore : (totalKw > 0 && afterScore ? Math.round((afterScore.matchCount / totalKw) * 100) : 0);
  const scoreImprovement = afterScoreNum - beforeScoreNum;

  // Log keywords to browser console for inspection (only when doing client-side scoring)
  useEffect(() => {
    if (hasServerScores) {
      console.debug(`[MatchScore] Using server-computed scores (before=${serverBeforeScore}, after=${serverAfterScore})`);
      return;
    }
    console.debug(
      `[MatchScore] Using ${usingLlm ? "LLM" : "regex"}-extracted keywords (${jdKeywords.size} total)`
    );
    if (afterScore && afterScore.matchedKeywords.length > 0) {
      console.debug(
        "[MatchScore] Matched keywords:",
        afterScore.matchedKeywords.join(", ")
      );
    }
    if (afterScore && afterScore.missedKeywords.length > 0) {
      console.debug(
        "[MatchScore] Unmatched keywords:",
        afterScore.missedKeywords.join(", ")
      );
    }
  }, [afterScore, hasServerScores, serverBeforeScore, serverAfterScore, jdKeywords.size, usingLlm]);

  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        JD Match Score
      </h2>

      {/* Score circles */}
      <div className="flex items-center justify-center gap-6 sm:gap-8">
        <ScoreCircle
          score={beforeScoreNum}
          label="Before"
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
            <span className="text-xs font-semibold text-green-600">
              +{scoreImprovement}
            </span>
          )}
        </div>

        <ScoreCircle
          score={afterScoreNum}
          label="After"
        />
      </div>

    </div>
  );
}
