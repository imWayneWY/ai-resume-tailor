"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [pdfError, setPdfError] = useState("");
  const pdfGeneratingRef = useRef(false);

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
      const current: TailorResult = JSON.parse(stored);
      current.sections = editableSections;
      sessionStorage.setItem("tailorResult", JSON.stringify(current));
    } catch {
      // ignore
    }
  }, [editableSections]);

  const handleDownloadPdf = async () => {
    if (pdfGeneratingRef.current) return;
    pdfGeneratingRef.current = true;
    setPdfGenerating(true);
    setPdfError("");
    try {
      // Dynamic imports to avoid SSR issues with @react-pdf/renderer
      const { pdf } = await import("@react-pdf/renderer");
      const { default: ResumePdf } = await import(
        "@/components/ResumePdf"
      );

      const blob = await pdf(
        <ResumePdf
          sections={editableSections}
          coverLetter={result?.coverLetter}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 0);
    } catch {
      setPdfError("Failed to generate PDF. Please try again.");
    } finally {
      pdfGeneratingRef.current = false;
      setPdfGenerating(false);
    }
  };

  if (!result) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p className="text-center text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Tailored Resume
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
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
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfGenerating ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* PDF error message */}
      <div aria-live="polite">
        {pdfError && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mb-8"
          >
            {pdfError}
          </div>
        )}
      </div>

      {/* Two-column layout: edit first on mobile, preview first on desktop */}
      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
        {/* Preview */}
        <div className="order-2 lg:order-1">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Preview
          </h2>
          <div className="rounded-lg border border-border bg-white p-6 shadow-sm sm:p-8">
            {editableSections.map((section, i) => (
              <div key={i} className={i > 0 ? "mt-6" : ""}>
                <h3 className="mb-3 border-b border-border pb-1 text-lg font-semibold tracking-tight">
                  {section.title}
                </h3>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit */}
        <div className="order-1 lg:order-2">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
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
        <div className="mt-6 sm:mt-8">
          <button
            onClick={() => setCoverLetterExpanded(!coverLetterExpanded)}
            aria-expanded={coverLetterExpanded}
            className="flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${
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
          <div
            className="cover-letter-collapse mt-4"
            data-expanded={coverLetterExpanded}
          >
            <div>
              <div className="rounded-lg border border-border bg-white p-6">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {result.coverLetter}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
