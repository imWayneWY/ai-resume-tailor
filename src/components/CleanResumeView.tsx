"use client";

import React from "react";
import {
  classifyContentLines,
  classifyAsParagraphs,
  parseInlineMarkdown,
  buildContactParts,
  hasResumeHeader,
  isProseSummarySection,
  type LayoutPersonalInfo,
} from "@/lib/resume-layout";

export interface CleanViewSection {
  title: string;
  content: string;
}

interface CleanResumeViewProps {
  sections: CleanViewSection[];
  personalInfo?: LayoutPersonalInfo;
  jobTitle?: string;
}

/** Renders inline `**bold**` markers as real <strong> nodes. */
function InlineMarkdown({ text }: { text: string }) {
  const segments = parseInlineMarkdown(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.bold ? (
          <strong key={i} className="font-semibold">
            {seg.text}
          </strong>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Renders one section's content using the SAME layout rules as the PDF
 * generator (shared via src/lib/resume-layout.ts): entry headers bold,
 * bullets as "• " + text with a real space, and — for prose
 * Profile/Summary-style sections — the content as ONE paragraph rather
 * than one row per sentence/line.
 */
function SectionContent({ title, content }: CleanViewSection) {
  const lines = isProseSummarySection(title)
    ? classifyAsParagraphs(content)
    : classifyContentLines(content);

  return (
    <div className="text-sm leading-relaxed text-foreground">
      {lines.map((line, i) => {
        if (line.kind === "blank") return <div key={i} className="h-2" />;
        if (line.kind === "bullet") {
          return (
            <p key={i} className="relative mb-1 pl-4">
              <span className="absolute left-0">•</span>
              {" "}
              <InlineMarkdown text={line.text} />
            </p>
          );
        }
        if (line.kind === "entryHeader") {
          return (
            <p key={i} className="mb-1 mt-2 text-foreground">
              <strong className="font-semibold">{line.text}</strong>
            </p>
          );
        }
        return (
          <p key={i} className="mb-1 whitespace-pre-wrap">
            <InlineMarkdown text={line.text} />
          </p>
        );
      })}
    </div>
  );
}

/**
 * Clean view: renders the tailored resume using the SAME shared
 * rendering/layout rules as the PDF export (src/lib/resume-layout.ts), so
 * Clean view and the downloaded PDF can never drift apart. Does NOT use the
 * per-unit diff/UnitRow components — this is the plain final text, exactly
 * as it will be exported.
 */
export default function CleanResumeView({ sections, personalInfo, jobTitle }: CleanResumeViewProps) {
  const contactParts = buildContactParts(personalInfo);
  const showHeader = hasResumeHeader(personalInfo, jobTitle);

  return (
    <div data-testid="clean-resume-view">
      {showHeader && (
        <div className="mb-4 border-b border-border pb-4 text-center">
          {personalInfo?.fullName?.trim() && (
            <h2 className="text-xl font-bold text-foreground">{personalInfo.fullName}</h2>
          )}
          {jobTitle && jobTitle.trim() && <p className="mt-0.5 text-sm text-muted">{jobTitle}</p>}
          {contactParts.length > 0 && (
            <p className="mt-0.5 text-sm text-muted">{contactParts.join(" • ")}</p>
          )}
        </div>
      )}
      {sections.map((section, i) => (
        <div key={section.title + i} className={i > 0 ? "mt-6" : ""}>
          <h3 className="mb-3 border-b border-border pb-1 text-lg font-semibold tracking-tight">
            {section.title}
          </h3>
          <SectionContent title={section.title} content={section.content} />
        </div>
      ))}
    </div>
  );
}
