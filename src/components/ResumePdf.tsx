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
  fullName: string;
  email: string;
  phone: string;
  location: string;
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
    marginBottom: 2,
  },
  headerJobTitle: {
    fontSize: 11,
    color: "#4b5563",
    textAlign: "center" as const,
    marginBottom: 2,
  },
  headerContact: {
    fontSize: 10,
    color: "#4b5563",
    textAlign: "center" as const,
    marginBottom: 2,
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

function renderContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => (
    <Text key={i} style={styles.line}>
      {line || " "}
    </Text>
  ));
}

export default function ResumePdf({ sections, coverLetter, personalInfo, jobTitle }: ResumePdfProps) {
  const hasPersonalInfo = personalInfo && personalInfo.fullName.trim();
  const contactParts = personalInfo
    ? [personalInfo.email, personalInfo.phone, personalInfo.location].filter(
        (p) => p && p.trim()
      )
    : [];

  return (
    <Document>
      {/* Resume page */}
      <Page size="A4" style={styles.page}>
        {/* Personal info header */}
        {hasPersonalInfo && (
          <View>
            <Text style={styles.headerName}>{personalInfo.fullName}</Text>
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
