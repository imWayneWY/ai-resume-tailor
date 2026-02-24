import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { CreditsProvider } from "@/components/CreditsProvider";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-resume-tailor-blond.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "AI Resume Tailor — Tailor Your Resume for Any Job in Seconds",
    template: "%s | AI Resume Tailor",
  },
  description:
    "Upload your resume and paste a job description. AI tailors it for ATS optimization in seconds — keyword matching, professional formatting, and match score included. Free to try.",
  keywords: [
    "AI resume tailor",
    "ATS resume optimizer",
    "resume keyword matcher",
    "tailor resume to job description",
    "AI resume builder",
    "resume score checker",
    "job application tool",
  ],
  openGraph: {
    title: "AI Resume Tailor — Tailor Your Resume for Any Job in Seconds",
    description:
      "Upload your resume and paste a job description. AI tailors it for ATS optimization in seconds.",
    type: "website",
    url: BASE_URL,
    siteName: "AI Resume Tailor",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Resume Tailor — Tailor Your Resume for Any Job in Seconds",
    description:
      "Upload your resume and paste a job description. AI tailors it for ATS optimization in seconds.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
};

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
        <CreditsProvider>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </CreditsProvider>
      </body>
    </html>
  );
}
