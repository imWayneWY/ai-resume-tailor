"use client";

import React, { useMemo, useState } from "react";
import {
  splitIntoUnits,
  alignUnits,
  diffAlignedPair,
  extractOriginalSectionText,
  findUnmatchedOriginalIndices,
  findMissingOriginalSections,
  groupTailoredIndicesByOriginal,
  replaceUnitSpan,
  replaceUnitsSpan,
  insertUnitAfter,
  type ContentUnit,
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

/**
 * Renders `**bold text**` markdown-style markup as actual bold (<strong>)
 * React nodes. Any text outside `**...**` pairs is rendered as plain text.
 * Used for both Show-changes (per diff-op, after the diff is computed) and
 * Clean mode (plain final text) so entry headers like
 * "**MICROSOFT, VANCOUVER, SDE2 (2023 - PRESENT)**" render bold instead of
 * showing raw asterisks.
 */
function renderBold(text: string, keyPrefix = ""): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .map((part, i) => {
      const m = /^\*\*([^*]+)\*\*$/.exec(part);
      if (m) {
        return (
          <strong key={`${keyPrefix}b${i}`} className="font-semibold">
            {m[1]}
          </strong>
        );
      }
      return part ? <span key={`${keyPrefix}t${i}`}>{part}</span> : null;
    })
    .filter((n): n is React.ReactElement => n !== null);
}

/** Renders word-diff ops with strikethrough/highlight styling. Bold styling is applied to the WHOLE unit (via the wrapping `<strong>` from the caller when `isBold`), not per-op — so a bold header that changes never leaves raw, unmatched `**` markers split across ops. */
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
  isAdded: boolean;
  onRevert?: () => void;
  onEdit: (text: string) => void;
  onRemove?: () => void;
}

