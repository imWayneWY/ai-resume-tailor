"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const pathname = usePathname();
  const isTailorPage = pathname.startsWith("/tailor");

  return (
    <nav className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight sm:text-lg"
        >
          AI Resume Tailor
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          {!isTailorPage && (
            <Link
              href="/tailor"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:px-4 sm:py-2"
            >
              Get Started
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
