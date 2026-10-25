# Performance Audit Report

**Date:** 2026-02-24
**Auditor:** Linus (AI)
**Stack:** Next.js 16.1.6 + React 19.2.3 + TypeScript + Tailwind CSS v4
**Deployment:** Vercel (serverless)

---

## Executive Summary

The app is lean for its feature set (~4,100 lines of source code, 7 routes, 5 API endpoints). The biggest wins are around **eliminating duplicate network requests**, **migrating client components to server components** where possible, and **adding streaming to the AI API route** to cut perceived latency in half. No critical issues found — the codebase follows good patterns overall.

---

## 🔴 Critical

_None found._

---

## 🟠 High

### H1. Duplicate `/api/credits` calls on every page load

**Files:** `src/components/Navbar.tsx:47-70`, `src/app/tailor/page.tsx:25-44`
**Impact:** 2× API round-trips + 2× Supabase auth checks on every `/tailor` page load

Both `Navbar` and `TailorPage` independently call `GET /api/credits` on mount. Since both components render simultaneously when navigating to `/tailor`, the browser fires two parallel requests to the same endpoint. Each request hits Supabase `auth.getUser()` + a DB query.

**Estimated savings:** 1 API call (~50-150ms), 1 Supabase auth round-trip per page load.

**Recommendation:** Lift credits state to a shared context/provider, or have `TailorPage` read from the Navbar's already-fetched state via the existing `credits-updated` event pattern.

---

### H2. Sequential API calls in `handleSubmit` — extract-keywords then tailor

**File:** `src/app/tailor/page.tsx:152-242`
**Impact:** ~1-3s additional latency (full LLM round-trip) before the tailoring call even starts

The submit handler calls `/api/extract-keywords` (an LLM call, ~1-2s), awaits the result, then calls `/api/tailor` (another LLM call, ~3-8s). These could run in parallel since the tailor endpoint already has its own keyword extraction fallback, and the keywords are passed as an optional enhancement.

**Estimated savings:** 1-3s off total submit latency.

**Recommendation:** Fire both calls simultaneously with `Promise.all` or `Promise.allSettled`. The tailor route already handles the case when `targetKeywords` is absent. Alternatively, merge keyword extraction into the tailor route server-side to eliminate the extra client→server round-trip entirely.

---

### H3. No streaming for the AI tailor response

**File:** `src/app/api/tailor/route.ts:340-465`
**Impact:** User stares at a spinner for 5-10s with zero feedback

The `/api/tailor` endpoint calls Azure OpenAI and awaits the full JSON response before returning anything to the client. Azure OpenAI supports `stream: true` for incremental delivery. Even though the response is JSON (not free-form text), streaming the response would allow showing progressive status updates or partial results.

**Estimated savings:** Perceived latency drops from 5-10s to ~1-2s for first visible content.

**Recommendation:** At minimum, implement a progress indicator via Server-Sent Events or a polling mechanism. Ideally, switch to streaming the Azure response and parse the JSON incrementally, or use a two-phase approach (instant redirect to result page with loading skeleton, then fetch result).

---

### H4. `middleware.ts` deprecated convention warning

**File:** `src/middleware.ts`
**Impact:** Will break on future Next.js versions; build warning already emitted

