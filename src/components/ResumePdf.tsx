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
    marginBottom: 6,
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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
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

function renderContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    // Bullet lines: •, -, or *
    if (/^[•\-*]\s/.test(trimmed)) {
      const bulletText = trimmed.replace(/^[•\-*]\s+/, "");
      return (
        <Text key={i} style={styles.bulletLine}>
          {"•  "}
          {renderInlineMarkdown(bulletText)}
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

export default function ResumePdf({ sections, coverLetter, personalInfo, jobTitle }: ResumePdfProps) {
  const contactParts = personalInfo
    ? [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(
        (p) => p && p.trim()
      )
    : [];
  const hasAnyHeader =
    (personalInfo?.fullName?.trim()) ||
    (jobTitle?.trim()) ||
    contactParts.length > 0;

  return (
    <Document>
      {/* Resume page */}
      <Page size="A4" style={styles.page}>
        {/* Personal info header */}
        {hasAnyHeader && (
          <View>
            {personalInfo?.fullName?.trim() && (
              <Text style={styles.headerName}>{personalInfo.fullName}</Text>
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
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {renderContent(section.content)}
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
