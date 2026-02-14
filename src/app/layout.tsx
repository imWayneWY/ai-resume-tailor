import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

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
