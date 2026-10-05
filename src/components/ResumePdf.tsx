import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

export interface PdfSection {
  title: string;
  content: string;
}

export interface PdfPersonalInfo {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
}

interface ResumePdfProps {
  sections: PdfSection[];
  coverLetter?: string;
  personalInfo?: PdfPersonalInfo;
  jobTitle?: string;
  /** Fit the resume onto a single page by scaling typography/spacing. */
  singlePage?: boolean;
}

/**
 * Rough "how full is the page" estimate, in body-line equivalents.
 * Section titles, gaps and entry headers cost more than one line, so they
 * are weighted accordingly. Compared against measured preset capacities.
 */
const CHARS_PER_LINE = 95;

export function estimateLineCount(sections: PdfSection[], hasHeader: boolean): number {
  let lines = hasHeader ? 5 : 0;
  for (const section of sections) {
    lines += 2.5; // section title, rule and surrounding margin
    const content = section?.content ?? "";
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (line.length === 0) {
        lines += 0.5;
        continue;
      }
      const wrapped = Math.max(1, Math.ceil(line.length / CHARS_PER_LINE));
      // Entry headers get extra top margin for visual separation.
      lines += isEntryHeader(line) ? wrapped + 0.5 : wrapped;
    }
  }
  return Math.ceil(lines);
}

export interface Density {
  fontSize: number;
  lineHeight: number;
  padding: number;
  sectionGap: number;
  nameSize: number;
  titleSize: number;
  /** Measured max full-width body lines that fit on one A4 page. */
  capacity: number;
}

/**
 * Presets with empirically measured single-page capacities (A4, Helvetica).
 * Capacity was calibrated by binary-searching the line count at which
 * @react-pdf/renderer spills onto a second page.
 */
const DENSITY_PRESETS: Density[] = [
  { fontSize: 10, lineHeight: 1.5, padding: 48, sectionGap: 14, nameSize: 24, titleSize: 12, capacity: 46 },
  { fontSize: 9.5, lineHeight: 1.35, padding: 40, sectionGap: 10, nameSize: 20, titleSize: 11, capacity: 55 },
  { fontSize: 9, lineHeight: 1.25, padding: 34, sectionGap: 8, nameSize: 18, titleSize: 10.5, capacity: 63 },
  { fontSize: 8.5, lineHeight: 1.18, padding: 28, sectionGap: 6, nameSize: 16, titleSize: 10, capacity: 71 },
  { fontSize: 8, lineHeight: 1.12, padding: 24, sectionGap: 5, nameSize: 15, titleSize: 9.5, capacity: 79 },
];

/**
 * Pick the largest comfortable typography that still fits one page.
 * Returns null when content is too long to compress without becoming
 * unreadable -- then we let it flow naturally to multiple pages.
 */
export function pickDensity(estimatedLines: number): Density | null {
  for (const preset of DENSITY_PRESETS) {
    if (estimatedLines <= preset.capacity) return preset;
  }
  return null;
}

/** An entry header like "**Microsoft**, Vancouver - Senior Engineer (2020-2024)". */
export function isEntryHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("**")) return false;
  if (/^[\u2022\-*]\s+/.test(trimmed)) return false;
  return /^\*\*[^*]+\*\*/.test(trimmed);
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f2937",
    lineHeight: 1.5,
  },
  // --- Resume header (personal info) ---
  headerName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textAlign: "center" as const,
    marginBottom: 10,
  },
  headerJobTitle: {
    fontSize: 11,
    color: "#4b5563",
    textAlign: "center" as const,
    marginBottom: 4,
  },
  headerContact: {
    fontSize: 10,
    color: "#4b5563",
    textAlign: "center" as const,
    marginBottom: 4,
  },
  headerDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 16,
  },
  // --- Regular sections ---
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: "#e5e7eb",
    marginBottom: 6,
  },
  sectionContent: {
    fontSize: 10,
    lineHeight: 1.6,
    color: "#374151",
  },
  line: {
    marginBottom: 1,
  },
  boldText: {
    fontFamily: "Helvetica-Bold",
  },
  entryHeader: {
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginTop: 6,
    marginBottom: 2,
  },
  bulletLine: {
    marginBottom: 2,
    paddingLeft: 8,
  },
  // --- Cover letter ---
  coverLetterHeading: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 16,
  },
  coverLetterBody: {
    fontSize: 10.5,
    lineHeight: 1.7,
    color: "#374151",
  },
});

