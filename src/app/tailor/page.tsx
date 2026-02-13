"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function TailorPage() {
  const router = useRouter();
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [generateCoverLetter, setGenerateCoverLetter] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // PDF parsing will be implemented later
    // For now, just acknowledge the drop
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setResume(`[Uploaded: ${file.name}] — PDF parsing coming soon`);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type === "application/pdf") {
        setResume(`[Uploaded: ${file.name}] — PDF parsing coming soon`);
      }
    },
    []
  );

  const handleSubmit = () => {
    // Store data in sessionStorage for the result page
    sessionStorage.setItem(
      "tailorData",
      JSON.stringify({ resume, jobDescription, generateCoverLetter })
    );
    router.push("/tailor/result");
  };

  const isReady = resume.trim().length > 0 && jobDescription.trim().length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Tailor your resume
        </h1>
        <p className="mt-1 text-muted">
          Paste your master resume and the job description. We&apos;ll handle
          the rest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left column — Resume */}
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium">Master Resume</label>
          <textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste your full resume here..."
            className="h-64 resize-y rounded-lg border border-border bg-white p-4 text-sm leading-relaxed placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />

          {/* PDF upload zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? "border-accent bg-accent/5"
                : "border-border bg-surface"
            }`}
          >
            <svg
              className="mb-2 h-8 w-8 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-muted">
              Drag &amp; drop a PDF here, or{" "}
              <label className="cursor-pointer font-medium text-accent hover:text-accent-hover">
                browse
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
            </p>
          </div>
        </div>

        {/* Right column — Job Description */}
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium">Job Description</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            className="h-64 resize-y rounded-lg border border-border bg-white p-4 text-sm leading-relaxed placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />

          {/* Cover letter checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generateCoverLetter}
              onChange={(e) => setGenerateCoverLetter(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            <span className="text-muted">Generate cover letter too</span>
          </label>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!isReady}
            className="mt-4 rounded-lg bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tailor Resume →
          </button>
        </div>
      </div>
    </main>
  );
}
