"use client";

import { useMemo } from "react";
import { extractKeywords, calculateMatchScore } from "@/lib/keyword-matcher";

interface MatchScoreProps {
  originalResume: string;
  tailoredResume: string;
  jobDescription: string;
}

function ScoreCircle({
  score,
  total,
  label,
  size = 80,
}: {
  score: number;
  total: number;
  label: string;
  size?: number;
}) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = total > 0 ? (score / total) * 100 : 0;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage >= 60
      ? "text-green-500"
      : percentage >= 35
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
}: MatchScoreProps) {
  const jdKeywords = useMemo(
    () => extractKeywords(jobDescription),
    [jobDescription]
  );

  const beforeScore = useMemo(
    () => calculateMatchScore(originalResume, jdKeywords),
    [originalResume, jdKeywords]
  );

  const afterScore = useMemo(
    () => calculateMatchScore(tailoredResume, jdKeywords),
    [tailoredResume, jdKeywords]
  );

  const improvement = afterScore.matchCount - beforeScore.matchCount;

  // Log missed keywords to console for developer inspection
  if (afterScore.missedKeywords.length > 0) {
    console.log(
      "[MatchScore] Unmatched keywords:",
      afterScore.missedKeywords.join(", ")
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        JD Match Score
      </h2>

      {/* Score circles */}
      <div className="flex items-center justify-center gap-6 sm:gap-8">
        <ScoreCircle
          score={beforeScore.matchCount}
          total={beforeScore.totalKeywords}
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
          {improvement > 0 && (
            <span className="text-xs font-semibold text-green-600">
              +{improvement}
            </span>
          )}
        </div>

        <ScoreCircle
          score={afterScore.matchCount}
          total={afterScore.totalKeywords}
          label="After"
        />
      </div>

      {/* Stats */}
      <div className="mt-4 flex justify-center gap-6 text-xs text-muted">
        <span>
          {afterScore.matchCount} of {afterScore.totalKeywords} keywords matched
        </span>
      </div>
    </div>
  );
}