/**
 * Parse inline **bold** markers into mixed Text spans.
 */
function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={styles.boldText}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function renderContent(content: string, density?: Density) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    // Bullet lines: •, -, or *
    if (/^[•\-*]\s+/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[•\-*]\s+/, "");
      return (
        <Text key={i} style={styles.bulletLine}>
          {"•  "}
          {renderInlineMarkdown(bulletText)}
        </Text>
      );
    }
    // Company / role headers render as a slightly larger bold title so the
    // PDF has real visual hierarchy instead of inline-bold body text.
    if (isEntryHeader(trimmed)) {
      const headerStyle = density
        ? [styles.entryHeader, { fontSize: density.fontSize + 1, marginTop: density.sectionGap / 2 }]
        : [styles.entryHeader, { fontSize: 11 }];
      return (
        <Text key={i} style={headerStyle}>
          {stripBoldMarkers(trimmed)}
        </Text>
      );
    }
    return (
      <Text key={i} style={styles.line}>
        {renderInlineMarkdown(line) || " "}
      </Text>
    );
  });
}

/** Remove ** markers; the whole line is already styled bold. */
export function stripBoldMarkers(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1");
}

export default function ResumePdf({
  sections,
  coverLetter,
  personalInfo,
  jobTitle,
  singlePage = true,
}: ResumePdfProps) {
  const contactParts = personalInfo
    ? [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(
        (p) => p && p.trim()
      )
    : [];
  const hasAnyHeader = Boolean(
    personalInfo?.fullName?.trim() ||
    jobTitle?.trim() ||
    contactParts.length > 0
  );

  // Scale typography down just enough to land on one page. If even the
  // tightest preset will not fit, fall back to natural flow (multi-page)
  // rather than shrinking the text into unreadability.
  const density = singlePage
    ? pickDensity(estimateLineCount(sections, hasAnyHeader))
    : null;

  const pageStyle = density
    ? [styles.page, {
        fontSize: density.fontSize,
        lineHeight: density.lineHeight,
        paddingTop: density.padding,
        paddingBottom: density.padding,
        paddingHorizontal: density.padding,
      }]
    : styles.page;
  const nameStyle = density
    ? [styles.headerName, { fontSize: density.nameSize, marginBottom: density.sectionGap * 0.6 }]
    : styles.headerName;
  const sectionStyle = density
    ? [styles.section, { marginBottom: density.sectionGap }]
    : styles.section;
  const sectionTitleStyle = density
    ? [styles.sectionTitle, { fontSize: density.titleSize }]
    : styles.sectionTitle;
  const contentStyle = density
    ? [styles.sectionContent, { fontSize: density.fontSize, lineHeight: density.lineHeight }]
    : styles.sectionContent;

  return (
    <Document>
      {/* Resume page */}
      <Page size="A4" style={pageStyle}>
        {/* Personal info header */}
        {hasAnyHeader && (
          <View>
            {personalInfo?.fullName?.trim() && (
              <Text style={nameStyle}>{personalInfo.fullName}</Text>
            )}
            {jobTitle && jobTitle.trim() && (
              <Text style={styles.headerJobTitle}>{jobTitle}</Text>
            )}
            {contactParts.length > 0 && (
              <Text style={styles.headerContact}>
                {contactParts.join(" • ")}
              </Text>
            )}
            <View style={styles.headerDivider} />
          </View>
        )}

        {/* Body sections */}
        {sections.map((section, i) => (
          <View key={i} style={sectionStyle}>
            <Text style={sectionTitleStyle}>{section.title}</Text>
            <View style={contentStyle}>
              {renderContent(section.content, density ?? undefined)}
            </View>
          </View>
        ))}
      </Page>

      {/* Cover letter page (optional) */}
      {coverLetter && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.coverLetterHeading}>Cover Letter</Text>
          <View style={styles.coverLetterBody}>
            {renderContent(coverLetter)}
          </View>
        </Page>
      )}
    </Document>
  );
}
