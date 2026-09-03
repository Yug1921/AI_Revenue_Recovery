# Payment Recovery Agent

**Razorpay AI Buildathon 2026 — Track 03: AI Revenue Recovery**

An agent that finds revenue slipping away from failed payments, abandoned checkouts, and failed
subscriptions, figures out why, and recovers it automatically within safe, bounded limits.

**Live demo:** https://ai-revenue-recovery-eta-three.vercel.app
**API:** https://ai-revenue-recovery-rpyg.onrender.com

---

## The problem

A payment gets declined. A checkout gets abandoned halfway. A subscription charge fails
silently. None of this is one big failure, it's a steady drip of small losses nobody has time
to chase individually. Most merchants either ignore it or catch it days too late.

This agent runs the whole recovery loop on a batch of transactions: **detect → diagnose →
decide → act → log**, with real numbers at the end instead of a vague "it works."

## How it works

1. **Detect** a batch of at-risk transactions, sized large enough to be a real test, not a
   cherry-picked demo.
2. **Diagnose** the root cause. A rules-first classifier handles the clear cases instantly, for
   free. Only genuinely ambiguous ones go to an LLM (OpenRouter, multi-model fallback) — roughly
   85–90% of a batch never touches an AI call at all.
3. **Decide** the right action using a deterministic, hand-written rules table. No LLM here on
   purpose. Every rule has a hard bound: max retries, cooldown periods, automatic escalation.
   Money-moving decisions should be explainable on demand, not a model's best guess.
4. **Act**, using real Razorpay APIs.
5. **Log** everything, so a finished batch reports ₹ at risk, ₹ recovered, recovery rate, and
   an honest list of cases the agent correctly gave up on.

Two examples of how it adapts per case: an abandoned checkout gets a bounded reminder nudge,
not a payment retry, since there's nothing to retry. A gateway timeout gets the most generous
retry allowance in the system, since it's usually transient and unrelated to the customer.

## Built on real Razorpay APIs

Every action the agent takes runs against Razorpay's **test-mode** APIs, not a mock:

- **Payment Links API** — creates a fresh live payment link when a UPI mandate has expired
- **Orders API** — creates a real order for each retry attempt
- All calls run through test-mode credentials, so nothing here moves real money, but the
  integration itself is genuine, end to end

## The recovery nudge

For nudge actions, the agent writes the actual message a customer would receive and sends it as
a real email via Resend. Since this runs on a free email tier with no verified domain, delivery
is routed to the developer's own verified inbox instead of arbitrary customer addresses, clearly
labeled `[DEMO]`, showing who it would have gone to. The decision and the message are real, only
the delivery target is sandboxed.

## Why the AI is used the way it is

The LLM only shows up in diagnosis, and only when the rules table can't confidently classify a
case. The engine that decides what to do with money stays rule-based, with zero LLM involvement.
Using AI narrowly, where it earns its place, is the actual judgment call here, not routing
everything through a model to look more "AI-powered."

## Built entirely on free tiers

Backend, frontend, database, and email are all running on free tiers, and it still works end to
end. Point real infrastructure budget at this (a paid Render/DB tier, a verified sending domain,
faster LLM quotas) and the same architecture holds, it just gets faster and reaches real
customers instead of a sandboxed inbox.

## Tech stack

- **Backend:** FastAPI, Supabase (Postgres), Razorpay test-mode APIs, OpenRouter, Resend
- **Frontend:** Next.js 16, Tailwind v4, `motion`, Recharts
- **Hosting:** Render, Vercel, Supabase — all free tier

## Screenshots

[Overview dashboard](docs/screenshots/overview.png)

[Cases table](docs/screenshots/cases-table.png)

[Case Detail](docs/screenshots/case-detail.png)

[Nudges tab](docs/screenshots/nudges.png)

[Activity](docs/screenshots/activity.png)

## Running it locally

```bash
# Backend
cd backend
python -m venv venv && venv\Scripts\activate      # or: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Full architecture and schema notes live in `PROJECT_CONTEXT.md`.

## Sample result

A representative 60-transaction batch: **~58% recovery rate**, every unrecovered case logged
as an honest, bounded escalation, not a silent failure.

## Scope

This is a hackathon build on free infrastructure with synthetic data, not a production system
sitting on live merchant traffic. What's real: the API integrations, the decision logic, the
audit trail, the measured numbers. What's intentionally scoped down for a demo timeline should
be easy to spot by anyone poking around, and easy to extend from here.

## A bit about who built this

I'm a full-stack engineer working across React/Next.js, FastAPI, and cloud infrastructure,
usually building things that need to actually run in production. This
project sits alongside another live build of mine, a lead-generation CRM for a Web3 client that
uses a Chrome Extension I wrote to quietly capture LinkedIn leads while browsing, paired with
an LLM scoring pipeline, currently running in production with 130+ real leads captured and zero
paid scraping APIs. Different domain, same instinct: pick a real, unglamorous problem, wire up
the integrations that actually make it work, and be honest about what's finished versus what's
scoped for later. This project is that same approach, pointed at payments.