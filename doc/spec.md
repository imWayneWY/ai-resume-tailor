# AI Resume Tailor — Product Spec

## Overview

AI Resume Tailor is a web app that helps job seekers tailor their resume to specific job descriptions using LLM. Upload a master resume once, paste a job description, and get an optimized resume + optional cover letter in seconds.

## Problem

- Manually rewriting resumes for each application is tedious
- Generic resumes get filtered by ATS (Applicant Tracking Systems)
- Job seekers miss keywords and phrasing that recruiters look for
- Cover letters for skill gaps are hard to write convincingly

## Core Workflow

```
Master Resume + Job Description → LLM Analysis → Tailored Resume → PDF Export
```

1. **Upload Master Resume** — user uploads a comprehensive resume (PDF or paste text)
2. **Input Job Description** — paste job description text (v1), or provide a URL (future)
3. **AI Tailoring** — LLM analyzes both, reorders/rewrites content to match the job
4. **Review & Edit** — user reviews the tailored resume, can make manual adjustments
5. **Export** — download as PDF
6. **Cover Letter (optional)** — generate a cover letter addressing skill gaps

## Tech Stack

| Layer       | Technology                        |
| ----------- | --------------------------------- |
| Framework   | Next.js 16 (App Router)          |
| Language    | TypeScript                        |
| Styling     | Tailwind CSS                      |
| LLM         | Google Gemini API (free tier)     |
| PDF         | TBD (react-pdf, puppeteer, etc.) |
| Storage     | Local / browser (no DB for v1)   |
| Auth        | None (personal use, v1)          |
| Hosting     | TBD                               |

## Features

### v1 (MVP)

- [ ] **Master resume input** — paste text or upload PDF
- [ ] **Job description input** — paste text
- [ ] **AI tailoring** — send both to Gemini, get tailored resume back
- [ ] **Resume preview** — display the tailored resume with formatting
- [ ] **Manual editing** — user can tweak the output before exporting
- [ ] **PDF export** — download the tailored resume as a clean PDF
- [ ] **Cover letter generation** — optional toggle, addresses skill gaps
- [ ] **Resume templates** — at least 1 clean, professional template

### v2 (Future)

- [ ] Job URL scraping (LinkedIn, Indeed) — auto-extract job description
- [ ] Multiple resume templates to choose from
- [ ] Resume history — save past tailored versions
- [ ] ATS keyword score / match percentage
- [ ] Multi-language support (English, Chinese)
- [ ] User accounts + cloud storage
- [ ] Hosting on a cloud platform

## Pages / Routes

| Route              | Description                                    |
| ------------------ | ---------------------------------------------- |
| `/`                | Landing page — brief intro + CTA               |
| `/tailor`          | Main workspace — resume input + job desc + AI  |
| `/tailor/result`   | Review tailored resume + edit + export          |
| `/templates`       | Browse/select resume templates (v2)            |

## LLM Integration

- **Provider:** Google Gemini (free tier)
- **Model:** `gemini-2.0-flash` (or latest available free model)
- **API key:** stored in `.env.local` (never committed)
- **Prompt strategy:**
  - System prompt defines the role (expert resume writer + ATS optimizer)
  - User prompt includes master resume + job description
  - Output: structured JSON with tailored sections (summary, experience, skills, etc.)
  - Separate prompt for cover letter generation

## PDF Generation

Options to evaluate:
- **react-pdf** — React components → PDF, good control
- **@react-pdf/renderer** — declarative PDF generation
- **html2canvas + jsPDF** — screenshot approach, less clean
- **Puppeteer** — server-side, most flexible but heavier

Recommendation: Start with `@react-pdf/renderer` for v1.

## Data Flow (v1 — no database)

- All data lives in browser session / React state
- No server-side persistence
- User can export/download but nothing is saved between sessions
- Future: add localStorage or a database for resume history

## Non-Goals (v1)

- No user authentication
- No cloud storage / database
- No job URL scraping
- No multi-user support
- No payment / subscription

## Reference

- [Resume Matcher](https://github.com/srbhr/Resume-Matcher) — similar open-source project (Python + React)
