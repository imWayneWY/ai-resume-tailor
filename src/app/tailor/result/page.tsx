"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MatchScore from "@/components/MatchScore";

interface Section {
  title: string;
  content: string;
}

interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

interface TailorResult {
  sections: Section[];
  coverLetter?: string;
  jobTitle?: string;
  personalInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  redacted?: boolean;
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<TailorResult | null>(null);
  const [editableSections, setEditableSections] = useState<Section[]>([]);
  const [originalResume, setOriginalResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [coverLetterExpanded, setCoverLetterExpanded] = useState(false);
  const [llmKeywords, setLlmKeywords] = useState<string[] | undefined>(
    undefined
  );
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
  });
  const [jobTitle, setJobTitle] = useState("");
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
      setOriginalResume(sessionStorage.getItem("tailorOriginalResume") || "");
      setJobDescription(sessionStorage.getItem("tailorJobDescription") || "");

      // Load job title from API response
      if (typeof parsed.jobTitle === "string" && parsed.jobTitle.trim()) {
        setJobTitle(parsed.jobTitle.trim());
      }

      // Load personal info from LLM extraction (API response)
      const llmInfo = parsed.personalInfo || {};
      setPersonalInfo({
        fullName: llmInfo.fullName || "",
        email: llmInfo.email || "",
        phone: llmInfo.phone || "",
        location: llmInfo.location || "",
        linkedin: llmInfo.linkedin || "",
      });

      // Note: we intentionally do NOT remove sessionStorage items here.
      // React Strict Mode calls useEffect twice in development, and removing
      // items on first call makes them unavailable on the second call,
      // causing scores to show 0. sessionStorage is tab-scoped and clears
      // automatically when the tab closes — no manual cleanup needed.

      // Read LLM-extracted keywords if available
      const storedKeywords = sessionStorage.getItem("tailorLlmKeywords");
      if (storedKeywords) {
        try {
          const parsedKeywords = JSON.parse(storedKeywords);
          if (Array.isArray(parsedKeywords)) {
            setLlmKeywords(parsedKeywords);
          }
        } catch {
          // Fall back to regex extraction
        }
      }
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
  // Skip for redacted results — no point persisting gibberish
  useEffect(() => {
    if (editableSections.length === 0) return;
    if (result?.redacted) return;
    const stored = sessionStorage.getItem("tailorResult");
    if (!stored) return;
    try {
      const current: TailorResult = JSON.parse(stored);
      current.sections = editableSections;
      current.jobTitle = jobTitle;
      current.personalInfo = personalInfo;
      sessionStorage.setItem("tailorResult", JSON.stringify(current));
    } catch {
      // ignore
    }
  }, [editableSections, jobTitle, personalInfo]);

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
          personalInfo={personalInfo}
          jobTitle={jobTitle}
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

  // Combine editable sections into a single text for match scoring
  const tailoredText = useMemo(
    () => editableSections.map((s) => s.content).join("\n"),
    [editableSections]
  );

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
          {result.redacted ? (
            <Link
              href="/auth/signup"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Sign up to unlock
            </Link>
          ) : (
            <button
              onClick={handleDownloadPdf}
              disabled={pdfGenerating}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pdfGenerating ? "Generating…" : "Download PDF"}
            </button>
          )}
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

      {/* Match Score */}
      {originalResume && jobDescription && (
        <div className="mb-6 sm:mb-8">
          <MatchScore
            originalResume={originalResume}
            tailoredResume={tailoredText}
            jobDescription={jobDescription}
            llmKeywords={llmKeywords}
          />
        </div>
      )}

      {/* Two-column layout: edit first on mobile, preview first on desktop */}
      <div className={`grid grid-cols-1 gap-6 sm:gap-8 ${result.redacted ? "" : "lg:grid-cols-2"}`}>
        {/* Preview */}
        <div className={result.redacted ? "" : "order-2 lg:order-1"}>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Preview
          </h2>
          <div className="relative rounded-lg border border-border bg-white p-6 shadow-sm sm:p-8">
            {/* Blur overlay for redacted content */}
            {result.redacted && (
              <div className="pointer-events-none absolute inset-0 z-10 rounded-lg backdrop-blur-sm" aria-hidden="true" />
            )}
            {result.redacted && (
              <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg" role="dialog" aria-label="Sign up to unlock resume">
                <div className="pointer-events-auto rounded-xl bg-white/95 px-8 py-6 text-center shadow-lg">
                  <div className="mb-3 text-3xl">🔒</div>
                  <h3 className="text-lg font-semibold">
                    Your tailored resume is ready!
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-muted">
                    Sign up for free to view and download your optimized resume.
                    You&apos;ll get 1 free credit to start.
                  </p>
                  <Link
                    href="/auth/signup"
                    className="mt-4 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                  >
                    Sign up free →
                  </Link>
                  <p className="mt-2 text-xs text-muted">
                    Already have an account?{" "}
                    <Link
                      href="/auth/login"
                      className="font-medium text-accent hover:text-accent-hover"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>
              </div>
            )}
            {/* Personal info header */}
            {/* Resume content — hidden from screen readers when redacted (gibberish text) */}
            <div aria-hidden={result.redacted || undefined}>
            {(() => {
              const contactParts = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(Boolean);
              const hasAnyHeader = personalInfo.fullName || jobTitle || contactParts.length > 0;
              if (!hasAnyHeader) return null;
              return (
                <div className="mb-4 text-center">
                  {personalInfo.fullName && (
                    <h2 className="text-2xl font-bold tracking-tight">
                      {personalInfo.fullName}
                    </h2>
                  )}
                  {jobTitle && (
                    <p className="mt-1 text-sm text-muted">{jobTitle}</p>
                  )}
                  {contactParts.length > 0 && (
                    <p className="mt-1 text-sm text-muted">
                      {contactParts.join(" • ")}
                    </p>
                  )}
                  <div className="mt-3 border-b border-border" />
                </div>
              );
            })()}

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
        </div>

        {/* Edit — hidden for redacted/unauthenticated users */}
        {!result.redacted && (
        <div className="order-1 lg:order-2">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
            Edit Sections
          </h2>
          <div className="flex flex-col gap-4">
            {/* Personal info editing */}
            <div className="rounded-lg border border-border bg-white p-4">
              <label className="mb-2 block text-sm font-medium">
                Personal Information
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-fullName" className="sr-only">Full Name</label>
                  <input
                    id="edit-fullName"
                    type="text"
                    value={personalInfo.fullName}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    placeholder="Full Name"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-email" className="sr-only">Email</label>
                  <input
                    id="edit-email"
                    type="email"
                    value={personalInfo.email}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, email: e.target.value }))
                    }
                    placeholder="Email"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-phone" className="sr-only">Phone</label>
                  <input
                    id="edit-phone"
                    type="tel"
                    value={personalInfo.phone}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="Phone"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="edit-location" className="sr-only">Location</label>
                  <input
                    id="edit-location"
                    type="text"
                    value={personalInfo.location}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, location: e.target.value }))
                    }
                    placeholder="Location"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="edit-linkedin" className="sr-only">LinkedIn</label>
                  <input
                    id="edit-linkedin"
                    type="text"
                    value={personalInfo.linkedin}
                    onChange={(e) =>
                      setPersonalInfo((prev) => ({ ...prev, linkedin: e.target.value }))
                    }
                    placeholder="linkedin.com/in/johndoe"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Job title editing */}
            <div className="rounded-lg border border-border bg-white p-4">
              <label htmlFor="jobTitle" className="mb-2 block text-sm font-medium">
                Target Job Title
              </label>
              <input
                id="jobTitle"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g., Senior Software Engineer"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
            </div>

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
        )}
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
