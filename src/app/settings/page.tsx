"use client";

import { useState, useEffect, useRef } from "react";
import {
  GEMINI_API_KEY_STORAGE_KEY,
  GROQ_API_KEY_STORAGE_KEY,
  MODEL_PROVIDER_STORAGE_KEY,
  DEFAULT_MODEL_PROVIDER,
} from "@/lib/constants";
import type { ModelProvider } from "@/lib/constants";

export default function SettingsPage() {
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [provider, setProvider] = useState<ModelProvider>(DEFAULT_MODEL_PROVIDER);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const storedGeminiKey = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
      if (storedGeminiKey) {
        setGeminiApiKey(storedGeminiKey);
      }
      const storedGroqKey = localStorage.getItem(GROQ_API_KEY_STORAGE_KEY);
      if (storedGroqKey) {
        setGroqApiKey(storedGroqKey);
      }
      const storedProvider = localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY);
      if (storedProvider === "gemini" || storedProvider === "groq") {
        setProvider(storedProvider);
      }
    } catch (error) {
      console.error("Failed to read settings from localStorage", error);
    } finally {
      setLoaded(true);
    }

    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    setStorageError("");
    try {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, geminiApiKey.trim());
      localStorage.setItem(GROQ_API_KEY_STORAGE_KEY, groqApiKey.trim());
      localStorage.setItem(MODEL_PROVIDER_STORAGE_KEY, provider);
    } catch {
      setStorageError("Failed to save — browser storage may be full or disabled.");
      return;
    }
    setSaved(true);
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
    }
    savedTimeoutRef.current = setTimeout(() => setSaved(false), 3000);
  };

  const handleClear = () => {
    setStorageError("");
    try {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
      localStorage.removeItem(GROQ_API_KEY_STORAGE_KEY);
      localStorage.removeItem(MODEL_PROVIDER_STORAGE_KEY);
    } catch {
      setStorageError("Failed to clear — browser storage may be disabled.");
      return;
    }
    setGeminiApiKey("");
    setGroqApiKey("");
    setProvider(DEFAULT_MODEL_PROVIDER);
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
          Configure your API keys and preferences.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-6">
          {/* Model Provider Selector */}
          <div className="flex flex-col gap-2">
            <label htmlFor="provider" className="text-sm font-medium">
              Model Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as ModelProvider);
                setSaved(false);
                setStorageError("");
              }}
              className="rounded-lg border border-border bg-white p-3 text-sm focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            >
              <option value="gemini">Gemini</option>
              <option value="groq">Groq</option>
            </select>
            <p className="text-xs text-muted">
              Choose which AI provider to use for resume tailoring.
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="flex flex-col gap-2">
            <label htmlFor="geminiApiKey" className="text-sm font-medium">
              Gemini API Key
            </label>
            <input
              id="geminiApiKey"
              type="password"
              value={geminiApiKey}
              onChange={(e) => {
                setGeminiApiKey(e.target.value);
                setSaved(false);
                setStorageError("");
              }}
              placeholder="Enter your Gemini API key"
              className="rounded-lg border border-border bg-white p-3 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            />
          </div>

          {/* Groq API Key */}
          <div className="flex flex-col gap-2">
            <label htmlFor="groqApiKey" className="text-sm font-medium">
              Groq API Key
            </label>
            <input
              id="groqApiKey"
              type="password"
              value={groqApiKey}
              onChange={(e) => {
                setGroqApiKey(e.target.value);
                setSaved(false);
                setStorageError("");
              }}
              placeholder="Enter your Groq API key"
              className="rounded-lg border border-border bg-white p-3 text-sm placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
            />
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Your API keys are stored locally in your browser. They may be sent to
            our server to process requests, but they are not stored or logged
            server-side. If no key is provided, the server&apos;s default key
            will be used (if configured).
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
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

          {storageError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {storageError}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
