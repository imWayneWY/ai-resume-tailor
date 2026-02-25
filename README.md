# AI Resume Tailor

Tailor your resume to any job description in seconds using AI. Upload a PDF resume, paste a job description, and get a professionally rewritten resume optimized for ATS (Applicant Tracking Systems) — with a keyword match score to prove it.

**Live demo:** [ai-resume-tailor-blond.vercel.app](https://ai-resume-tailor-blond.vercel.app/)

## Features

- **AI-Powered Tailoring** — GPT-4.1-mini rewrites your resume to match job description keywords naturally (no awkward keyword stuffing)
- **LLM Keyword Extraction** — AI extracts 35-60 relevant keywords from the job description across technical skills, soft skills, tools, and domain terms
- **Match Score** — See before/after keyword match scores with curved display (Weak → Fair → Good → Strong → Excellent)
- **PDF Upload & Download** — Upload your resume as PDF, download the tailored version as a clean PDF
- **Personal Info Extraction** — AI extracts name, email, phone, location, LinkedIn from your resume
- **Job Title Detection** — AI identifies the job title from the JD and places it in your resume header
- **Cover Letter Generation** — Optional AI-generated cover letter tailored to the position
- **AI Phrase Cleanup** — Post-processing removes 50+ overused AI buzzwords (spearheaded → led, leveraged → used, etc.)
- **Authentication** — Email/password + Google OAuth via Supabase Auth
- **Credits System** — 1 free credit on signup, pay-per-use model with atomic deduction and usage history
- **Usage History** — Track your tailoring history with date, JD snippet, and score improvements
- **Rate Limiting** — In-memory sliding window rate limiting per IP
- **Server-Side Redaction** — Non-authenticated users see a blurred preview (gibberish text, real scores)
- **SEO** — Sitemap, robots.txt, JSON-LD structured data, per-page metadata

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| AI/LLM | [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) (GPT-4.1-mini) |
| Auth | [Supabase Auth](https://supabase.com/auth) (email + Google OAuth) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL + Row Level Security) |
| PDF Parsing | [unpdf](https://github.com/unjs/unpdf) (serverless-friendly) |
| PDF Generation | [@react-pdf/renderer](https://react-pdf.org/) |
| Testing | Jest + React Testing Library (349 tests) |
| Hosting | [Vercel](https://vercel.com/) |
| License | MIT |

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── tailor/          # POST — AI resume tailoring + credit deduction
│   │   ├── extract-keywords/# POST — LLM keyword extraction from JD
│   │   ├── parse-pdf/       # POST — PDF text extraction
│   │   ├── credits/         # GET  — Check user credit balance
│   │   └── history/         # GET  — Fetch usage history
│   ├── auth/
│   │   ├── callback/        # OAuth callback handler
│   │   ├── login/           # Sign in page
│   │   └── signup/          # Sign up page
│   ├── tailor/              # Main tailoring page
│   │   └── result/          # Results page (view, edit, download PDF)
│   ├── history/             # Usage history page
│   ├── settings/            # Settings page
│   ├── robots.ts            # SEO robots.txt
│   ├── sitemap.ts           # SEO sitemap.xml
│   └── not-found.tsx        # Custom 404
├── components/
│   ├── CreditsProvider.tsx   # Shared credits context (single fetch)
│   ├── Navbar.tsx            # Navigation with auth state
│   ├── UserMenu.tsx          # Profile dropdown menu
│   ├── MatchScore.tsx        # Before/after score display with circular gauges
│   ├── ResumePdf.tsx         # PDF renderer with markdown support
│   └── JsonLd.tsx            # Reusable JSON-LD structured data
├── lib/
│   ├── keyword-matcher.ts    # Keyword matching with phrase support + stemming
│   ├── ai-phrase-cleaner.ts  # Post-processing AI buzzword removal
│   ├── score-curve.ts        # sqrt score curve + strength labels
│   ├── redact.ts             # Server-side text redaction for previews
│   ├── rate-limit.ts         # In-memory sliding window rate limiter
│   ├── config.ts             # Azure OpenAI configuration
│   ├── constants.ts          # Shared constants
│   └── supabase/             # Supabase client (browser, server, middleware)
└── supabase/
    └── migrations/
        ├── 001_credits.sql           # Credits + usage_history tables, RLS, signup trigger
        └── 002_usage_history_scores.sql  # Score columns + updated deduct_credit RPC
```

## Getting Started

### Prerequisites

- Node.js 20+ (see `engines` in package.json)
- npm
- An [Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service) deployment (GPT-4.1-mini recommended)
- A [Supabase](https://supabase.com/) project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/imWayneWY/ai-resume-tailor.git
cd ai-resume-tailor
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional: Override the site URL for sitemap/canonical (defaults to Vercel URL)
# NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

> **Note:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe to expose — it's designed to be public. Row Level Security (RLS) handles authorization.

### 3. Set up the database

Run the SQL migrations in your Supabase SQL Editor (Dashboard → SQL Editor):

1. Run `supabase/migrations/001_credits.sql` — creates credits table, usage history, RLS policies, signup trigger, deduct_credit RPC
2. Run `supabase/migrations/002_usage_history_scores.sql` — adds score columns, updates deduct_credit to accept scores

### 4. Configure authentication

In your Supabase dashboard:

1. **Email auth** — enabled by default
2. **Google OAuth** (optional):
   - Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
   - Add to Supabase: Authentication → Providers → Google
   - Set redirect URL: `https://your-project.supabase.co/auth/v1/callback`
3. **Site URL**: Authentication → URL Configuration → Set to your deployment URL
4. **Redirect URLs**: Add `http://localhost:3000/auth/callback` (dev) and your production URL

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Run tests

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
```

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com/)
3. Add environment variables in Vercel dashboard (Settings → Environment Variables):
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_DEPLOYMENT`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-deploys on every push to `main`

### Other platforms

The app is a standard Next.js project. Any platform that supports Next.js (Railway, Render, AWS Amplify, self-hosted) will work. Just make sure to set the environment variables.

## How It Works

1. **Upload** — User uploads a PDF resume. `unpdf` extracts the text server-side.
2. **Paste JD** — User pastes a job description.
3. **Extract Keywords** — AI extracts 35-60 keywords from the JD (skills, tools, qualifications, domain terms).
4. **Tailor** — AI rewrites the resume incorporating matched keywords naturally, preserving the candidate's real experience.
5. **Score** — Keyword matcher computes before/after match scores. Scores use a sqrt curve for display (`Math.round(Math.sqrt(raw/100) * 100)`).
6. **Download** — User can edit the result and download as PDF.

## Score System

Raw keyword match ratios are transformed with a sqrt curve for a more intuitive display:

| Raw Score | Curved Score | Label |
|---|---|---|
| 4% | 20 | Weak |
| 17% | 41 | Fair |
| 36% | 60 | Good |
| 57% | 76 | Strong |
| 85% | 92 | Excellent |

Raw scores are stored in the database; curved scores are computed on display only.

## API Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/tailor` | POST | Optional* | Tailor resume to JD. Deducts 1 credit if authenticated. |
| `/api/extract-keywords` | POST | No | Extract keywords from job description |
| `/api/parse-pdf` | POST | No | Extract text from uploaded PDF |
| `/api/credits` | GET | Optional | Check credit balance and auth status |
| `/api/history` | GET | Yes | Fetch usage history for current user |

*Non-authenticated users receive a redacted (gibberish) preview with real match scores.

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request against `main`

## License

MIT — see [LICENSE](LICENSE) for details.
