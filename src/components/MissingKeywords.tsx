"use client";

import { useState, useMemo } from "react";

export interface MissingKeywordItem {
  term: string;
  question: string;
}

export interface ConfirmedFactEntry {
  term: string;
  explanation: string;
}

interface MissingKeywordsProps {
  missingKeywords: MissingKeywordItem[];
  onRegenerate: (confirmedEntries: ConfirmedFactEntry[]) => void;
  isRegenerating?: boolean;
}

function MissingKeywordsInner({
  missingKeywords,
  onRegenerate,
  isRegenerating = false,
}: MissingKeywordsProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});

  const confirmed = useMemo(() => {
    return missingKeywords
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => checked[i] && explanations[i]?.trim());
  }, [missingKeywords, checked, explanations]);

  const confirmedEntries = useMemo<ConfirmedFactEntry[]>(
    () => confirmed.map(({ item, i }) => ({ term: item.term, explanation: explanations[i].trim() })),
    [confirmed, explanations]
  );

  const hasAnyConfirmed = confirmedEntries.length > 0;

  if (!missingKeywords || missingKeywords.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
        Missing Keywords
      </h2>
      <p className="mb-4 text-xs text-muted">
        These JD terms weren&apos;t supported by your original resume, so they were left out. If
        you&apos;ve actually done this work, confirm it below and regenerate.
      </p>
      <ul className="flex flex-col gap-3">
        {missingKeywords.map((item, i) => (
          <li key={`${item.term}-${i}`} className="rounded-lg border border-border bg-surface p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={!!checked[i]}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [i]: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
              />
              <span>{item.term}</span>
            </label>
            <p className="mt-1 ml-6 text-xs text-muted">{item.question}</p>
            <input
              type="text"
              value={explanations[i] || ""}
              onChange={(e) =>
                setExplanations((prev) => ({ ...prev, [i]: e.target.value }))
              }
              disabled={!checked[i]}
              placeholder="One sentence explaining your experience..."
              className="mt-2 ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </li>
        ))}
      </ul>
      <button
        onClick={() => onRegenerate(confirmedEntries)}
        disabled={!hasAnyConfirmed || isRegenerating}
        className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRegenerating ? "Regenerating…" : "Regenerate with confirmed facts"}
      </button>
    </div>
  );
}

/**
 * Keys on the term list (joined) so checkbox/explanation state resets
 * whenever the set of missing keywords changes (e.g. after regenerating).
 */
export default function MissingKeywords(props: MissingKeywordsProps) {
  const key = props.missingKeywords.map((m) => m.term).join("|");
  return <MissingKeywordsInner key={key} {...props} />;
}
