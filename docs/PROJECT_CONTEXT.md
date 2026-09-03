# Project Context — Payment Recovery Agent
**For: Razorpay AI Buildathon 2026 — Track 03: AI Revenue Recovery**
**Author: Yug (GitHub: Yug1921) — CS student, full-stack dev**

This file reflects the ACTUAL current state of the project, not the original plan. Feed this
entire file to any AI assistant before asking it to work on a task — it contains what's built,
what's deployed, and what's genuinely left.

**Live demo:** https://ai-revenue-recovery-eta-three.vercel.app
**API:** https://ai-revenue-recovery-rpyg.onrender.com
**Status:** MVP complete, deployed, tested end-to-end. Polish/stretch items remain (Section 8).

---

## 1. Why this project exists

Razorpay is running a buildathon-as-hiring-funnel for an AI Builder Internship. A public GitHub
repo + a 5-minute pitch go straight to a panel interview. Judged on four things: **Problem
Taste, Build Quality, AI Judgment, Failure Recovery**. Applications close September 5, 2026.

Track picked: **Track 03, AI Revenue Recovery**. The bar: "Don't just identify the problem. Show
measured money recovered across a batch, with compliant escalation, stopping rules, and an
audit trail."

## 2. The problem, in plain terms

Merchants lose revenue three quiet ways: a payment fails and nobody follows up, a checkout gets
abandoned and the customer is never re-engaged, or a subscription charge fails silently and the
customer churns unnoticed. This agent runs an automated recovery loop over a batch of
transactions instead of leaving that money unchased.

## 3. What's actually built — the full loop

1. **Detect** — a synthetic transaction generator seeds a batch (default size configurable via
   `DEFAULT_BATCH_SIZE` env var, currently 30 for faster demo/testing runs; originally 60).
   Covers three transaction types (`payment_failed`, `checkout_abandoned`, `subscription_failed`)
   with realistic, deliberately messy `raw_error_code`/`raw_error_message` combinations.
2. **Diagnose** — a rules-first classifier (`app/diagnosis/rules.py`) resolves ~85-90% of cases
   for free and instantly. Only genuinely ambiguous cases fall through to an LLM call via
   OpenRouter with a multi-model fallback chain (`app/diagnosis/llm.py`). Every diagnosis is
   tagged with `method: "rule" | "llm"` so the split is visible and provable, not just claimed.
3. **Decide** — a deterministic rules table (`app/decisions/rules.py`) maps each root cause to
   an action with hard bounds (max retries, cooldown, fallback action). Zero LLM involvement in
   this step, by design.
4. **Act** — `app/execution/engine.py` executes the decision. `new_payment_link` and `retry`
   make REAL Razorpay test-mode API calls (Payment Links API, Orders API). `nudge` generates a
   real message and can send it as a real email via Resend. `escalate` logs and stops. Every
   action respects its bounds — no unlimited retries, ever.
5. **Log & report** — every diagnosis, decision, and action attempt is written to Supabase.
   A batch's `batch_runs` row aggregates total at risk, total recovered, recovery rate, and
   exceptions count, updated live as the batch progresses.

## 4. What's built beyond the original MVP scope

These were added after the MVP loop worked end-to-end, per the original "MVP first, stretch
after" rule — and they're real, not mocked:

- **Real email delivery via Resend** — nudge messages are actually sent, not just logged. Since
  this runs on Resend's free tier with no verified sending domain, delivery is intentionally
  routed to one verified developer inbox, clearly labeled `[DEMO]`, stating who it would have
  gone to. This is a disclosed sandbox constraint, not a hidden limitation.
- **Nudges tab** — a dedicated UI listing every abandoned-checkout case with its generated
  message, a demo customer email, and a one-click Send (and "Send All", sequential with a delay
  to respect rate limits) button per case.
- **Activity tab** — a full batch history list (`GET /api/batches`), letting a user browse every
  batch ever run and reload any of them instead of manually tracking batch IDs.
- **Case Detail modal** — a centered, animated modal (not a side drawer — deliberately changed
  after early testing showed a drawer cramped the content) showing the full Recovery Trace
  (an animated SVG timeline: Detected → Diagnosed → Decided → Acted → Result), diagnosis
  reasoning, decision reasoning, every action attempt, and — for nudge cases — the full message
  text with a copy button.
- **Recovery Trend chart click-to-navigate** — clicking a point on the cumulative-recovery chart
  jumps to that exact row in the Cases table and highlights it, rather than opening a modal.
- **Batch progress visibility** — `current_stage` and `last_updated_at` columns on `batch_runs`,
  updated at each pipeline stage and periodically mid-stage, surfaced in the UI as a glass-effect
  loading overlay with the live stage name, plus a stalled-batch warning if no update lands
  within 90 seconds. Built specifically because early Render deployments made batches appear
  silently stuck with no visibility into whether they were slow or actually broken.
