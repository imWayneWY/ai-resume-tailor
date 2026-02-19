"use client";

import type React from "react";
import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Extract personal info (name, email, phone, location, linkedin) from resume text.
 * Only extracts from the first ~15 lines (header area).
 */
function extractPersonalInfo(text: string) {
  const headerLines = text.split("\n").slice(0, 15).join("\n");

  const emailMatch = headerLines.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const phoneMatch = headerLines.match(/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  const linkedinMatch = headerLines.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);

  // Location: common patterns like "City, ST" or "City, State" or "City, Province, Country"
  const locationMatch = headerLines.match(
    /([A-Z][a-zA-Z\s]+,\s*(?:[A-Z]{2}|[A-Za-z\s]+)(?:,\s*[A-Za-z\s]+)?)\s*(?:\d{5})?/
  );

  // Name: first non-empty line that isn't email/phone/url
  let name = "";
  const lines = text.split("\n");
  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip lines that look like email, phone, URL, or address
    if (/@/.test(trimmed) || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(trimmed)) continue;
    if (/linkedin\.com|http|www\./i.test(trimmed)) continue;
    // Likely the name — should be short (< 50 chars) and mostly letters
    if (trimmed.length < 50 && /^[A-Za-z\s.'-]+$/.test(trimmed)) {
      name = trimmed;
      break;
    }
  }

  return {
    fullName: name,
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0] || "",
    location: locationMatch?.[1]?.trim() || "",
    linkedin: linkedinMatch?.[0] || "",
  };
}