The build output shows: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` Next.js 16 has deprecated the `middleware.ts` convention in favor of the new `proxy` convention.

**Recommendation:** Migrate to the `proxy` convention per [Next.js docs](https://nextjs.org/docs/messages/middleware-to-proxy). This is a breaking change that should be addressed before upgrading further.

---

## 🟡 Medium

### M1. Settings page is a client component with no client-side state

**File:** `src/app/settings/page.tsx:1`
**Impact:** Unnecessary JS shipped to client; prevents static generation

`SettingsPage` has `"use client"` but uses zero hooks, state, or browser APIs — it's pure static markup. This forces Next.js to ship the React runtime for this page and prevents it from being statically generated at build time.

**Estimated savings:** ~2-5KB JS eliminated from this route's bundle.

**Recommendation:** Remove `"use client"` to make it a server component. It will become a statically rendered page with zero client JS.

---

### M2. History page could be a server component

**File:** `src/app/history/page.tsx`
**Impact:** Unnecessary client-side data fetching waterfall (mount → fetch → render)

The History page uses `useEffect` + `useState` to fetch data from `/api/history`. Since this page shows server-fetched data with no client interactivity (no forms, no real-time updates), it could be a server component that fetches data directly via Supabase server client, eliminating the fetch waterfall.

**Estimated savings:** ~200-400ms faster First Contentful Paint (removes client→API→Supabase round-trip chain; server component fetches directly from DB). Also eliminates the "Loading..." flash.

**Recommendation:** Convert to a server component with `Suspense` + server-side data fetching. Extract `ScoreImprovement` into a small client component if needed.

---

### M3. No `next/font` usage — system font stack with no preload

**File:** `src/app/globals.css:35-36`, `src/app/layout.tsx`
**Impact:** CLS risk on systems where system fonts load differently; missed optimization opportunity

The app uses a raw CSS `font-family` system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", ...`). While system fonts avoid external font downloads, Next.js's `next/font` module offers benefits even for system fonts:
- `font-display: swap` configuration
- CSS `size-adjust` to eliminate CLS
- Proper font metric overrides

For a production app, consider using `next/font/local` or `next/font/google` with Inter/Geist for a polished cross-platform look with zero CLS.

**Estimated impact:** Eliminates potential CLS from font loading (~0.01-0.05 CLS improvement on some devices).

---

### M4. No per-page metadata — all pages inherit root layout metadata

**Files:** All page files under `src/app/`
**Impact:** Poor SEO; every page has the same title "AI Resume Tailor"

Only `src/app/layout.tsx:7` defines metadata. No individual pages export their own `metadata` or `generateMetadata`. This means:
- `/tailor` shows "AI Resume Tailor" instead of "Tailor Your Resume | AI Resume Tailor"
- `/history` shows "AI Resume Tailor" instead of "Usage History | AI Resume Tailor"
- `/auth/login` shows "AI Resume Tailor" instead of "Sign In | AI Resume Tailor"
- No page-specific Open Graph descriptions

**Recommendation:** Add `export const metadata: Metadata = { ... }` to each page file, or use `generateMetadata` for dynamic pages. This is free (server-only, zero JS impact) and significantly improves SEO + social sharing.

---

### M5. Unused assets in `public/` directory

**Files:** `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`
**Impact:** ~3KB of dead files deployed; Next.js default template artifacts

These are the default Next.js starter template assets. None are referenced anywhere in `src/`. They're deployed to Vercel unnecessarily.

**Estimated savings:** ~3KB deploy size; cleaner project.

**Recommendation:** Delete all five SVG files from `public/`.

---

### M6. `result` missing from useEffect dependency array

**File:** `src/app/tailor/result/page.tsx:134-146`
**Impact:** Stale closure bug — `result?.redacted` check uses stale value

The persist-to-sessionStorage useEffect at line 134 reads `result?.redacted` but only has `[editableSections, jobTitle, personalInfo]` in its dependency array. If `result` changes (unlikely in practice but technically incorrect), the effect uses a stale reference. React's exhaustive-deps lint rule would flag this.

**Recommendation:** Add `result` to the dependency array: `[editableSections, jobTitle, personalInfo, result]`.

---

### M7. Navbar creates new Supabase client instance in useEffect body

**File:** `src/components/Navbar.tsx:18`
**Impact:** Minor — `createBrowserClient` from `@supabase/ssr` uses an internal singleton cache, so this is safe in practice. However, the pattern is misleading and fragile.

The `createClient()` call inside `useEffect` creates what appears to be a new client each mount. Internally `@supabase/ssr@0.8.0` caches browser clients as singletons, so it works. But this relies on an implementation detail and makes the code confusing.

**Recommendation:** Move client creation to `useMemo` outside the effect (like `auth/login/page.tsx:23` and `auth/signup/page.tsx:14` already do correctly), or use a module-level singleton.

---

### M8. In-memory rate limiter is ineffective on Vercel serverless

**File:** `src/lib/rate-limit.ts`
**Impact:** Rate limiting provides near-zero protection on serverless — each cold start gets a fresh empty Map

Vercel Functions spin up new instances frequently. The in-memory `Map` store resets on every cold start, meaning a determined attacker can bypass rate limits by waiting for new instances. The code comments acknowledge this but it's worth calling out.