- **Per-record resilience** — a Supabase HTTP/2-on-Windows flakiness issue (`WinError 10035`/
  `10054`) was hit repeatedly during development. Fixed with a `with_retry` helper
  (`app/db_retry.py`, 5 attempts with backoff) wrapping every Supabase call, plus per-transaction
  try/except in each pipeline stage so one failing record logs and gets skipped instead of
  killing the rest of a 60-record batch. This is a real "Failure Recovery" story worth mentioning
  in the pitch, not just a bug fix.

## 5. Tech stack (as actually deployed, free tier)

- **Backend**: FastAPI (Python 3.13/3.14), Supabase (Postgres), Razorpay test-mode APIs
  (Payment Links, Orders), OpenRouter (multi-model LLM fallback), Resend (email). Deployed on
  Render.
- **Frontend**: Next.js 16 (App Router), Tailwind v4 (CSS-first config, OKLCH color tokens),
  `motion` (Framer Motion), Recharts, `@radix-ui/react-dialog` for the Case Detail modal, lucide
  icons. Deployed on Vercel.
- **Design system**: adapted from a v0.dev-generated reference dashboard (RazorpayX-inspired
  dark theme). Primary color swapped to blue to match Razorpay's actual CTA color; the signature
  visual element (Recovery Trace) is an animated gradient-stroke SVG timeline, styled after
  RazorpayX's own loader glyph animation but repurposed as a functional audit-trail progress
  indicator instead of decoration.

## 6. Database schema (Supabase / Postgres, as actually deployed)

```sql
create table transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  razorpay_ref text,
  type text not null,             -- 'payment_failed' | 'checkout_abandoned' | 'subscription_failed'
  amount numeric not null,
  currency text default 'INR',
  customer_name text,
  customer_contact text,
  raw_error_code text,
  raw_error_message text,
  created_at timestamptz default now()
);

create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  root_cause text not null,
  confidence numeric,
  reasoning text,
  created_at timestamptz default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  action_type text not null,      -- 'retry' | 'new_payment_link' | 'nudge' | 'escalate'
  bounds_applied jsonb,
  reasoning text,
  created_at timestamptz default now()
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  attempt_number int not null,
  action_type text not null,      -- includes 'email_nudge_sent' for real Resend sends
  razorpay_call jsonb,
  result text not null,           -- 'success' | 'failed' | 'pending' | 'escalated'
  amount_recovered numeric default 0,
  created_at timestamptz default now()
);

create table batch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_transactions int,
  total_at_risk numeric,
  total_recovered numeric,
  recovery_rate numeric,
  exceptions_count int,
  current_stage text,             -- added post-MVP: 'seeding'|'diagnosing'|'deciding'|'executing'|'done'|'failed'
  last_updated_at timestamptz     -- added post-MVP: heartbeat, powers stalled-batch detection
);
```

**Important operational note**: this schema file is a reference, not the live source of truth.
Any change here must ALSO be run manually in Supabase's SQL Editor — editing this file alone
does not change the deployed database. This exact gap caused a real multi-day bug (batches
silently dying at the first pipeline step because `current_stage`/`last_updated_at` were added
to this file but never applied to the live table) before being caught. Always apply schema
changes in Supabase directly, then update this file to match.

## 7. API endpoints (as actually implemented, `app/main.py`)

```
GET  /health
GET  /
POST /api/batch/run
  body: { count?: int }  — omit count to use DEFAULT_BATCH_SIZE from env
  → { batch_id, status: "running" }
  Inserts the batch_runs row synchronously before returning (avoids a 404 race the frontend
  used to hit polling immediately after this call), then runs the full pipeline as a
  BackgroundTask.

GET  /api/batch/{batch_id}/summary
  → { batch_id, status, total_transactions, total_at_risk, total_recovered,
      recovery_rate, exceptions_count, current_stage, last_updated_at }

GET  /api/batch/{batch_id}/cases
  → [{ transaction_id, type, amount, root_cause, action_type, result,
       amount_recovered, updated_at }]

GET  /api/case/{transaction_id}/audit-trail
  → { transaction, diagnosis, decision, actions: [...], nudge_message }
  nudge_message is populated only when decision.action_type === "nudge", reusing the exact
  same message-generation logic as the Nudges tab and the actual sent email.

GET  /api/batches
  → [{ batch_id, started_at, status, total_transactions, total_at_risk,
       total_recovered, recovery_rate, exceptions_count }]
  Powers the Activity tab. Ordered most-recent-first.

GET  /api/nudges?batch_id={id}
  → [{ transaction_id, customer_name, amount, demo_email, message_preview, send_status }]
  Powers the Nudges tab.

POST /api/nudge/{transaction_id}/send
  → { success, demo_email, error }
  Sends a real email via Resend (routed to RESEND_TO_EMAIL, the developer's verified inbox —
  see Section 4). Logs an `email_nudge_sent` row to `actions` regardless of outcome.
```

