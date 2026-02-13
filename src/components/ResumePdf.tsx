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

interface ResumePdfProps {
  sections: PdfSection[];
  coverLetter?: string;
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
  // --- Resume header (first section treated as name/header) ---
  headerTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 2,
  },
  headerContent: {
    fontSize: 10,
    color: "#4b5563",
    lineHeight: 1.6,
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

export default function ResumePdf({ sections, coverLetter }: ResumePdfProps) {
  const [header, ...rest] = sections;

  return (
    <Document>
      {/* Resume page */}
      <Page size="A4" style={styles.page}>
        {/* Header / name section */}
        {header && (
          <View>
            <Text style={styles.headerTitle}>{header.title}</Text>
            <Text style={styles.headerContent}>
              {header.content}
            </Text>
            <View style={styles.headerDivider} />
          </View>
        )}

        {/* Body sections */}
        {rest.map((section, i) => (
          <View key={i} style={styles.section} wrap={false}>
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