function UnitRow({ diff, isBullet, showChanges, reason, isAdded, onRevert, onEdit, onRemove }: UnitRowProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(diff.tailoredText);

  if (editing) {
    const textareaId = `unit-edit-${diff.tailoredIndex}-${diff.originalIndex}`;
    return (
      <div className={isBullet ? "mb-1 pl-4" : "mb-1"}>
        <label htmlFor={textareaId} className="sr-only">
          Edit bullet text
        </label>
        <textarea
          id={textareaId}
          aria-label="Edit bullet text"
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
  const canRevert = isChanged && !!onRevert;

  const openPopover = () => setOpen((o) => !o);

  return (
    <div className={isBullet ? "relative mb-1 pl-4" : "relative mb-1"}>
      <button
        type="button"
        onClick={openPopover}
        className="w-full whitespace-pre-wrap rounded-sm text-left text-sm leading-relaxed hover:bg-surface"
      >
        {isBullet && <span className="absolute left-0">•</span>}
        {diff.isBold ? (
          <strong className="font-semibold">
            {showChanges && isChanged ? (
              <DiffOps ops={diff.ops} />
            ) : (
              diff.tailoredText.trim().replace(/^\*\*([\s\S]+)\*\*$/, "$1")
            )}
          </strong>
        ) : showChanges && isChanged ? (
          <DiffOps ops={diff.ops} />
        ) : (
          renderBold(diff.tailoredText)
        )}
        {showChanges && isAdded && (
          <span className="ml-1 rounded-sm bg-accent/10 px-1 text-[10px] font-medium uppercase tracking-wide text-accent">
            added
          </span>
        )}
        {showChanges && diff.warn && (
          <span
            title="This diff removes content that may be a real fact — review before accepting"
            className="ml-1 text-error-text"
            aria-label="warning"
          >
            ⚠
          </span>
        )}
      </button>

      {open && (
        <div className="mt-1 w-full rounded-md border border-border bg-card p-2 text-xs shadow-sm">
          {reason && <p className="mb-2 text-muted">{reason}</p>}
          <div className="flex gap-2">
            {canRevert && (
              <button
                type="button"
                onClick={() => {
                  onRevert?.();
                  setOpen(false);
                }}
                className="rounded-md border border-border px-2 py-1 font-medium hover:bg-surface"
              >
                Revert
              </button>
            )}
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
            {isAdded && onRemove && (
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  setOpen(false);
                }}
                className="rounded-md border border-error-border px-2 py-1 font-medium text-error-text hover:bg-error-bg"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface DeletedRowProps {
  text: string;
  isBullet: boolean;
  onRestore: () => void;
}

/** A whole original bullet/sentence with no tailored counterpart — fully struck-through, always warned, with a Restore action. */
function DeletedRow({ text, isBullet, onRestore }: DeletedRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={isBullet ? "relative mb-1 pl-4" : "relative mb-1"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full whitespace-pre-wrap rounded-sm text-left text-sm leading-relaxed hover:bg-surface"
      >
        {isBullet && <span className="absolute left-0">•</span>}
        <span className="text-muted line-through decoration-error-text/70" data-testid="deleted-row">
          {renderBold(text)}
        </span>
        <span
          title="This original content was fully removed — review before accepting"
          className="ml-1 text-error-text"
          aria-label="warning"
        >
          ⚠
        </span>
      </button>
      {open && (
        <div className="mt-1 w-full rounded-md border border-border bg-card p-2 text-xs shadow-sm">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onRestore();
                setOpen(false);
              }}
              className="rounded-md border border-border px-2 py-1 font-medium hover:bg-surface"
            >
              Restore
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
 *  - Supports click-to-revert / click-to-edit per bullet/sentence, surfaces
 *    fully-deleted bullets/sentences/sections with a Restore action, and
 *    treats split-bullet groups as one logical change on revert.
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
      const isFallbackPool = matchedOriginal.trim().length === 0;
      const originalPool = isFallbackPool ? originalResume : matchedOriginal;
      const originalUnits = splitIntoUnits(originalPool);
      const tailoredUnits = splitIntoUnits(section.content);
      const pairs = alignUnits(originalUnits, tailoredUnits);
      const diffs = pairs.map(diffAlignedPair);
      const unmatchedOriginalIndices = isFallbackPool ? [] : findUnmatchedOriginalIndices(originalUnits, pairs);
      const groups = groupTailoredIndicesByOriginal(pairs);
      return { section, originalUnits, tailoredUnits, diffs, unmatchedOriginalIndices, groups, isFallbackPool };
    });
  }, [sections, originalResume]);

  const missingSections = useMemo(
    () => findMissingOriginalSections(originalResume, sections),
    [originalResume, sections]
  );

  const setSectionContent = (sectionIndex: number, newContent: string) => {
    const nextSections = sections.map((s, i) => (i === sectionIndex ? { ...s, content: newContent } : s));
    onSectionsChange(nextSections);
  };

  /** Edits exactly one unit's span in place — never rejoins the whole section. */
  const updateUnitText = (sectionIndex: number, unitIndex: number, newText: string) => {
    const { tailoredUnits } = sectionDiffs[sectionIndex];
    const unit = tailoredUnits[unitIndex];
    if (!unit) return;
    const newContent = replaceUnitSpan(sections[sectionIndex].content, unit, newText);
    setSectionContent(sectionIndex, newContent);
  };

  /** Removes an added (originalIndex === -1) unit entirely from the section content. */
  const removeUnit = (sectionIndex: number, unitIndex: number) => {
    const { tailoredUnits } = sectionDiffs[sectionIndex];
    const unit = tailoredUnits[unitIndex];
    if (!unit) return;
    const content = sections[sectionIndex].content;
    // Remove the unit's span plus one adjacent line break / leading space so
    // we don't leave a dangling blank line behind.
    const before = content.slice(0, unit.start);
    const afterRaw = content.slice(unit.start + unit.raw.length);
    const after = afterRaw.replace(/^\r?\n/, "");
    const trimmedBefore = after.length === 0 ? before.replace(/\r?\n$/, "") : before;
    setSectionContent(sectionIndex, trimmedBefore + after);
  };

  /** Group-level revert: replaces ALL tailored units in the group with a single copy of the shared original text, collapsing the group back to one unit. */
  const revertGroup = (sectionIndex: number, originalIndex: number) => {
    const { tailoredUnits, originalUnits, groups } = sectionDiffs[sectionIndex];
    const tailoredIndices = groups.get(originalIndex);
    if (!tailoredIndices || tailoredIndices.length === 0) return;
    const groupUnits = tailoredIndices.map((i) => tailoredUnits[i]).filter(Boolean) as ContentUnit[];
    const originalUnit = originalUnits[originalIndex];
    if (!originalUnit || groupUnits.length === 0) return;
    const newContent = replaceUnitsSpan(sections[sectionIndex].content, groupUnits, originalUnit.text);
    setSectionContent(sectionIndex, newContent);
  };

  /** Restores a fully-deleted original unit back into the tailored content, right after the nearest preceding matched tailored unit (preserving order as best as possible). */
  const restoreDeletedUnit = (sectionIndex: number, originalIndex: number) => {
    const { tailoredUnits, originalUnits, diffs } = sectionDiffs[sectionIndex];
    const originalUnit = originalUnits[originalIndex];
    if (!originalUnit) return;
    // Find the nearest preceding original index that IS matched, then find
    // that matched tailored unit (last one, if split into a group) to
    // insert after.
    let afterUnit: ContentUnit | undefined;
    for (let oi = originalIndex - 1; oi >= 0; oi--) {
      const matchingDiffs = diffs.filter((d) => d.originalIndex === oi);
      if (matchingDiffs.length > 0) {
        const lastTailoredIndex = Math.max(...matchingDiffs.map((d) => d.tailoredIndex));
        afterUnit = tailoredUnits[lastTailoredIndex];
        break;
      }
    }
    const newContent = insertUnitAfter(sections[sectionIndex].content, afterUnit, originalUnit.raw);
    setSectionContent(sectionIndex, newContent);
  };

  /** Restores a fully-deleted original SECTION back into the sections array at its best-effort original position. */
  const restoreDeletedSection = (heading: string, content: string, insertIndex: number) => {
    const nextSections = [...sections];
    const clampedIndex = Math.max(0, Math.min(insertIndex, nextSections.length));
    nextSections.splice(clampedIndex, 0, { title: heading.replace(/:\s*$/, ""), content });
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

      {sectionDiffs.map(({ section, diffs, originalUnits, unmatchedOriginalIndices }, sectionIndex) => (
        <div key={section.title} className={sectionIndex > 0 ? "mt-6" : ""}>
          <h3 className="mb-3 border-b border-border pb-1 text-lg font-semibold tracking-tight">
            {section.title}
          </h3>
          <div>
            {diffs.map((diff, unitIndex) => {
              const unit = sectionDiffs[sectionIndex].tailoredUnits[unitIndex];
              const isBullet = unit?.isBullet ?? false;
              const isAdded = diff.originalIndex === -1;
              return (
                <UnitRow
                  key={unitIndex}
                  diff={diff}
                  isBullet={isBullet}
                  showChanges={showChanges}
                  reason={findReason(diff, changes, section.title)}
                  isAdded={isAdded}
                  onRevert={
                    diff.originalIndex !== -1
                      ? () => revertGroup(sectionIndex, diff.originalIndex)
                      : undefined
                  }
                  onEdit={(text) => updateUnitText(sectionIndex, unitIndex, text)}
                  onRemove={isAdded ? () => removeUnit(sectionIndex, unitIndex) : undefined}
                />
              );
            })}
            {showChanges &&
              unmatchedOriginalIndices.map((originalIndex) => {
                const originalUnit = originalUnits[originalIndex];
                if (!originalUnit) return null;
                return (
                  <DeletedRow
                    key={`deleted-${originalIndex}`}
                    text={originalUnit.text}
                    isBullet={originalUnit.isBullet}
                    onRestore={() => restoreDeletedUnit(sectionIndex, originalIndex)}
                  />
                );
              })}
          </div>
        </div>
      ))}

      {showChanges &&
        missingSections.map(({ heading, content, insertIndex }) => (
          <div key={`missing-section-${heading}`} className="mt-6" data-testid="deleted-section">
            <h3 className="mb-3 flex items-center gap-2 border-b border-border pb-1 text-lg font-semibold tracking-tight text-muted">
              {heading.replace(/:\s*$/, "")}
              <span className="rounded-sm bg-error-bg px-1 text-[10px] font-medium uppercase tracking-wide text-error-text">
                deleted section
              </span>
            </h3>
            <div className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-muted line-through decoration-error-text/70">
              {content}
              <span className="ml-1 text-error-text" aria-label="warning">
                ⚠
              </span>
            </div>
            <button
              type="button"
              onClick={() => restoreDeletedSection(heading, content, insertIndex)}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface"
            >
              Restore
            </button>
          </div>
        ))}
    </div>
  );
}
