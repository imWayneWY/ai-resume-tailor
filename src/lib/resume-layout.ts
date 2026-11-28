/**
 * Shared pure layout logic for rendering a resume's section content —
 * used by BOTH ResumePdf.tsx (react-pdf primitives) and the Clean-view
 * renderer (plain DOM/React) so there is a single source of truth for
 * "what counts as a bullet / entry header / paragraph", and the two
 * renderers can never drift apart.
 */

export interface LayoutPersonalInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}

/** An entry header like "**Microsoft**, Vancouver - Senior Engineer (2020-2024)". */
export function isEntryHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("**")) return false;
  if (/^[\u2022\-*]\s+/.test(trimmed)) return false;
  return /^\*\*[^*]+\*\*/.test(trimmed);
}

/** True if the (trimmed) line is a bullet line (•, -, or *). */
export function isBulletLine(trimmed: string): boolean {
  return /^[•\-*]\s+/.test(trimmed);
}

/** Strips a leading bullet marker, returning the bullet's text content. */
export function stripBulletMarker(trimmed: string): string {
  return trimmed.replace(/^[•\-*]\s+/, "");
}

/** Remove ** markers; the whole line is already styled bold. */
export function stripBoldMarkers(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1");
}

export interface InlineSegment {
  text: string;
  bold: boolean;
}

/** Splits a line into plain/bold segments based on `**bold**` markers. */
export function parseInlineMarkdown(text: string): InlineSegment[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return { text: part.slice(2, -2), bold: true };
      }
      return { text: part, bold: false };
    });
}

export type LayoutLine =
  | { kind: "bullet"; text: string }
  | { kind: "entryHeader"; text: string }
  | { kind: "blank" }
  | { kind: "line"; text: string };

/**
 * Classifies each physical line of a section's content into one of the
 * shared layout kinds. Both renderers (PDF + Clean view) iterate this same
 * classification so bullet/entry-header/blank-line detection can never
 * diverge between them.
 */
export function classifyContentLines(content: string): LayoutLine[] {
  const lines = content.split("\n");
  return lines.map((line): LayoutLine => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return { kind: "blank" };
    if (isBulletLine(trimmed)) {
      return { kind: "bullet", text: stripBulletMarker(trimmed) };
    }
    if (isEntryHeader(trimmed)) {
      return { kind: "entryHeader", text: stripBoldMarkers(trimmed) };
    }
    return { kind: "line", text: line };
  });
}

/**
 * Joins a prose section's non-bullet, non-header lines into ONE paragraph
 * (used for Profile/Summary sections, which should render as a single
 * paragraph rather than one row per sentence/line). Entry headers and
 * bullets are left untouched as their own layout lines — only consecutive
 * plain "line" entries get merged into a paragraph run.
 *
 * Returns the same LayoutLine[] shape as classifyContentLines, but with
 * consecutive `{ kind: "line" }` entries collapsed into a single one
 * (blank lines act as paragraph breaks and are preserved as separators).
 */
export function classifyAsParagraphs(content: string): LayoutLine[] {
  const raw = classifyContentLines(content);
  const result: LayoutLine[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      result.push({ kind: "line", text: buffer.join(" ").replace(/\s{2,}/g, " ").trim() });
      buffer = [];
    }
  };
  for (const item of raw) {
    if (item.kind === "line") {
      const trimmed = item.text.trim();
      if (trimmed.length > 0) buffer.push(trimmed);
      continue;
    }
    flush();
    if (item.kind !== "blank") result.push(item);
  }
  flush();
  return result;
}

/** Builds the contact line parts (email, phone, location, linkedin) for a header, filtering out empties. */
export function buildContactParts(personalInfo?: LayoutPersonalInfo): string[] {
  if (!personalInfo) return [];
  return [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(
    (p): p is string => Boolean(p && p.trim())
  );
}

/** True if there's any header content at all (name, job title, or contact parts) to render. */
export function hasResumeHeader(personalInfo?: LayoutPersonalInfo, jobTitle?: string): boolean {
  return Boolean(
    personalInfo?.fullName?.trim() || jobTitle?.trim() || buildContactParts(personalInfo).length > 0
  );
}

/** Heuristic: is this section title a Profile/Summary-style prose section that should render as ONE paragraph? */
export function isProseSummarySection(title: string): boolean {
  return /^(summary|profile|objective)$/i.test(title.trim());
}
