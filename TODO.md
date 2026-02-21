# AI Resume Tailor — TODO

## 🐧 [Linus] SaaS Buildout

### High-Level Design
- **Credits system** (not subscription): 1 credit = 1 tailor + download
- **Auth required** for credit storage and usage tracking
- **Free tier**: 1 free credit on signup
- **No-login preview**: Real score improvement shown, but resume text is redacted (server-side gibberish + client-side blur). Network-safe — even inspecting response shows nothing useful.
- **Pricing bundles**: 5 for $5 / 12 for $10 / 30 for $20
- **Payment**: Stripe one-time purchases, webhook to add credits
- **Fixed costs**: ~$21/mo (Vercel Pro $20 + domain $1, Supabase free tier)
- **LLM cost**: ~$0.001/request (GPT-4.1-nano) — negligible even with freeloaders

### Phase 1: Auth
- [ ] Add NextAuth.js with Google + GitHub providers
- [ ] Set up database (Supabase / Neon / Vercel Postgres — TBD)
- [ ] User table: id, email, name, provider, created_at
- [ ] Session handling + protected routes

### Phase 2: Credit System
- [ ] Credits table: user_id, balance, created_at, updated_at
- [ ] Give 1 free credit on signup
- [ ] Deduct 1 credit per tailor request
- [ ] Show credit balance in header/nav
- [ ] Block tailor if 0 credits (with "buy more" CTA)
- [ ] Usage history table: user_id, timestamp, jd_title, credits_used
- [ ] **No-login preview**: server-side redaction (replace words with gibberish, keep format/word count) + client-side blur overlay with "Sign up to unlock"

### Phase 3: Stripe Integration
- [ ] Stripe Checkout for one-time credit purchases
- [ ] Credit packages: 5 for $5, 12 for $10, 30 for $20
- [ ] Webhook endpoint to add credits after successful payment
- [ ] Payment history / receipts

### Phase 4: Polish
- [ ] Landing page (marketing, pricing table, CTA)
- [ ] Terms of service / privacy policy
- [ ] Upgrade Vercel to Pro plan (commercial use)
- [ ] Custom domain

---

## 🐧 [Linus] Technical Debt
- [ ] Issue #20: Expand keyword phrase list beyond IT + move to external config
- [ ] Add dev/prod mode for LLM provider selection

---

## 🐾 [YanClaw] General
- (nothing right now)
