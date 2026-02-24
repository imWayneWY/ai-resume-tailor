"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface HistoryEntry {
  id: string;
  created_at: string;
  jd_snippet: string | null;
  before_score: number | null;
  after_score: number | null;
  credits_used: number;
}

function formatLocalDate(utcString: string): string {
  const date = new Date(utcString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLocalTime(utcString: string): string {
  const date = new Date(utcString);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScoreImprovement({
  before,
  after,
}: {
  before: number | null;
  after: number | null;
}) {
  if (before === null || after === null) {
    return <span className="text-muted">—</span>;
  }

  const improved = after > before;
  const diff = after - before;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted">{before}</span>
      <span className="text-muted">→</span>
      <span className={improved ? "font-semibold text-accent" : "text-foreground"}>
        {after}
      </span>
      {diff !== 0 && (
        <span
          className={`text-xs ${
            improved ? "text-success-text" : "text-error-text"
          }`}
        >
          ({diff > 0 ? "+" : ""}{diff})
        </span>
      )}
    </span>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/history");
        if (res.status === 401) {
          setError("Please sign in to view your history.");
          return;
        }
        if (!res.ok) {
          setError("Failed to load history.");
          return;
        }
        const data = await res.json();
        setHistory(data.history ?? []);
      } catch {
        setError("Failed to load history.");
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Usage History</h1>
      <p className="mt-1 text-sm text-muted">
        Your recent resume tailoring activity
      </p>

      {loading && (
        <div className="mt-8 text-center text-muted">Loading...</div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-muted">{error}</p>
          <Link
            href="/auth/login"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Sign in →
          </Link>
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-muted">No tailoring history yet.</p>
          <Link
            href="/tailor"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Tailor your first resume →
          </Link>
        </div>
      )}

      {!loading && !error && history.length > 0 && (
        <div className="mt-6 space-y-3">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.jd_snippet || "Resume tailoring"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatLocalDate(entry.created_at)} at{" "}
                  {formatLocalTime(entry.created_at)}
                </p>
              </div>
              <div className="ml-4 text-sm">
                <ScoreImprovement
                  before={entry.before_score}
                  after={entry.after_score}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
