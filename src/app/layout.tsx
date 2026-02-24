import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";

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

// Inline script to prevent flash of wrong theme (FOUC).
// Runs synchronously before React hydration to set data-theme on <html>.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme-preference');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      var d = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', d);
    }
  } catch(e) {}
})();
`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <ThemeProvider>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
