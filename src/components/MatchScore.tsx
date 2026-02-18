"use client";

import { useMemo, useEffect } from "react";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";

interface MatchScoreProps {
  originalResume: string;
  tailoredResume: string;
  jobDescription: string;
  /** LLM-extracted keywords from /api/extract-keywords. Falls back to regex extraction if not provided. */
  llmKeywords?: string[];
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
}: MatchScoreProps) {
  // Use LLM-extracted keywords if available, otherwise fall back to regex
  const jdKeywords = useMemo(() => {
    if (llmKeywords && llmKeywords.length > 0) {
      return new Set(llmKeywords.map((k) => k.toLowerCase().trim()));
    }
    return extractKeywords(jobDescription);
  }, [jobDescription, llmKeywords]);

  const beforeScore = useMemo(
    () => calculateMatchScore(originalResume, jdKeywords),
    [originalResume, jdKeywords]
  );

  const afterScore = useMemo(
    () => calculateMatchScore(tailoredResume, jdKeywords),
    [tailoredResume, jdKeywords]
  );

  const improvement = afterScore.matchCount - beforeScore.matchCount;

  const usingLlm = !!(llmKeywords && llmKeywords.length > 0);

  // Compute 0-100 scores (no % symbol — just numbers)
  const totalKw = jdKeywords.size;
  const beforeScoreNum = totalKw > 0 ? Math.round((beforeScore.matchCount / totalKw) * 100) : 0;
  const afterScoreNum = totalKw > 0 ? Math.round((afterScore.matchCount / totalKw) * 100) : 0;
  const scoreImprovement = afterScoreNum - beforeScoreNum;

  // Log keywords to browser console for inspection (use console.debug to reduce noise)
  useEffect(() => {
    console.debug(
      `[MatchScore] Using ${usingLlm ? "LLM" : "regex"}-extracted keywords (${jdKeywords.size} total)`
    );
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
  }, [afterScore.matchedKeywords, afterScore.missedKeywords, jdKeywords.size, usingLlm]);

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
