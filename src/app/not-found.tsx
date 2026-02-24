import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 sm:px-6">
      <div className="max-w-md text-center">
        <p className="text-5xl font-bold text-muted">404</p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Go Home
          </Link>
          <Link
            href="/tailor"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface"
          >
            Tailor a Resume
          </Link>
        </div>
      </div>
    </main>
  );
}
