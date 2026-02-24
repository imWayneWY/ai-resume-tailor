import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-resume-tailor-blond.vercel.app";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "AI Resume Tailor",
  url: BASE_URL,
  description:
    "Upload your resume and paste a job description. AI tailors it for ATS optimization in seconds — keyword matching, professional formatting, and match score included.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "1 free credit on signup",
  },
};

const features = [
  {
    icon: "🎯",
    title: "ATS Keyword Matching",
    description:
      "AI extracts keywords from the job description and weaves them naturally into your resume — no awkward stuffing.",
  },
  {
    icon: "⚡",
    title: "Tailored in Seconds",
    description:
      "Upload your PDF, paste the job description, and get a tailored resume in under 30 seconds.",
  },
  {
    icon: "📊",
    title: "Match Score",
    description:
      "See your before and after keyword match score so you know exactly how much your resume improved.",
  },
  {
    icon: "📄",
    title: "PDF Download",
    description:
      "Download your tailored resume as a clean, professional PDF — ready to submit.",
  },
];

const steps = [
  { step: "1", title: "Upload your resume", description: "Drop your PDF — we extract the text automatically." },
  { step: "2", title: "Paste the job description", description: "Copy the full JD from any job posting." },
  { step: "3", title: "Get your tailored resume", description: "AI rewrites your resume with the right keywords, tone, and format." },
];

export default function Home() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <main>
        {/* Hero */}
        <section className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 sm:px-6">
          <div className="max-w-2xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Tailor your resume for any job in seconds
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted sm:text-lg">
              AI matches your resume to the job description — optimized for ATS
              systems, written for humans. See your match score improve instantly.
            </p>
            <Link
              href="/tailor"
              className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Get Started — It&apos;s Free →
            </Link>
            <p className="mt-3 text-xs text-muted">
              1 free credit on signup · No credit card required
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="border-t border-border px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {steps.map((s) => (
                <div key={s.step} className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                    {s.step}
                  </div>
                  <h3 className="mt-4 text-base font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-surface px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything you need to land more interviews
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted sm:text-base">
              Stop sending the same generic resume to every job. Tailor it in
              seconds and stand out from the crowd.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-lg border border-border bg-card p-6"
                >
                  <div className="text-2xl">{f.icon}</div>
                  <h3 className="mt-3 text-base font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to tailor your resume?
            </h2>
            <p className="mt-3 text-sm text-muted sm:text-base">
              Join thousands of job seekers who use AI to optimize their resumes
              for every application.
            </p>
            <Link
              href="/tailor"
              className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Try It Free →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
