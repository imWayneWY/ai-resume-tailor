# Security Audit Report — AI Resume Tailor

**Date:** 2026-02-24  
**Auditor:** Linus (automated security review)  
**Repo:** imWayneWY/ai-resume-tailor  
**Commit:** HEAD (local working tree)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 3     |
| Medium   | 4     |
| Low      | 4     |
| Info     | 3     |

---

## Findings

### CRITICAL

#### C1 — `.env.local` contains real API keys (not committed, but on-disk risk)

- **File:** `.env.local`
- **Description:** The `.env.local` file contains a real `GEMINI_API_KEY` (starting with `AIzaSy...`) and the Supabase anon key. While `.env*` is listed in `.gitignore` (line 34) and the file is not tracked in git, the Gemini API key is a real Google Cloud credential stored in plaintext on disk. If the workspace is ever shared, backed up, or cloned insecurely, this key could leak. The Supabase anon key is designed to be public, but the Gemini key is not.
- **Severity:** Critical
- **Recommended fix:**
  - Rotate the Gemini API key immediately (it's been exposed in this audit).
  - Use a secrets manager or environment-level injection (e.g., Vercel environment variables) instead of local `.env` files for production secrets.
  - Add a `.env.example` with placeholder values and document that real keys should never appear in the repo directory.

---

### HIGH

#### H1 — No rate limiting on expensive AI endpoints (`/api/tailor`, `/api/extract-keywords`)

- **Files:** `src/app/api/tailor/route.ts`, `src/app/api/extract-keywords/route.ts`
- **Description:** Neither the `/api/tailor` nor `/api/extract-keywords` endpoint has any rate limiting. Both forward requests to Azure OpenAI, which costs money per token. An attacker can:
  - Script unlimited requests to burn through your Azure OpenAI credits/budget.
  - The `/api/tailor` endpoint is partially gated by Supabase credits for authenticated users, but **unauthenticated users can still make unlimited tailor requests** (they just get redacted results) — the Azure API call still happens.
  - `/api/extract-keywords` has **no auth check at all** — anyone can call it unlimited times.
  - `/api/parse-pdf` also has no rate limiting but is less expensive (CPU only, no external API call).
- **Severity:** High
- **Recommended fix:**
  - Add rate limiting middleware (e.g., `@upstash/ratelimit` with Redis, or a simple in-memory token bucket).
  - For unauthenticated users on `/api/tailor`: consider requiring a CAPTCHA or limiting to 1 request per IP per hour.
  - For `/api/extract-keywords`: add authentication requirement or aggressive rate limiting.

#### H2 — Unauthenticated users can trigger unlimited Azure OpenAI API calls via `/api/tailor`

- **File:** `src/app/api/tailor/route.ts` (lines 330–380)
- **Description:** The tailor endpoint allows unauthenticated users to submit requests. While the response is redacted, the full Azure OpenAI API call (expensive, ~$0.01–0.10 per request) still executes. An attacker can automate requests with throwaway data to drain your Azure budget. The credit deduction only applies to authenticated users.
- **Severity:** High
- **Recommended fix:**
  - Either require authentication for all tailor requests, OR
  - Implement IP-based rate limiting for unauthenticated users (e.g., 3 requests/day per IP), OR
  - Require a CAPTCHA for unauthenticated requests.

#### H3 — CSRF on sign-out POST form

- **File:** `src/components/UserMenu.tsx` (line ~151), `src/app/auth/signout/route.ts`
- **Description:** The sign-out action uses a plain HTML `<form action="/auth/signout" method="POST">` with no CSRF token. A malicious website can craft a form that auto-submits to `/auth/signout` and log the user out. The `/auth/signout` route handler in `src/app/auth/signout/route.ts` does not verify any CSRF token — it immediately calls `supabase.auth.signOut()`.
  
  While sign-out CSRF is lower impact than other state-changing CSRF (it doesn't steal data), it can be used as part of a larger attack chain (e.g., force sign-out → redirect to phishing login page).
  
  More critically, **none of the other API routes check for CSRF tokens either**, but they are somewhat protected because:
  - They use `request.json()` or `request.formData()` which implicitly requires the browser to send appropriate `Content-Type` headers.
  - JSON POST requests with `Content-Type: application/json` cannot be sent cross-origin by simple forms (they trigger CORS preflight).
  - However, the `/api/parse-pdf` endpoint accepts `FormData` which CAN be sent cross-origin by a plain HTML form.
  
- **Severity:** High
- **Recommended fix:**
  - For sign-out: Use a server action with Next.js built-in CSRF protection, or add a CSRF token to the form.
  - For `/api/parse-pdf`: Verify the `Origin` or `Referer` header matches your domain.
  - Consider adding `SameSite=Lax` (or `Strict`) to all cookies (Supabase SSR should handle this by default).

---

### MEDIUM

#### M1 — No authentication required for `/api/extract-keywords`

- **File:** `src/app/api/extract-keywords/route.ts`
- **Description:** This endpoint makes a call to Azure OpenAI but requires no authentication. Anyone can call it with any job description text. Combined with H1 (no rate limiting), this is an open proxy to your Azure OpenAI account.
- **Severity:** Medium
- **Recommended fix:** Either require authentication or add aggressive rate limiting (IP-based).

#### M2 — No authentication required for `/api/parse-pdf`

- **File:** `src/app/api/parse-pdf/route.ts`
- **Description:** The PDF parsing endpoint accepts file uploads from anyone without authentication. While it doesn't call external APIs, it does:
  - Accept up to 10MB files
  - Parse them using `unpdf` (which runs `pdfjs-dist` under the hood)
  - PDF parsers historically have had memory safety issues and ReDoS vulnerabilities
  
  An attacker could upload malicious PDFs designed to crash/hang the parser, causing denial of service.
- **Severity:** Medium
- **Recommended fix:**
  - Add authentication requirement or IP-based rate limiting.
  - Consider adding a timeout wrapper around the PDF parsing operation.
  - Validate file size more strictly (current 10MB limit is generous for a resume).

#### M3 — `dangerouslySetInnerHTML` in layout.tsx (theme script)

- **File:** `src/app/layout.tsx` (line 34)
- **Description:** The layout uses `dangerouslySetInnerHTML` to inject a theme initialization script:
  ```tsx
  <script dangerouslySetInnerHTML={{ __html: themeScript }} />
  ```
  The script content is a hardcoded constant string (`themeScript`) — it does NOT include any user input or dynamic data. It only reads from `localStorage` (which is same-origin-only). **This is safe as currently implemented.**
  
  However, if this pattern is later modified to include any server-provided or user-provided data, it would become an XSS vector. The usage should be documented as "static-only" with a comment.
- **Severity:** Medium (defense-in-depth concern)
- **Recommended fix:** Add a comment `// SECURITY: This string must remain static — never interpolate user data` above the `themeScript` variable.

#### M4 — No input length validation on `/api/parse-pdf` filename

- **File:** `src/app/api/parse-pdf/route.ts`
- **Description:** While the file size is checked (10MB max) and MIME type is validated, there's no validation on the filename. The filename from `FormData` is not used anywhere in the response (the route only returns extracted text), so this is not directly exploitable. However, the `console.error` on line 76 logs the full `error` object which could include the filename in some parsers, potentially leading to log injection.
- **Severity:** Medium
- **Recommended fix:** Sanitize or ignore the filename. Wrap `console.error` to avoid logging raw error objects that could contain user-controlled data.

---

### LOW

#### L1 — Missing RLS policies for INSERT/UPDATE/DELETE on `credits` and `usage_history`

- **Files:** `supabase/migrations/001_credits.sql`, `supabase/migrations/002_usage_history_scores.sql`
- **Description:** RLS is enabled on both tables, but only `SELECT` policies are defined:
  - `credits`: Only has "Users can read own credits" (SELECT policy).
  - `usage_history`: Only has "Users can read own usage" (SELECT policy).
  
  There are NO explicit INSERT, UPDATE, or DELETE policies for either table. This means:
  - **INSERT/UPDATE/DELETE are implicitly denied** for the anon/authenticated roles when using the Supabase client directly. This is secure by default (RLS blocks all operations without a matching policy).
  - All mutations go through `SECURITY DEFINER` functions (`deduct_credit`, `update_latest_usage_scores`, `handle_new_user_credits`), which bypass RLS. This is a valid pattern.
  
  However, the lack of explicit deny documentation makes it easy for a future developer to accidentally add a permissive policy. A user cannot currently INSERT/UPDATE/DELETE via the Supabase client, but this should be explicitly documented.
- **Severity:** Low
- **Recommended fix:** Add comments in the migration files documenting that INSERT/UPDATE/DELETE are intentionally handled only via `SECURITY DEFINER` functions. Optionally add explicit deny-all policies for clarity.

#### L2 — `update_latest_usage_scores` RPC has a race condition (time-of-check-to-time-of-use)

- **File:** `supabase/migrations/002_usage_history_scores.sql` (lines 28–44)
- **Description:** The `update_latest_usage_scores` function updates the most recent `usage_history` row for the current user. If a user makes two tailor requests in rapid succession:
  1. Request A creates usage_history row A, starts AI processing
  2. Request B creates usage_history row B, finishes first
  3. Request B calls `update_latest_usage_scores` → updates row B (correct)
  4. Request A calls `update_latest_usage_scores` → also updates row B (wrong — should update row A)
  
  This is a data integrity issue, not a security vulnerability. Scores could be attributed to the wrong usage history entry.
- **Severity:** Low
- **Recommended fix:** Have `deduct_credit` return the newly created `usage_history.id`, then pass it to `update_latest_usage_scores` to target the specific row.

#### L3 — Auth callback `next` parameter allows open redirect within same origin

- **File:** `src/app/auth/callback/route.ts` (lines 4–8)
- **Description:** The `safeRedirectPath` function validates that `next` starts with `/` and doesn't start with `//`. This prevents open redirects to external domains. However, it still allows redirect to any internal path (e.g., `/api/tailor`). This is generally fine for a same-origin redirect, but an attacker could craft a callback URL that redirects to an API route, potentially causing unintended side effects if that route has GET handlers.
  
  Currently, all API routes use POST, so a GET redirect to them would be harmless (405 or no handler). This is informational.
- **Severity:** Low
- **Recommended fix:** Optionally restrict `next` to known safe paths (e.g., `/tailor`, `/history`).

#### L4 — `console.error` in parse-pdf logs full error objects to server logs

- **File:** `src/app/api/parse-pdf/route.ts` (line 76)
- **Description:** `console.error("Error parsing PDF:", error)` logs the full error object, which could contain stack traces or internal details. In production, these logs might be visible in log aggregation services. While this doesn't leak to users (the response just says "Failed to parse PDF."), it could expose internal paths or dependencies to anyone with log access.
- **Severity:** Low
- **Recommended fix:** Log only `error instanceof Error ? error.message : "Unknown error"`.

---

### INFO

#### I1 — Supabase anon key is exposed (by design)

- **Files:** `src/lib/supabase/client.ts`, `.env.local`
- **Description:** The `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally exposed to the client (the `NEXT_PUBLIC_` prefix makes them available in browser bundles). This is the standard Supabase pattern — the anon key is designed to be public and provides only the access defined by RLS policies. The actual security boundary is RLS + auth, not the key.
- **Severity:** Info
- **Recommended fix:** No action needed. This is working as intended.

#### I2 — All user-facing text rendering uses React's default escaping (XSS-safe)

- **Files:** All components in `src/components/`
- **Description:** A thorough review of all components shows:
  - **No `dangerouslySetInnerHTML` with user data.** The only usage is the static theme script in `layout.tsx` (see M3).
  - All user-provided text (resume sections, job descriptions, personal info) is rendered via `{variable}` JSX interpolation, which React auto-escapes.
  - The `ResumePdf.tsx` component uses `@react-pdf/renderer`'s `<Text>` component, which does NOT render HTML — it only renders plain text. The `renderInlineMarkdown` function processes `**bold**` markers using string splitting and creates `<Text>` elements. Injected HTML/script tags would appear as literal text in the PDF, not be interpreted.
  - Error messages from the API are rendered via `{apiError}` and `{fileError}` which are also auto-escaped.
- **Severity:** Info
- **Recommended fix:** No action needed. The current architecture is XSS-safe.

#### I3 — Server-side secrets are properly isolated from client

- **Files:** `src/app/api/tailor/route.ts`, `src/app/api/extract-keywords/route.ts`
- **Description:** `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT` are only accessed in server-side API routes (no `NEXT_PUBLIC_` prefix). They are never included in API responses — error messages use generic strings like "Azure OpenAI is not configured" and "Azure OpenAI API error (status code)" without revealing the actual endpoint, key, or deployment name. The `await response.text()` result from Azure is read but intentionally discarded (not forwarded to the client).
- **Severity:** Info
- **Recommended fix:** No action needed.

---

## Architecture Assessment

### Authentication Middleware

The Next.js middleware (`src/middleware.ts`) runs on all page routes but **explicitly excludes API routes** (the matcher pattern starts with `/((?!api|...)`). This means:

- **Page routes** (/, /tailor, /history, /settings, /auth/*): Session is refreshed via middleware. Pages themselves are all client-rendered ("use client") and don't do server-side auth checks — they rely on client-side Supabase auth state.
- **API routes**: Each route must handle its own auth. Currently:
  - `/api/history` ✅ — Checks auth, returns 401 if not authenticated
  - `/api/credits` ✅ — Checks auth, returns `{ balance: null, authenticated: false }` if not authenticated
  - `/api/tailor` ⚠️ — Checks auth but allows unauthenticated access (redacted results)
  - `/api/extract-keywords` ❌ — No auth check at all
  - `/api/parse-pdf` ❌ — No auth check at all
  - `/auth/signout` ⚠️ — No CSRF protection
  - `/auth/callback` ✅ — Handles OAuth callback correctly with redirect validation

### Data Isolation (RLS)

RLS is properly configured:
- User A cannot read User B's credits or usage history (SELECT policies use `auth.uid() = user_id`).
- All mutations go through `SECURITY DEFINER` functions that use `auth.uid()` internally, preventing cross-account manipulation.
- The `deduct_credit` function properly checks `auth.uid()` and uses `FOR UPDATE` row locking to prevent race conditions on balance.
- No direct INSERT/UPDATE/DELETE is possible via the Supabase client (no policies defined = implicit deny when RLS is enabled).

### Redaction Logic

The redaction flow in `/api/tailor` is sound:
1. The AI generates the full tailored resume server-side.
2. Match scores are computed server-side from the REAL text (before redaction).
3. For unauthenticated users, sections are redacted with gibberish, personal info is redacted, and the cover letter is stripped entirely.
4. There is **no client-side path to access unredacted content** — the redaction happens in the API route before the response is sent.
5. The `jobTitle` is intentionally not redacted (it comes from the JD, not the resume).
6. The only potential leak: section `title` fields are preserved (e.g., "Experience", "Skills") — these are generic and not sensitive.

---

## Recommendations Priority

1. **Immediate:** Add rate limiting to `/api/tailor` and `/api/extract-keywords` (H1, H2)
2. **Immediate:** Rotate the Gemini API key found in `.env.local` (C1)
3. **Soon:** Add CSRF protection to sign-out and form-data endpoints (H3)
4. **Soon:** Add auth or rate limiting to `/api/extract-keywords` and `/api/parse-pdf` (M1, M2)
5. **Later:** Add safety comments around `dangerouslySetInnerHTML` usage (M3)
6. **Later:** Document RLS design decisions in migration files (L1)
7. **Later:** Fix `update_latest_usage_scores` race condition (L2)
