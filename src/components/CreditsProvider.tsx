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
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        setCredits(null);
      }
    } catch {
      // Non-critical
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
