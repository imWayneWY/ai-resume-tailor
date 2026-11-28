/**
 * Deterministic skill-restoration (part B) and best-effort LLM fact-repair
 * (part C) logic for the tailor API route. Both run server-side after
 * parseAndValidateResponse, operate on the NORMALIZED original resume text,
 * and are designed to never turn a successful tailoring into a failure —
 * any error here is caught and the original content is used as a safe
 * fallback.
 */

import { parseSkillItems, extractSkillsSectionFromRawText } from "@/lib/resume-validator";
import { splitIntoUnits, alignUnits, shouldWarnOnRemoval, replaceUnitSpan, wordDiff, type ContentUnit } from "@/lib/diff-utils";
import { isEntryHeader } from "@/lib/resume-layout";

export interface TailoredSection {
  title: string;
  content: string;
}

export interface SkillRestorationResult {
  sections: TailoredSection[];
  restoredSkills: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWordBoundary(text: string, item: string): boolean {
  const escaped = escapeRegExp(item.trim());
  if (!escaped) return false;
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
  return pattern.test(text);
}

/**
 * Small heuristic lookup table mapping skill name patterns to likely
 * category labels that might already exist in the tailored Skills content.
 * Matching is case-insensitive substring matching against the skill name.
 */
const CATEGORY_HINTS: { pattern: RegExp; categories: string[] }[] = [
  { pattern: /graphql|rest|grpc|api/i, categories: ["backend", "api"] },
  { pattern: /react|vue|angular|svelte|html|css|frontend/i, categories: ["frontend"] },
  { pattern: /node|express|django|flask|spring|backend/i, categories: ["backend"] },
  { pattern: /aws|azure|gcp|cloud|docker|kubernetes|terraform/i, categories: ["cloud", "backend & cloud", "devops"] },
  { pattern: /jest|playwright|cypress|mocha|testing|test/i, categories: ["testing"] },
  { pattern: /git|jira|figma|webpack|vite|tools/i, categories: ["tools"] },
  { pattern: /python|javascript|typescript|java|c\+\+|go|ruby|rust|languages/i, categories: ["languages"] },
];

/**
 * Finds the best-fitting existing category line in `tailoredSkillsContent`
 * for `skill`, by matching the skill's pattern hints against existing
 * category labels (text before a colon on each line). Returns the full
 * matching line (so the caller can append to it), or undefined if no good
 * fit was found.
 */
function findBestFitCategoryLine(skill: string, lines: string[]): string | undefined {
  const hint = CATEGORY_HINTS.find((h) => h.pattern.test(skill));
  if (!hint) return undefined;
  return lines.find((line) => {
    const labelMatch = /^\s*[-*]?\s*([^:|,;•\n]{1,40}):/.exec(line);
    if (!labelMatch) return false;
    const label = labelMatch[1].toLowerCase();
    return hint.categories.some((c) => label.includes(c));
  });
}

/**
 * Part B: guarantee no skills are dropped. Compares the skill items parsed
 * from the NORMALIZED original's Skills section against the tailored
 * Skills section's content, and appends any missing original skill to the
 * most fitting existing category line (or a new "Other:" line as fallback).
 * Entirely deterministic — no LLM call.
 */
export function restoreMissingSkills(
  normalizedOriginal: string,
  tailoredSections: TailoredSection[]
): SkillRestorationResult {
  const originalSkillsSection = extractSkillsSectionFromRawText(normalizedOriginal);
  const originalSkillItems = parseSkillItems(originalSkillsSection);
  if (originalSkillItems.length === 0) {
    return { sections: tailoredSections, restoredSkills: [] };
  }

  const skillsSectionIndex = tailoredSections.findIndex((s) => s?.title && /skills/i.test(s.title));
  if (skillsSectionIndex === -1) {
    return { sections: tailoredSections, restoredSkills: [] };
  }

  const skillsSection = tailoredSections[skillsSectionIndex];
  const missing = originalSkillItems.filter((item) => !containsWordBoundary(skillsSection.content, item));
  if (missing.length === 0) {
    return { sections: tailoredSections, restoredSkills: [] };
  }

  let content = skillsSection.content;
  const restored: string[] = [];
  for (const skill of missing) {
    // Re-check against the (possibly already-updated) content in case an
    // earlier appended skill happens to also satisfy this one (unlikely,
    // but keeps this loop correct under mutation).
    if (containsWordBoundary(content, skill)) continue;
    const lines = content.split(/\r?\n/);
    const targetLine = findBestFitCategoryLine(skill, lines);
    if (targetLine) {
      const updatedLine = `${targetLine.trimEnd()}, ${skill}`;
      content = content.replace(targetLine, updatedLine);
    } else {
      const separator = content.trim().length > 0 ? "\n" : "";
      content = `${content}${separator}Other: ${skill}`;
    }
    restored.push(skill);
  }

  const nextSections = tailoredSections.map((s, i) => (i === skillsSectionIndex ? { ...s, content } : s));
  return { sections: nextSections, restoredSkills: restored };
}

// --- Part C: fact-repair pass ---

export interface RepairCallResult {
  /** Maps a flagged bullet's id (we use its index into the flagged list) to repaired text. */
  repaired: Map<number, string>;
}

export interface FlaggedBullet {
  id: number;
  sectionIndex: number;
  unit: ContentUnit;
  originalText: string;
  tailoredText: string;
  droppedPhrase: string;
}

export type RepairLlmCaller = (flagged: FlaggedBullet[]) => Promise<RepairCallResult>;

/**
 * Finds the entry-header text (e.g. "**Acme Inc** — Engineer (2021-2023)")
 * that a given unit index falls under, by scanning backwards through
 * `units` for the nearest preceding entryHeader-classified line. Returns
 * `null` when the unit isn't under any entry header (e.g. a section with no
 * entry headers at all, like a flat bullet list) — in that case, units are
 * only considered "the same entry" as other headerless units in the SAME
 * section, never cross-matched with a headered section.
 */
function entryHeaderForUnit(units: ContentUnit[], unitIndex: number): string | null {
  for (let i = unitIndex; i >= 0; i--) {
    if (!units[i].isBullet && isEntryHeader(units[i].raw)) {
      return units[i].raw.trim();
    }
  }
  return null;
}

/**
 * Finds bullets whose tailored text dropped a fact (per shouldWarnOnRemoval),
 * by aligning each original bullet (from the NORMALIZED original, split via
 * diff-utils's splitIntoUnits) to its corresponding tailored bullet using
 * diff-utils's existing alignUnits — reusing the SAME alignment heuristic
 * used by the UI, never inventing a new one.
 *
 * Guard: alignUnits aligns by word-overlap similarity across the WHOLE
 * normalized original, with no awareness of which job/entry a bullet
 * belongs to. Two similar bullets from DIFFERENT jobs can be matched to
 * each other. If that happens here, the repair pass could replace a bullet
 * in one job with (or fall back to) the original text from a DIFFERENT
 * job — a silent cross-job corruption that's worse than leaving the
 * warning in place. So: only accept an alignment pair when the original
 * and tailored bullet fall under the SAME entry header (by exact text) in
 * the same tailored section. If they don't match, skip repairing this
 * bullet entirely and leave the tailored text as-is.
 */
function findFlaggedBullets(
  normalizedOriginal: string,
  tailoredSections: TailoredSection[]
): FlaggedBullet[] {
  const flagged: FlaggedBullet[] = [];
  let nextId = 0;

  for (let sectionIndex = 0; sectionIndex < tailoredSections.length; sectionIndex++) {
    const section = tailoredSections[sectionIndex];
    const tailoredUnits = splitIntoUnits(section.content);
    if (tailoredUnits.length === 0) continue;

    // Best-effort: align against the whole normalized original (section
    // boundaries in the model's free-form original text aren't guaranteed
    // to line up with the tailored section titles) — same fallback
    // approach ResumeTrackChanges uses when a heading match isn't found.
    const originalUnits = splitIntoUnits(normalizedOriginal);
    if (originalUnits.length === 0) continue;

    const pairs = alignUnits(originalUnits, tailoredUnits);
    for (const pair of pairs) {
      if (pair.originalIndex === -1) continue;
      const originalUnit = originalUnits[pair.originalIndex];
      const tailoredUnit = tailoredUnits[pair.tailoredIndex];
      if (!originalUnit || !tailoredUnit) continue;
      if (!tailoredUnit.isBullet && !originalUnit.isBullet) continue;

      // Guard 1: only repair when both sides fall under the same entry
      // header (same job/entry). Skip otherwise rather than risk writing
      // one job's content into another.
      const tailoredEntryHeader = entryHeaderForUnit(tailoredUnits, pair.tailoredIndex);
      const originalEntryHeader = entryHeaderForUnit(originalUnits, pair.originalIndex);
      if (tailoredEntryHeader !== originalEntryHeader) continue;

      // Derive the removed text the same way diff-utils's diffAlignedPair
      // does, via wordDiff — but we only need shouldWarnOnRemoval's verdict
      // and the removed phrase, so reuse wordDiff directly here.
      const ops = wordDiff(originalUnit.text, tailoredUnit.text);
      const removedText = ops
        .filter((op) => op.type === "remove")
        .map((op) => op.value)
        .join("");
      if (!removedText.trim()) continue;
      if (!shouldWarnOnRemoval(originalUnit.text, removedText, tailoredUnit.text)) continue;

      flagged.push({
        id: nextId++,
        sectionIndex,
        unit: tailoredUnit,
        originalText: originalUnit.text,
        tailoredText: tailoredUnit.text,
        droppedPhrase: removedText.trim(),
      });
    }
  }

  return flagged;
}

// --- Part C: fact-repair pass ---

/**
 * Part C: runs the fact-repair pass. If any bullets have dropped facts
 * (per shouldWarnOnRemoval), calls `callRepairLlm` ONCE with all flagged
 * bullets. Replaces ONLY those specific bullets with the repaired text —
 * falling back to the ORIGINAL bullet's exact text if the repair call
 * fails, errors, or the repaired bullet still drops the phrase. Never
 * throws — this is a best-effort pass that must not fail the whole
 * tailoring request.
 *
 * Guard 2: never write a candidate replacement (repaired OR fallback
 * original) that already appears, verbatim, somewhere else in the tailored
 * resume — that would duplicate a bullet instead of fixing one. If the
 * chosen candidate for a bullet is already present elsewhere, skip
 * repairing that bullet and leave its tailored text untouched.
 */
export async function repairDroppedFacts(
  normalizedOriginal: string,
  tailoredSections: TailoredSection[],
  callRepairLlm: RepairLlmCaller
): Promise<{ sections: TailoredSection[]; repairedBullets: string[] }> {
  try {
    const flagged = findFlaggedBullets(normalizedOriginal, tailoredSections);
    if (flagged.length === 0) {
      return { sections: tailoredSections, repairedBullets: [] };
    }

    let repairResult: RepairCallResult;
    try {
      repairResult = await callRepairLlm(flagged);
    } catch (err) {
      console.debug(
        "[repairDroppedFacts] repair LLM call failed, falling back to original bullet text for all flagged bullets",
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      );
      repairResult = { repaired: new Map() };
    }

    const nextSections = tailoredSections.map((s) => ({ ...s }));
    const repairedBullets: string[] = [];

    // Build a set of every bullet's normalized text currently in the
    // tailored resume, for the duplicate-detection guard below. Checked
    // against each candidate BEFORE it's written, and updated as bullets
    // are replaced so a candidate can't collide with another repair from
    // this same pass either.
    const existingBulletTexts = new Set<string>();
    for (const section of nextSections) {
      for (const unit of splitIntoUnits(section.content)) {
        if (unit.isBullet) existingBulletTexts.add(unit.text.trim().toLowerCase());
      }
    }

    // Group flagged bullets by section so we can replace each unit's exact
    // span once, working through each section's content independently.
    const bySection = new Map<number, FlaggedBullet[]>();
    for (const f of flagged) {
      const list = bySection.get(f.sectionIndex) ?? [];
      list.push(f);
      bySection.set(f.sectionIndex, list);
    }

    for (const [sectionIndex, bullets] of Array.from(bySection.entries())) {
      let content = nextSections[sectionIndex].content;
      // Replace from the end backwards so earlier offsets in `content`
      // remain valid across multiple replacements within the same section.
      const sorted = [...bullets].sort((a, b) => b.unit.start - a.unit.start);
      for (const f of sorted) {
        const candidate = repairResult.repaired.get(f.id);
        let finalText = f.originalText; // safe fallback
        if (candidate && candidate.trim()) {
          // Re-run the SAME removal check used to flag this bullet
          // (shouldWarnOnRemoval), this time comparing the original
          // against the REPAIRED candidate. If the repaired text still
          // drops the fact (still warns), fall back to the original
          // bullet's exact text rather than accepting a broken repair.
          const ops = wordDiff(f.originalText, candidate);
          const stillRemovedText = ops
            .filter((op) => op.type === "remove")
            .map((op) => op.value)
            .join("");
          const stillDrops =
            stillRemovedText.trim().length > 0 &&
            shouldWarnOnRemoval(f.originalText, stillRemovedText, candidate);
          if (!stillDrops) {
            finalText = candidate.trim();
          }
        }

        // Guard 2: if the chosen replacement (repaired or fallback-original)
        // already appears, verbatim, as another bullet in the tailored
        // resume, writing it here would duplicate content rather than fix
        // it — skip this bullet and leave its tailored text as-is.
        const normalizedFinal = finalText.trim().toLowerCase();
        const normalizedCurrent = f.unit.text.trim().toLowerCase();
        if (normalizedFinal !== normalizedCurrent && existingBulletTexts.has(normalizedFinal)) {
          continue;
        }

        content = replaceUnitSpan(content, f.unit, finalText);
        existingBulletTexts.delete(normalizedCurrent);
        existingBulletTexts.add(normalizedFinal);
        repairedBullets.push(finalText);
      }
      nextSections[sectionIndex] = { ...nextSections[sectionIndex], content };
    }

    return { sections: nextSections, repairedBullets };
  } catch (err) {
    // Absolute safety net: the whole repair pass must never fail the
    // tailoring request.
    console.debug(
      "[repairDroppedFacts] unexpected failure, skipping repair pass",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    );
    return { sections: tailoredSections, repairedBullets: [] };
  }
}
