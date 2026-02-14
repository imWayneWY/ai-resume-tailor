"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "gemini-api-key";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
    }
    setLoaded(true);
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey("");
    setSaved(false);
  };

  if (!loaded) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-center text-muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Configure your API key and preferences.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-4">
          <label htmlFor="apiKey" className="text-sm font-medium">
            Gemini API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
            placeholder="Enter your Gemini API key"
            className="rounded-lg border border-border bg-white p-3 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />

          <p className="text-xs text-muted leading-relaxed">
            Your API key is stored locally in your browser and never saved on
            our server. If no key is provided, the server&apos;s default key
            will be used (if configured).
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={apiKey.trim().length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleClear}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface"
            >
              Clear
            </button>
            {saved && (
              <span role="status" className="text-sm text-green-600">
                ✓ Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
