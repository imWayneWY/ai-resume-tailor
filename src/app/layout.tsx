import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

// TODO: Add a custom favicon — currently using default Next.js favicon.ico
export const metadata: Metadata = {
  title: "AI Resume Tailor",
  description:
    "Tailor your resume to any job description in seconds using AI.",
  openGraph: {
    title: "AI Resume Tailor",
    description:
      "Tailor your resume to any job description in seconds using AI.",
    type: "website",
  },
};

function Navbar() {
  return (
    <nav className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight sm:text-lg"
        >
          AI Resume Tailor
        </Link>
        <Link
          href="/tailor"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:px-4 sm:py-2"
        >
          Get Started
        </Link>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-6">
      <p className="text-center text-xs text-muted">
        Built with AI · Open Source
      </p>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