All Supabase calls across every endpoint are wrapped in `with_retry` (`app/db_retry.py`).
CORS is configured with an explicit origin whitelist (not `*`) matching the deployed Vercel URL
plus `localhost:3000` for local dev — every time the Vercel URL changes, this list needs
updating on the backend.

## 8. Root-cause → action mapping (as actually implemented, `app/decisions/rules.py`)

| root_cause          | action_type       | max_retries | cooldown   | fallback   |
|----------------------|-------------------|-------------|------------|------------|
| bank_declined         | retry             | 2           | 30 min     | escalate   |
| insufficient_funds    | nudge             | 1           | 24 hr      | escalate   |
| mandate_expired       | new_payment_link  | 1           | immediate  | escalate   |
| gateway_timeout        | retry             | 3           | 5 min      | escalate   |
| user_abandoned         | nudge             | 2           | 2 hr       | escalate   |
| subscription_failed    | retry             | 2           | 60 min     | nudge      |
| unknown                | escalate          | 0           | —          | —          |

Hard global rule: no action type gets unlimited retries. Bounds exhausted → escalate, logged as
an honest exception, never hidden.

## 9. Environment variables (both local `.env` and Render/Vercel dashboards — these are
   SEPARATE stores, setting one does not set the other)

**Backend**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_LIVE_CALLS` (true/false), `OPENROUTER_API_KEY`, `OPENROUTER_MODELS` (comma-separated
fallback chain), `RESEND_API_KEY`, `RESEND_TO_EMAIL`, `RESEND_FROM_EMAIL`, `DEFAULT_BATCH_SIZE`.

**Frontend**: `NEXT_PUBLIC_API_URL` — inlined at Next.js BUILD time, not runtime. Changing it in
Vercel's dashboard requires a redeploy to take effect, not just a save.

## 10. Judging-criteria alignment

- **Problem Taste** → Section 2 — real, common, quantifiable loss; not a hypothetical.
- **Build Quality** → separated `backend/`/`frontend/` folders, this file, a professional
  `README.md` with honest scope notes, real deployed URLs, clean git history.
- **AI Judgment** → LLM used ONLY for ambiguous-case diagnosis (~10-15% of a batch), proven with
  a visible rule-vs-LLM split in the diagnosis output. Decision engine is 100% deterministic —
  no LLM moves money. This restraint is the actual answer to "AI Judgment," worth stating
  explicitly in the pitch rather than assuming a judge infers it.
- **Failure Recovery** → two real, distinct stories: (1) the *product's* own bounded escalation
  when a recovery action can't succeed (honest, logged, not hidden), and (2) the *system's*
  resilience to real infrastructure flakiness encountered during actual development (Windows
  HTTP/2 issues, Render free-tier slowness, a schema-file-vs-live-database gap) — all fixed with
  visible, explainable mechanisms (`with_retry`, per-record skip-and-continue, stage/heartbeat
  tracking), not silently patched over.

## 11. Pitch structure

1. The problem in one sentence (Section 2).
2. Live demo: run a batch, watch the glass-effect loading overlay show live stage progress,
   watch the dashboard populate.
3. Click a Recovery Trend chart point → land on that exact case in the Cases table (highlighted).
4. Open a recovered case → walk the Recovery Trace (detect → diagnose → decide → act → result).
5. Open an escalated case → show it was an honest, bounded give-up, not a hidden failure.
6. Show the batch summary: ₹X at risk, ₹Y recovered, Z% recovery rate, N exceptions.
7. Open the Nudges tab, send one real email live, show it landing in the inbox — proof the
   agent's decisions produce a real, external action, not just a database row.
8. Close with the AI Judgment line: LLM only where a rules table genuinely can't help; the
   money-moving decision engine is deterministic on purpose.

## 12. Known gaps (stated plainly, not defensively — see README's "Scope" section for the
    public-facing version of this)

- Data is synthetic; no live merchant/customer history behind it.
- Email delivery is sandboxed to one verified inbox (Resend free-tier constraint).
- Render free tier means real cold-start and throttled-CPU latency — plan demo timing around
  hitting `/health` a minute before presenting to warm the instance.
- No API authentication — acceptable for a public demo over synthetic data, not for real
  merchant financial data.
- Hinglish nudge generation (an original differentiator idea) was not built — nudges are
  English-only for now. The architecture (a single `build_nudge_message()` function) would make
  adding language variants a contained change, not a redesign.
- WhatsApp/SMS delivery channels are not built — only email, via Resend.