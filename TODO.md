# AI Resume Tailor — TODO

## 🐧 [Linus] SaaS Buildout

### High-Level Design
- **Credits system** (not subscription): $1 = 1 credit, 1 credit = 1 tailor + download
- **Auth required** for credit storage and usage tracking
- **Free tier**: X free credits to try (TBD — maybe 3?)
- **Pricing bundles**: TBD (flat vs bundles vs freemium)
- **Payment**: Stripe one-time purchases, webhook to add credits

### Phase 1: Auth
- [ ] Add NextAuth.js with Google + GitHub providers
- [ ] Set up database (Supabase / Neon / Vercel Postgres — TBD)
- [ ] User table: id, email, name, provider, created_at
- [ ] Session handling + protected routes

### Phase 2: Credit System
- [ ] Credits table: user_id, balance, created_at, updated_at
- [ ] Give free credits on signup
- [ ] Deduct 1 credit per tailor request
- [ ] Show credit balance in header/nav
- [ ] Block tailor if 0 credits (with "buy more" CTA)
- [ ] Usage history table: user_id, timestamp, jd_title, credits_used

### Phase 3: Stripe Integration
- [ ] Stripe Checkout for one-time credit purchases
- [ ] Credit packages (e.g., 1 for $1, 5 for $4, 10 for $7 — TBD)
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