export default function TailorPage() {
  const router = useRouter();
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Personal info fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");

  // Auto-fill personal info from resume text (only fills empty fields)
  // Triggered by handleExtractPersonalInfo callback, not on every keystroke
  const handleExtractPersonalInfo = useCallback((text: string) => {
    const info = extractPersonalInfo(text);
    if (!info.fullName && !info.email && !info.phone && !info.location && !info.linkedin) return;
    setFullName((prev) => prev || info.fullName);
    setEmail((prev) => prev || info.email);
    setPhone((prev) => prev || info.phone);
    setLocation((prev) => prev || info.location);
    setLinkedin((prev) => prev || info.linkedin);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const currentTarget = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as Node | null;

    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    setIsDragging(false);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setFileError("");

      if (file.type !== "application/pdf") {
        setFileError("Only PDF files are accepted.");
        return;
      }
      if (file.size === 0) {
        setFileError("File is empty.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError("File is too large (max 10MB).");
        return;
      }

      if (resume.trim().length > 0) {
        const confirmed = window.confirm(
          "This will replace your current resume text. Continue?"
        );
        if (!confirmed) return;
      }

      setIsParsing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });

        const contentType = response.headers.get("content-type") || "";
        const responseText = await response.text();

        let data: Record<string, unknown> | null = null;
        if (contentType.includes("application/json") && responseText) {
          try {
            data = JSON.parse(responseText);
          } catch {
            // JSON parsing failed
          }
        }

        if (!response.ok) {
          const errorMessage =
            (data && typeof data.error === "string" && data.error) ||
            "Failed to extract text from PDF.";
          setFileError(errorMessage);
          return;
        }

        if (data && typeof data.text === "string" && data.text.length > 0) {
          setResume(data.text);
          handleExtractPersonalInfo(data.text);
        } else {
          setFileError("No text could be extracted from the PDF.");
        }
      } catch {
        setFileError("Failed to upload PDF. Please check your connection and try again.");
      } finally {
        setIsParsing(false);
      }
    },
    [resume, handleExtractPersonalInfo]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleSubmit = async () => {
    setApiError("");
    setIsLoading(true);

    try {
      // Step 1: Extract keywords first (so we can pass them to the tailor)
      let extractedKeywords: string[] | null = null;
      try {
        const kwResponse = await fetch("/api/extract-keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobDescription }),
        });
        if (kwResponse.ok) {
          const kwData = await kwResponse.json();
          if (Array.isArray(kwData?.keywords) && kwData.keywords.length > 0) {
            extractedKeywords = kwData.keywords;
          }
        }
      } catch {
        // Keyword extraction is best-effort — tailor will still work without it
      }

      // Step 2: Tailor resume, passing extracted keywords if available
      const requestBody: Record<string, unknown> = {
        resume,
        jobDescription,
        generateCoverLetter,
      };
      if (extractedKeywords) {
        requestBody.targetKeywords = extractedKeywords;
      }

      const tailorResponse = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const contentType = tailorResponse.headers.get("content-type") || "";
      const text = await tailorResponse.text();

      let data: Record<string, unknown> | null = null;
      if (contentType.includes("application/json") && text) {
        try {
          data = JSON.parse(text);
        } catch {
          // JSON parsing failed — fall through to error handling below
        }
      }

      if (!tailorResponse.ok) {
        const errorMessage =
          (data && typeof data.error === "string" && data.error) ||
          "Something went wrong. Please try again.";
        setApiError(errorMessage);
        return;
      }

      if (!data) {
        setApiError("Unexpected response from server. Please try again.");
        return;
      }

      sessionStorage.setItem("tailorResult", JSON.stringify(data));
      sessionStorage.setItem("tailorOriginalResume", resume);
      sessionStorage.setItem("tailorJobDescription", jobDescription);

      // Store LLM keywords for match score display
      if (extractedKeywords) {
        sessionStorage.setItem(
          "tailorLlmKeywords",
          JSON.stringify(extractedKeywords)
        );
      }

      // Store personal info for the result page
      const personalInfo = { fullName, email, phone, location, linkedin };
      sessionStorage.setItem("tailorPersonalInfo", JSON.stringify(personalInfo));

      router.push("/tailor/result");
    } catch {
      setApiError(
        "Network error — please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isReady =
    resume.trim().length > 0 && jobDescription.trim().length > 0 && !isLoading && !isParsing;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Tailor your resume
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Paste your master resume and the job description. We&apos;ll handle
          the rest.
        </p>
      </div>

      {/* Personal Info */}
      <div className="mb-6 rounded-lg border border-border bg-white p-4 sm:mb-8 sm:p-6">
        <h2 className="mb-3 text-sm font-medium">Personal Information</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-xs text-muted">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-xs text-muted">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="location" className="mb-1 block text-xs text-muted">
              Location
            </label>
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Vancouver, BC"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="linkedin" className="mb-1 block text-xs text-muted">
              LinkedIn
            </label>
            <input
              id="linkedin"
              type="text"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="linkedin.com/in/johndoe"
              disabled={isLoading}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
        {/* Left column — Resume */}
        <div className="flex flex-col gap-4">
          <label htmlFor="resume" className="text-sm font-medium">
            Master Resume
          </label>
          <textarea
            id="resume"
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            onBlur={() => { if (resume.trim()) handleExtractPersonalInfo(resume); }}
            placeholder="Paste your full resume here..."
            disabled={isLoading || isParsing}
            className="h-64 resize-y rounded-lg border border-border bg-white p-4 text-sm leading-relaxed placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
          />

          {/* PDF upload zone */}
          <div
            onDragOver={isLoading || isParsing ? undefined : handleDragOver}
            onDragLeave={isLoading || isParsing ? undefined : handleDragLeave}
            onDrop={isLoading || isParsing ? undefined : handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isLoading || isParsing
                ? "border-border bg-surface opacity-50 cursor-not-allowed"
                : isDragging
                  ? "border-accent bg-accent/5"
                  : "border-border bg-surface"
            }`}
          >
            <svg
              className="mb-2 h-8 w-8 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-muted">
              {isParsing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Extracting text from PDF…
                </span>
              ) : (
                <>
                  Drag &amp; drop a PDF here, or{" "}
                  <label
                    className={`font-medium ${isLoading ? "pointer-events-none text-muted" : "cursor-pointer text-accent hover:text-accent-hover"}`}
                  >
                    browse
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      aria-label="Upload PDF resume"
                      disabled={isLoading || isParsing}
                      onChange={handleFileSelect}
                    />
                  </label>
                </>
              )}
            </p>
            {fileError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {fileError}
              </p>
            )}
          </div>
        </div>

        {/* Right column — Job Description */}
        <div className="flex flex-col gap-4">
          <label htmlFor="jobDescription" className="text-sm font-medium">
            Job Description
          </label>
          <textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            disabled={isLoading}
            className="h-64 resize-y rounded-lg border border-border bg-white p-4 text-sm leading-relaxed placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none disabled:opacity-50"
          />

          {/* Cover letter checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generateCoverLetter}
              onChange={(e) => setGenerateCoverLetter(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            <span className="text-muted">Generate cover letter too</span>
          </label>

          {/* Error message */}
          <div aria-live="polite">
            {apiError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {apiError}
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!isReady}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:mt-4"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Tailoring…
              </>
            ) : (
              "Tailor Resume →"
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
