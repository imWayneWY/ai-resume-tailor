/**
 * @jest-environment node
 */

// Test the ResumePdf component rendering with mocked @react-pdf/renderer.
// We mock the library to return simple React elements so we can verify
// the component structure and logic.

import React from "react";
import ReactDOMServer from "react-dom/server";

// Mock @react-pdf/renderer before importing the component
jest.mock("@react-pdf/renderer", () => {
  const createComponent = (displayName: string) => {
    const Component = ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement("div", { "data-component": displayName, ...props }, children);
    Component.displayName = displayName;
    return Component;
  };

  return {
    Document: createComponent("Document"),
    Page: createComponent("Page"),
    View: createComponent("View"),
    Text: createComponent("Text"),
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T): T => styles,
    },
  };
});

import ResumePdf, { PdfSection } from "../ResumePdf";

describe("ResumePdf", () => {
  const mockSections: PdfSection[] = [
    { title: "John Doe", content: "john@example.com\n555-1234" },
    { title: "Experience", content: "ACME Corp — Senior Dev (2020-2024)\n• Built great things" },
    { title: "Education", content: "BS Computer Science\nMIT" },
  ];

  it("can be instantiated without errors", () => {
    const element = React.createElement(ResumePdf, {
      sections: mockSections,
    });
    expect(element).toBeTruthy();
    expect(element.type).toBe(ResumePdf);
  });

  it("renders all sections", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, { sections: mockSections })
    );
    // Header section
    expect(html).toContain("John Doe");
    expect(html).toContain("john@example.com");
    expect(html).toContain("555-1234");
    // Body sections
    expect(html).toContain("Experience");
    expect(html).toContain("ACME Corp");
    expect(html).toContain("Education");
    expect(html).toContain("BS Computer Science");
    expect(html).toContain("MIT");
  });

  it("renders cover letter page when provided", () => {
    const coverLetter = "Dear Hiring Manager,\n\nI am excited to apply...";
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, {
        sections: mockSections,
        coverLetter,
      })
    );
    expect(html).toContain("Cover Letter");
    expect(html).toContain("Dear Hiring Manager,");
    expect(html).toContain("I am excited to apply...");
  });

  it("does not render cover letter page when not provided", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, { sections: mockSections })
    );
    expect(html).not.toContain("Cover Letter");
  });

  it("handles single section (just header)", () => {
    const singleSection = [{ title: "Header Only", content: "Just a header" }];
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, { sections: singleSection })
    );
    expect(html).toContain("Header Only");
    expect(html).toContain("Just a header");
  });

  it("handles empty lines in content by rendering spaces", () => {
    const sections = [
      { title: "Test", content: "Line 1\n\nLine 3" },
    ];
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, { sections })
    );
    expect(html).toContain("Line 1");
    expect(html).toContain("Line 3");
    // Empty line should render as a Text node whose content is exactly a single space,
    // appearing between the Text nodes for "Line 1" and "Line 3".
    const textSequenceRegex =
      /<div[^>]*data-component="Text"[^>]*>\s*Line 1\s*<\/div>\s*<div[^>]*data-component="Text"[^>]*>\s* \s*<\/div>\s*<div[^>]*data-component="Text"[^>]*>\s*Line 3\s*<\/div>/;
    expect(html).toMatch(textSequenceRegex);
  });

  it("renders multiple body sections after header", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, { sections: mockSections })
    );
    // Count Page components — should have 1 for resume (no cover letter)
    const pageCount = (html.match(/data-component="Page"/g) || []).length;
    expect(pageCount).toBe(1);
  });

  it("renders two pages when cover letter is present", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(ResumePdf, {
        sections: mockSections,
        coverLetter: "Dear...",
      })
    );
    const pageCount = (html.match(/data-component="Page"/g) || []).length;
    expect(pageCount).toBe(2);
  });

  it("exports PdfSection interface correctly", () => {
    const section: PdfSection = { title: "Test", content: "Content" };
    expect(section.title).toBe("Test");
    expect(section.content).toBe("Content");
  });
});
