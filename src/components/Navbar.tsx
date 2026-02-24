"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserMenu } from "@/components/UserMenu";
import { useCredits } from "@/components/CreditsProvider";
import type { User } from "@supabase/supabase-js";

export function Navbar() {
  const pathname = usePathname();
  const isTailorPage = pathname.startsWith("/tailor");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { credits } = useCredits();

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.debug("Error fetching user:", error);
          setUser(null);
        } else {
          setUser(data.user);
        }
      } catch (err) {
        console.debug("Unexpected error fetching user:", err);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          {!authLoading && (
            <>
              {user ? (
                <div className="flex items-center gap-3">
                  <UserMenu user={user} credits={credits} />
                  {!isTailorPage && (
                    <Link
                      href="/tailor"
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:px-4 sm:py-2"
                    >
                      Get Started
                    </Link>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    href="/auth/login"
                    className="text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Sign in
                  </Link>
                  {!isTailorPage && (
                    <Link
                      href="/tailor"
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover sm:px-4 sm:py-2"
                    >
                      Get Started
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
