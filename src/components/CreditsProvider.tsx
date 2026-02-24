"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

interface CreditsContextValue {
  credits: number | null;
  isAuthenticated: boolean | null;
  loading: boolean;
  refresh: () => void;
}

const CreditsContext = createContext<CreditsContextValue>({
  credits: null,
  isAuthenticated: null,
  loading: true,
  refresh: () => {},
});

export function useCredits() {
  return useContext(CreditsContext);
}

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.authenticated ?? false);
        setCredits(data.authenticated ? (data.balance ?? 0) : null);
      } else {
        // 401, 500, etc. — treat as unauthenticated so the UI stays usable
        setIsAuthenticated(false);
        setCredits(null);
      }
    } catch {
      // Network error — treat as unauthenticated so submit isn't permanently blocked
      setIsAuthenticated(false);
      setCredits(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();

    const handleCreditsUpdated = () => fetchCredits();
    window.addEventListener("credits-updated", handleCreditsUpdated);
    return () => window.removeEventListener("credits-updated", handleCreditsUpdated);
  }, [fetchCredits]);

  return (
    <CreditsContext.Provider value={{ credits, isAuthenticated, loading, refresh: fetchCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}
