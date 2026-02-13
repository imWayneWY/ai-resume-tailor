import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Tailor your resume in seconds
        </h1>
        <p className="mt-4 text-lg text-muted">
          Paste your resume and a job description. AI does the rest — optimized
          for ATS, written for humans.
        </p>
        <Link
          href="/tailor"
          className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Get Started →
        </Link>
      </div>
    </main>
  );
}
