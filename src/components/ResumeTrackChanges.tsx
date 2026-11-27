"use client";

import { useMemo, useState } from "react";
import {
  splitIntoUnits,
  alignUnits,
  diffAlignedPair,
  extractOriginalSectionText,
  type UnitDiff,
  type WordDiffOp,
} from "@/lib/diff-utils";

export interface TrackChangesSection {
  title: string;
  content: string;
}

export interface ChangeReasonEntry {
  section: string;
  original: string;
  revised: string;
  reason: string;
}

interface ResumeTrackChangesProps {
  sections: TrackChangesSection[];
  originalResume: string;
  changes?: ChangeReasonEntry[];
  onSectionsChange: (sections: TrackChangesSection[]) => void;
}

/** Renders word-diff ops with strikethrough/highlight styling. */
function DiffOps({ ops }: { ops: WordDiffOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.type === "equal") return <span key={i}>{op.value}</span>;
        if (op.type === "remove") {
          return (
            <span key={i} className="text-muted line-through decoration-error-text/70">
              {op.value}
            </span>
          );
        }
        return (
          <span key={i} className="rounded-sm bg-success-bg text-success-text">
            {op.value}
          </span>
        );
      })}
    </>
  );
}

/** Best-effort match of a unit diff to the model's self-reported reason. */
function findReason(
  diff: UnitDiff,
  changes: ChangeReasonEntry[] | undefined,
  sectionTitle: string
): string | undefined {
  if (!changes || changes.length === 0) return undefined;
  const candidates = changes.filter((c) => c.section === sectionTitle);
  const pool = candidates.length > 0 ? candidates : changes;
  let best: ChangeReasonEntry | undefined;
  let bestScore = 0;
  for (const c of pool) {
    const revisedOverlap = c.revised && diff.tailoredText.includes(c.revised.slice(0, 20));
    const originalOverlap = c.original && diff.originalText.includes(c.original.slice(0, 20));
    const score = (revisedOverlap ? 1 : 0) + (originalOverlap ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best?.reason : undefined;
}

interface UnitRowProps {
  diff: UnitDiff;
  isBullet: boolean;
  showChanges: boolean;
  reason?: string;
  onRevert: () => void;
  onEdit: (text: string) => void;
}

function UnitRow({ diff, isBullet, showChanges, reason, onRevert, onEdit }: UnitRowProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(diff.tailoredText);

  if (editing) {
    return (
      <div className={isBullet ? "mb-1 pl-4" : "mb-1"}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(2, Math.ceil(draft.length / 80))}
          className="w-full resize-y rounded-md border border-accent bg-surface p-2 text-sm leading-relaxed focus:outline-none"
        />
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onEdit(draft);
              setEditing(false);
              setOpen(false);
            }}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(diff.tailoredText);
              setEditing(false);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isChanged = diff.changed && diff.originalIndex !== -1;

  return (
    <div className={isBullet ? "relative mb-1 pl-4" : "relative mb-1"}>
      <span
        role={isChanged ? "button" : undefined}
        tabIndex={isChanged ? 0 : undefined}
        onClick={() => isChanged && setOpen((o) => !o)}
        className={`whitespace-pre-wrap text-sm leading-relaxed ${
          isChanged ? "cursor-pointer rounded-sm hover:bg-surface" : ""
        }`}
      >
        {isBullet && <span className="absolute left-0">•</span>}
        {showChanges && isChanged ? <DiffOps ops={diff.ops} /> : diff.tailoredText}
        {diff.warn && (
          <span
            title="This diff removes content that may be a real fact — review before accepting"
            className="ml-1 text-error-text"
            aria-label="warning"
          >
            ⚠
          </span>
        )}
      </span>

      {open && isChanged && (
        <div className="mt-1 w-full rounded-md border border-border bg-card p-2 text-xs shadow-sm">
          {reason && <p className="mb-2 text-muted">{reason}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onRevert();
                setOpen(false);
              }}
              className="rounded-md border border-border px-2 py-1 font-medium hover:bg-surface"
            >
              Revert
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(diff.tailoredText);
                setEditing(true);
              }}
              className="rounded-md border border-border px-2 py-1 font-medium hover:bg-surface"
            >
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Unified track-changes Resume block. Replaces the old Review Changes
 * (ChangesDiff) card and the separate read-only Preview + editable "Edit
 * Sections" panes with ONE block that:
 *  - Computes diffs directly from original vs. tailored text (not from the
 *    model's self-reported `changes`, which can miss real diffs).
 *  - Lets the user toggle between a diff view ("Show changes") and the
 *    exact clean/final text ("Clean" — what the PDF renders).
 *  - Supports click-to-revert / click-to-edit per bullet/sentence.
 */
export default function ResumeTrackChanges({
  sections,
  originalResume,
  changes,
  onSectionsChange,
}: ResumeTrackChangesProps) {
  const [showChanges, setShowChanges] = useState(true);

  // For each section, best-effort extract the comparable original text by
  // heading match. If no match is found, fall back to the whole original
  // resume as the alignment pool so bullets can still find a reasonable
  // counterpart (at reduced precision) rather than skipping diffing
  // entirely.
  const sectionDiffs = useMemo(() => {
    return sections.map((section) => {
      const matchedOriginal = extractOriginalSectionText(originalResume, section.title);
      const originalPool = matchedOriginal.trim().length > 0 ? matchedOriginal : originalResume;
      const originalUnits = splitIntoUnits(originalPool);
      const tailoredUnits = splitIntoUnits(section.content);
      const pairs = alignUnits(originalUnits, tailoredUnits);
      const diffs = pairs.map(diffAlignedPair);
      return { section, tailoredUnits, diffs };
    });
  }, [sections, originalResume]);

  const updateUnitText = (sectionIndex: number, unitIndex: number, newText: string) => {
    const { tailoredUnits } = sectionDiffs[sectionIndex];
    const next = tailoredUnits.map((u, i) => (i === unitIndex ? { ...u, text: newText } : u));
    const newContent = next
      .map((u) => (u.isBullet ? `• ${u.text}` : u.text))
      .join(sections[sectionIndex].content.includes("\n") ? "\n" : " ");
    const nextSections = sections.map((s, i) =>
      i === sectionIndex ? { ...s, content: newContent } : s
    );
    onSectionsChange(nextSections);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Resume</h2>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setShowChanges(true)}
            aria-pressed={showChanges}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${
              showChanges ? "bg-accent text-white" : "text-muted hover:bg-surface"
            }`}
          >
            Show changes
          </button>
          <button
            type="button"
            onClick={() => setShowChanges(false)}
            aria-pressed={!showChanges}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${
              !showChanges ? "bg-accent text-white" : "text-muted hover:bg-surface"
            }`}
          >
            Clean
          </button>
        </div>
      </div>

      {sectionDiffs.map(({ section, diffs }, sectionIndex) => (
        <div key={section.title} className={sectionIndex > 0 ? "mt-6" : ""}>
          <h3 className="mb-3 border-b border-border pb-1 text-lg font-semibold tracking-tight">
            {section.title}
          </h3>
          <div>
            {diffs.map((diff, unitIndex) => (
              <UnitRow
                key={unitIndex}
                diff={diff}
                isBullet={sectionDiffs[sectionIndex].tailoredUnits[unitIndex]?.isBullet ?? false}
                showChanges={showChanges}
                reason={findReason(diff, changes, section.title)}
                onRevert={() => {
                  if (diff.originalIndex === -1) return;
                  updateUnitText(sectionIndex, unitIndex, diff.originalText);
                }}
                onEdit={(text) => updateUnitText(sectionIndex, unitIndex, text)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
