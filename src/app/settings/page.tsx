"use client";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Configure your preferences.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <svg
                className="h-5 w-5 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium">AI Model</p>
              <p className="text-xs text-muted">
                Powered by Azure OpenAI — no API key needed.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Resume tailoring is powered by Azure OpenAI (GPT-4.1-mini). No
            configuration is required — just paste your resume and job
            description, and we&apos;ll handle the rest.
          </p>
        </div>
      </div>
    </main>
  );
}
