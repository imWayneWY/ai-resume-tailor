"use client";

export interface Change {
  section: string;
  original: string;
  revised: string;
  reason: string;
  jdTermsUsed: string[];
}

interface ChangesDiffProps {
  changes: Change[];
  onAccept: (index: number) => void;
  onReject: (index: number) => void;
  rejectedIndices?: Set<number>;
  failedIndices?: Set<number>;
}

export default function ChangesDiff({
  changes,
  onAccept,
  onReject,
  rejectedIndices,
  failedIndices,
}: ChangesDiffProps) {
  if (!changes || changes.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        Review Changes
      </h2>
      <ul className="flex flex-col gap-4">
        {changes.map((change, i) => {
          const isRejected = rejectedIndices?.has(i);
          return (
            <li key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {change.section}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAccept(i)}
                    disabled={!isRejected}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onReject(i)}
                    disabled={isRejected}
                    className="rounded-md border border-error-border px-2 py-1 text-xs font-medium text-error-text transition-colors hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Original</p>
                  <p className="whitespace-pre-wrap rounded-md bg-card p-2 text-sm">
                    {change.original}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">
                    Revised {isRejected && <span className="text-error-text">(rejected)</span>}
                  </p>
                  <p
                    className={`whitespace-pre-wrap rounded-md p-2 text-sm ${
                      isRejected ? "bg-card line-through text-muted" : "bg-card"
                    }`}
                  >
                    {change.revised}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted">{change.reason}</p>

              {failedIndices?.has(i) && (
                <p className="mt-2 text-xs font-medium text-error-text">
                  This line was edited. Please update it manually.
                </p>
              )}

              {change.jdTermsUsed && change.jdTermsUsed.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {change.jdTermsUsed.map((term, j) => (
                    <span
                      key={j}
                      className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
