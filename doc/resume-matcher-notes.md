# Resume Matcher Reference Notes

Reviewed https://github.com/srbhr/Resume-Matcher on 2026-02-13.
Use as inspiration — don't copy code.

## Architecture
- **Monorepo:** `apps/frontend` (Next.js) + `apps/backend` (Python/FastAPI)
- Our app is simpler: single Next.js app, no separate backend. LLM calls via Next.js API routes.

## Resume Data Model (steal this structure)
Their `ResumeData` schema is well-designed:
```
personalInfo: { name, title, email, phone, location, website, linkedin, github }
summary: string
workExperience: [{ id, title, company, location, years, description[] }]
education: [{ id, institution, degree, years, description }]
personalProjects: [{ id, name, role, years, description[] }]
additional: { technicalSkills[], languages[], certificationsTraining[], awards[] }
customSections: { [key]: { sectionType, items/strings/text } }
```
→ We should use a similar JSON shape for our Gemini prompt output.

## LLM Prompt Strategy (key insights)
1. **Two-step process:** First extract keywords from JD, then improve resume using those keywords
2. **Three intensity levels:** "nudge" (minimal edits), "keywords" (inject keywords), "full" (comprehensive tailor)
3. **CRITICAL: Truthfulness rules** baked into every prompt — never fabricate skills, metrics, companies
4. **Input sanitization:** Strip prompt injection patterns from user input before feeding to LLM
5. **Output format:** Demand JSON only, use structured schema with examples
6. **Truncation check:** Verify LLM output has required sections (didn't get cut off)

## Prompt Templates Worth Adapting
- `PARSE_RESUME_PROMPT` — parse pasted text into structured JSON
- `EXTRACT_KEYWORDS_PROMPT` — pull requirements/skills from JD
- `IMPROVE_RESUME_PROMPT_FULL` — the main tailoring prompt
- `COVER_LETTER_PROMPT` — 100-150 words, 3-4 paragraphs, "confident peer not eager applicant"
- `GENERATE_TITLE_PROMPT` — "Role @ Company" from JD

## Cover Letter Approach
- Separate generation, not inline with resume tailoring
- 100-150 words max, 3-4 short paragraphs
- Tone: "confident peer, not eager applicant"
- Reference specific thing from JD, not generic excitement
- No em dashes (interesting stylistic choice)

## UI Patterns
- Resume builder uses tabs: resume / cover-letter / outreach / jd-match
- Cover letter editor: simple textarea with word/char count
- Preview: paginated PDF preview on left, edit forms on right
- They use shadcn (we're not) — but the layout patterns are good
- Drag-and-drop section reordering in builder (v2 for us)

## What We Can Do Better
- Simpler: no separate backend, just API routes
- Lighter: no i18n, no database, browser-only state (v1)
- Faster: skip the "dashboard" concept, go straight input → result
- Their truthfulness rules are excellent — adopt them
- Their keyword extraction step is smart — do it as a separate LLM call