**Estimated impact:** Rate limiting is effectively decorative on Vercel.

**Recommendation:** For real protection, migrate to `@upstash/ratelimit` with Redis (Vercel has native Upstash integration, free tier available). Keep the in-memory limiter as a fast-path first check.

---

## 🟢 Low

### L1. No `loading.tsx` or streaming Suspense boundaries for route transitions

**Files:** Missing `src/app/tailor/loading.tsx`, `src/app/history/loading.tsx`, etc.
**Impact:** Route transitions show nothing until the full page JS + data loads

Next.js 16 supports `loading.tsx` files for instant loading UI during navigation. Without them, navigating between routes shows a blank page until the client component mounts and fetches data.

**Recommendation:** Add `loading.tsx` files with skeleton UI for `/tailor`, `/history`, and `/tailor/result`.

---

### L2. Inline SVG icons repeated across components

**Files:** `src/components/UserMenu.tsx` (4 SVGs), `src/app/tailor/page.tsx` (4 SVGs), `src/components/MatchScore.tsx` (2 SVGs)
**Impact:** ~2-4KB of duplicated SVG markup in the JS bundle

Multiple components define the same spinner SVG, checkmark SVG, and chevron SVG inline. These are bundled into the client JS for each component.

**Estimated savings:** ~1-2KB gzipped.

**Recommendation:** Extract common SVGs into a shared `Icon` component or use `lucide-react` (tree-shakeable, ~200B per icon).

---

### L3. `console.debug` / `console.error` calls in production client code

**Files:** `src/components/MatchScore.tsx:126-139`, `src/components/Navbar.tsx:24,30`, `src/components/UserMenu.tsx:160,164`
**Impact:** Minor — debug logs visible in user's browser console

Client-side `console.debug` calls in `MatchScore.tsx` log keyword matching details on every render. While harmless, they're noise for end users and leak implementation details.

**Recommendation:** Guard with `process.env.NODE_ENV === 'development'` or remove entirely. Server-side `console.debug` calls (in API routes) are fine — they go to Vercel logs, not the browser.

---

### L4. `scroll-behavior: smooth` on `html` element

**File:** `src/app/globals.css:29`
**Impact:** Can cause janky scroll behavior and interfere with programmatic navigation

Global `scroll-behavior: smooth` applies to all scrolling including `router.push()` transitions and anchor links. This can feel sluggish on fast navigations and conflicts with some assistive technologies.

**Recommendation:** Remove the global rule. Apply `scroll-behavior: smooth` only to specific scroll containers that benefit from it, or use `scrollIntoView({ behavior: 'smooth' })` on specific interactions.

---

### L5. Large SYSTEM_PROMPT in tailor route (~7,126 chars / ~1,782 tokens)

**File:** `src/app/api/tailor/route.ts:10-168`
**Impact:** ~1,782 tokens of input on every API call = higher Azure OpenAI cost and latency

The system prompt is comprehensive (which is good for quality), but at ~1,800 tokens it adds measurable cost. At GPT-4.1-mini pricing, this is ~$0.0007 per call just for the system prompt.

**Recommendation:** This is a quality vs. cost tradeoff. Consider whether all examples and negative examples are needed, or if some could be moved to few-shot examples. Low priority — prompt quality matters more than micro-optimizing token count.

---

### L6. No `Cache-Control` headers on API responses

**Files:** `src/app/api/credits/route.ts`, `src/app/api/history/route.ts`
**Impact:** Browser re-fetches credits/history data even when navigating back

Neither the credits nor history API routes set cache headers. For credits (which change rarely), a short `stale-while-revalidate` cache could prevent redundant fetches during navigation.

**Recommendation:** Add `Cache-Control: private, max-age=0, stale-while-revalidate=30` to the credits endpoint response headers.

---

### L7. TailorPage stores large JSON blobs in sessionStorage

**File:** `src/app/tailor/page.tsx:224-232`, `src/app/tailor/result/page.tsx:60-144`
**Impact:** sessionStorage has a ~5MB limit per origin; large resumes + sections could approach this

The app stores `tailorResult` (full AI response with all sections), `tailorOriginalResume`, `tailorJobDescription`, and `tailorLlmKeywords` in sessionStorage. For a typical resume this is ~20-50KB, well within limits. But a user with a very long resume + JD could hit the cap.

