"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Section {
  title: string;
  content: string;
}

interface TailorResult {
  sections: Section[];
  coverLetter?: string;
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<TailorResult | null>(null);
  const [editableSections, setEditableSections] = useState<Section[]>([]);
  const [coverLetterExpanded, setCoverLetterExpanded] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("tailorResult");
    if (!stored) {
      router.replace("/tailor");
      return;
    }

    try {
      const parsed: TailorResult = JSON.parse(stored);
      if (
        !Array.isArray(parsed.sections) ||
        parsed.sections.length === 0 ||
        parsed.sections.some(
          (s) =>
            !s ||
            typeof s.title !== "string" ||
            typeof s.content !== "string"
        )
      ) {
        router.replace("/tailor");
        return;
      }
      setResult(parsed);
      setEditableSections(parsed.sections.map((s) => ({ ...s })));
    } catch {
      router.replace("/tailor");
    }
  }, [router]);

  const updateSection = useCallback((index: number, content: string) => {
    setEditableSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], content };
      return next;
    });
  }, []);

  // Persist edits to sessionStorage so changes survive navigation
  useEffect(() => {
    if (editableSections.length === 0) return;
    const stored = sessionStorage.getItem("tailorResult");
    if (!stored) return;
    try {
      const current = JSON.parse(stored);
      current.sections = editableSections;
      sessionStorage.setItem("tailorResult", JSON.stringify(current));
    } catch {
      // ignore
    }
  }, [editableSections]);

  const handleDownloadPdf = async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      // Dynamic imports to avoid SSR issues with @react-pdf/renderer
      const { pdf } = await import("@react-pdf/renderer");
      const { default: ResumePdf } = await import(
        "@/components/ResumePdf"
      );

      const blob = await pdf(
        ResumePdf({ sections: editableSections, coverLetter: result?.coverLetter })
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPdfGenerating(false);
    }
  };

  if (!result) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Top bar */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tailored Resume
          </h1>
          <p className="mt-1 text-muted">
            Review and edit your tailored resume below.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/tailor")}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface"
          >
            ← Back
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pdfGenerating ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left — Preview */}
        <div className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-medium text-muted uppercase tracking-wide">
            Preview
          </h2>
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm">
            {editableSections.map((section, i) => (
              <div key={i} className={i > 0 ? "mt-6" : ""}>
                <h3 className="text-lg font-semibold tracking-tight border-b border-border pb-1 mb-3">
                  {section.title}
                </h3>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Edit */}
        <div className="order-1 lg:order-2">
          <h2 className="mb-4 text-sm font-medium text-muted uppercase tracking-wide">
            Edit Sections
          </h2>
          <div className="flex flex-col gap-4">
            {editableSections.map((section, i) => {
              const textareaId = `section-${i}`;
              const rows = Math.max(4, section.content.split("\n").length + 1);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor={textareaId}
                  >
                    {section.title}
                  </label>
                  <textarea
                    id={textareaId}
                    value={section.content}
                    onChange={(e) => updateSection(i, e.target.value)}
                    rows={rows}
                    className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-sm leading-relaxed placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cover Letter */}
      {result.coverLetter && (
        <div className="mt-8">
          <button
            onClick={() => setCoverLetterExpanded(!coverLetterExpanded)}
            aria-expanded={coverLetterExpanded}
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            <svg
              className={`h-4 w-4 transition-transform ${
                coverLetterExpanded ? "rotate-90" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Cover Letter
          </button>
          {coverLetterExpanded && (
            <div className="mt-4 rounded-lg border border-border bg-white p-6">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {result.coverLetter}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