**Recommendation:** Low risk. Consider using a more robust client-side state solution (like a zustand store with sessionStorage persistence that handles quota errors gracefully) if the app grows.

---

## ℹ️ Info

### I1. Build fails without Supabase environment variables

The `npx next build` fails during static page generation because `src/app/auth/signup/page.tsx` calls `createClient()` at the module level via `useMemo(() => createClient(), [])`. Since signup is a client component, this runs during prerendering and throws when env vars are missing.

**Note:** This is expected behavior for Vercel deploys (env vars are available at build time). It only affects local builds without `.env.local`.

---

### I2. `@react-pdf/renderer` and its dependency tree

`@react-pdf/renderer` pulls in a significant dependency tree including:
- `hyphen` (9.7MB — hyphenation dictionaries for many languages)
- `fontkit` (5.7MB — font parsing)
- `brotli` (1.5MB — compression)
- `pako` (856KB — zlib)

However, since `@react-pdf/renderer` is **only imported via dynamic `import()`** in `handleDownloadPdf` (`result/page.tsx:157-159`), it is correctly code-split and only loaded when the user clicks "Download PDF". This is the right pattern.

**Total on-disk:** ~22MB of transitive dependencies.
**Client impact:** Zero until PDF download is triggered. ✅

---

### I3. Supabase browser client is singleton (confirmed)

`@supabase/ssr@0.8.0` internally caches browser clients via `cachedBrowserClient` in `createBrowserClient.js`. So despite `createClient()` being called in multiple components (`Navbar`, `UserMenu`, `LoginForm`, `SignupPage`), only one actual Supabase client instance exists. ✅

---

### I4. Tailwind CSS v4 purging

Tailwind v4 with `@tailwindcss/postcss` handles tree-shaking/purging automatically based on content scanning. The `postcss.config.mjs` is correctly configured. No custom `content` paths needed in v4 — it auto-detects. ✅

---

### I5. No images in the app (no `next/image` needed)

The app uses zero `<img>` tags and zero image assets in its UI. All visual elements are CSS + inline SVG. The `public/` SVGs (file.svg, globe.svg, etc.) are leftover Next.js template assets and unused. There's nothing to optimize with `next/image`. ✅

---

### I6. React hydration is clean

All pages that need interactivity are properly marked `"use client"`. Server-only pages (`layout.tsx`, `page.tsx` root) are server components. No SSR/hydration mismatches were detected in the code patterns. The `Suspense` boundary in `auth/login/page.tsx` correctly wraps `useSearchParams()` usage. ✅

---

### I7. useEffect cleanup patterns are correct

- `Navbar.tsx:17`: ✅ Returns `subscription.unsubscribe()` cleanup
- `Navbar.tsx:47`: ✅ Returns event listener removal
- `TailorPage.tsx:25`: ✅ Returns event listener removal
- `UserMenu.tsx:22`: ✅ Returns `document.removeEventListener` cleanup
- `UserMenu.tsx:35`: ✅ Returns `document.removeEventListener` cleanup
- `MatchScore.tsx:124`: ✅ No cleanup needed (debug logging only, no subscriptions)
- `HistoryPage.tsx:77`: ⚠️ No AbortController for fetch — minor (fetch will complete in background but setState on unmounted component is a no-op in React 19)
- `ResultPage.tsx:59`: ✅ Synchronous sessionStorage read, no cleanup needed
- `ResultPage.tsx:134`: ✅ Synchronous sessionStorage write, no cleanup needed

No memory leaks found. ✅

---

## Summary of Top Recommendations (by estimated impact)

| Priority | Finding | Est. Impact |
|----------|---------|-------------|
| H2 | Parallelize extract-keywords + tailor API calls | -1-3s submit latency |
| H3 | Add streaming/progress to tailor API | -3-8s perceived latency |
| H1 | Deduplicate /api/credits calls | -1 API call per page load |
| H4 | Migrate middleware.ts → proxy convention | Future-proof for Next.js |
| M1 | Remove "use client" from settings page | Static generation enabled |
| M2 | Convert history page to server component | -200-400ms FCP |
| M4 | Add per-page metadata | SEO improvement (free) |
| M8 | Replace in-memory rate limiter with Upstash | Actual rate limiting |
