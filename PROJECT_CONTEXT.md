# Project Context — Payment Recovery Agent (working title)
**For: Razorpay AI Buildathon 2026 — Track 03: AI Revenue Recovery**
**Author: Yug (GitHub: Yug1921) — CS student, full-stack dev**

This file is the single source of truth for this project. Feed this entire file to any AI
assistant (Claude, GPT, etc.) before asking it to work on a specific task below — it contains
everything needed to work on that task independently, without needing the rest of the
conversation history.

---

## 1. Why this project exists

Razorpay is running a buildathon-as-hiring-funnel for an AI Builder Internship (₹75,000/month,
Bangalore, in-person). No resume screen, no aptitude test — a public GitHub repo + a 5-minute
pitch + architecture walkthrough go straight to a panel interview. Judged on four things:

- **Problem Taste** — did you pick a real, financially/operationally significant problem
- **Build Quality** — code structure, repo organization, execution stability
- **AI Judgment** — was AI/LLM/agent usage appropriate, not forced in for buzzword reasons
- **Failure Recovery** — how the system detects its own failures at runtime and degrades gracefully

Applications close **September 5, 2026**.

We picked **Track 03: AI Revenue Recovery**. The track's explicit bar:
> "Don't just identify the problem. Show measured money recovered across a batch, with
> compliant escalation, stopping rules, and an audit trail."

Track's example directions we are combining into one coherent product:
- Payment degradation → root cause → recovery action
- Checkout drop-off recovery
- Failed-subscription recovery
- Hinglish voice/text recovery

## 2. The problem, in plain terms

Merchants lose revenue in three quiet, unattended ways:
1. A payment attempt **fails** (card declined, UPI mandate timeout, network blip) and nobody
   follows up.
2. A customer **abandons checkout** mid-way and is never re-engaged.
3. A **recurring subscription charge fails silently** and the customer just churns, unnoticed.

Most merchants either do nothing or chase this manually, days later, when it's too late.

## 3. What the product does (the workflow)

A closed loop, run against a batch of transactions:

1. **Detect** — watch Razorpay test-mode events (`payment.failed`, abandoned checkout sessions,
   `subscription.charged.failed`) and flag revenue at risk.
2. **Diagnose** — classify *why* it failed (bank declined / insufficient funds / UPI mandate
   expired / user abandoned / gateway timeout) with a reason + confidence score. This is the one
   LLM-necessary step — reading messy error context and producing a clean structured diagnosis.
3. **Decide** — a bounded rules engine maps diagnosis → intervention type (retry later / send new
   payment link / nudge message / escalate to human). Rules, not a free-roaming agent — this is
   what "bounded and gated" means in the brief.
4. **Act** — execute the intervention via Razorpay test-mode APIs (new payment link, retry
   attempt, reminder). Hard limits enforced: max retries, cooldown between attempts, spend/discount
   cap if incentives are offered, automatic escalation after N failed attempts (no infinite
   hammering of the customer).
5. **Log** — every step (detected → diagnosed → decided → acted → result) written to an audit
   trail, human-readable, no hidden logic.
6. **Report** — run against a batch (50+ synthetic records), report ₹ at risk, ₹ recovered,
   recovery rate %, and an honest list of cases the agent correctly gave up on. One cherry-picked
   success story proves nothing — the batch number is the whole point.

## 4. Differentiator

**Hinglish recovery nudges** — the customer-facing reminder message (for abandoned checkout /
failed subscription) is generated in natural Hinglish via LLM, not generic English boilerplate.
Called out by name in the track's example directions; almost no one else will build this.

## 5. Tech stack (free tier only — matches what Yug already knows)

- **Backend**: FastAPI (Python), deployed on Render free tier
- **Database**: Supabase (Postgres), free tier
- **LLM**: OpenRouter, multi-model fallback chain (same pattern as Corporate Action Impact
  Scorer project — try model A, fall back to B/C on failure/rate-limit)
- **Payments**: Razorpay test-mode APIs (Orders, Payment Links, Subscriptions, Webhooks) — free
- **Frontend**: Next.js 14 + TypeScript + Tailwind, deployed on Vercel free tier
- **Charts**: Recharts (reuse styling patterns from Corporate Action Scorer / LinkedIn CRM)
- **Real-time**: WebSocket or polling for live case feed (reuse pattern from LinkedIn CRM dashboard)

## 6. Scope control — MVP first, stretch after

**MVP (must-have, this is what gets demoed if time runs out):**
- Synthetic data generator producing 50+ realistic failed-payment/abandoned-checkout records
- Diagnosis engine (rules + one LLM call) classifying root cause
- Decision engine with explicit bounded rules (retry/nudge/escalate + hard limits)
- Execution against Razorpay test-mode APIs for at least the "new payment link" and "retry"
  actions
- Audit log stored and queryable
- Dashboard: batch summary (₹ at risk / ₹ recovered / recovery rate) + case list + one case's
  full audit trail visible

**Stretch (only after MVP works end-to-end):**
- Hinglish nudge message generation + preview
- Subscription-specific retry sequencing
- "Promise to pay" tracker for B2B-style follow-up
- Escalation-to-human UI mock (e.g., a flagged case queue)

Do not build stretch features before the MVP loop runs cleanly on a batch. A working simple loop
beats a half-built ambitious one — this is explicitly how the track is judged.

---

## 7. Database schema (Supabase / Postgres)

```sql
-- one row per synthetic or real transaction event we're tracking
create table transactions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  razorpay_ref text,              -- order_id / payment_id / subscription_id (test-mode)
  type text not null,             -- 'payment_failed' | 'checkout_abandoned' | 'subscription_failed'
  amount numeric not null,
  currency text default 'INR',
  customer_name text,
  customer_contact text,          -- for the nudge message
  raw_error_code text,            -- whatever Razorpay/gateway gave us
  raw_error_message text,
  created_at timestamptz default now()
);

-- one row per diagnosis produced for a transaction
create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  root_cause text not null,       -- e.g. 'bank_declined' | 'mandate_expired' | 'user_abandoned' | 'timeout'
  confidence numeric,             -- 0-1
  reasoning text,                 -- short LLM-produced explanation
  created_at timestamptz default now()
);

-- one row per decision produced for a transaction
create table decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  action_type text not null,      -- 'retry' | 'new_payment_link' | 'nudge' | 'escalate' | 'give_up'
  bounds_applied jsonb,           -- { "max_retries": 3, "cooldown_minutes": 30, "spend_cap": 0 }
  reasoning text,
  created_at timestamptz default now()
);

-- one row per executed action (can be multiple per transaction, e.g. 3 retries)
create table actions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  attempt_number int not null,
  action_type text not null,
  razorpay_call jsonb,            -- what we called and with what params (test-mode)
  result text not null,           -- 'success' | 'failed' | 'pending' | 'escalated'
  amount_recovered numeric default 0,
  created_at timestamptz default now()
);

-- one row per batch run, for the dashboard summary
create table batch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_transactions int,
  total_at_risk numeric,
  total_recovered numeric,
  recovery_rate numeric,          -- computed: total_recovered / total_at_risk
  exceptions_count int            -- cases the agent correctly gave up on
);
```

The `audit trail` for a transaction is simply: `transactions` row + all its `diagnoses` +
`decisions` + `actions` rows, ordered by `created_at`. No separate audit table needed — this
keeps the schema simple and the trail is naturally complete.

---

## 8. API contract (backend ⇄ frontend boundary)

This is the interface both sides build against, so backend and frontend can be built in parallel
without talking to each other mid-build.

```
POST /api/batch/run
  → kicks off a new batch: generates/loads synthetic transactions, runs the full
    detect→diagnose→decide→act loop on all of them
  → response: { batch_id: string, status: "running" }

GET /api/batch/{batch_id}/summary
  → response: {
      batch_id, status: "running" | "completed",
      total_transactions, total_at_risk, total_recovered,
      recovery_rate, exceptions_count
    }

GET /api/batch/{batch_id}/cases
  → response: array of {
      transaction_id, type, amount, root_cause, action_type,
      result, amount_recovered, updated_at
    }
  (this powers the live case list / feed)

GET /api/case/{transaction_id}/audit-trail
  → response: {
      transaction: {...},
      diagnosis: {...},
      decision: {...},
      actions: [ {...}, {...} ]   // in order, e.g. attempt 1 failed, attempt 2 succeeded
    }
  (this powers the case detail / audit trail drill-down view)

WS /ws/batch/{batch_id}   (optional — polling GET /cases every few seconds is an acceptable
  fallback if WebSocket adds too much complexity)
  → pushes case updates as they happen, for the live feed
```

Keep response shapes exactly as above — any changes must be updated here so both sides stay in
sync.

---

## 9. Task breakdown — can be worked on independently

Each task below is scoped so a different assistant/session can pick it up with just this file and
succeed without needing the other tasks' code. Dependencies are noted explicitly.

### BACKEND

**Backend Task A — Synthetic data generator + DB setup**
*No dependencies. Do this first — everything else needs data to run against.*
- Set up Supabase project, run the schema in Section 7
- Write a script that generates 50-80 realistic synthetic transaction records covering all
  three `type`s and a spread of `raw_error_code`/`raw_error_message` values that map to the
  different root causes in Section 10
- Insert into `transactions` table tagged with a `batch_id`
- Output: a repeatable seed script + a populated dev database

**Backend Task B — Diagnosis engine**
*Depends on Task A's schema (not its data — can build against schema alone).*
- Input: one `transactions` row
- Rules-first pass on `raw_error_code` (cheap, deterministic) for the obvious cases
- LLM call (OpenRouter, multi-model fallback chain like the Corporate Action Scorer project) for
  ambiguous/messy cases — produce `root_cause`, `confidence`, `reasoning`
- Write result to `diagnoses` table
- Output: a function/endpoint `diagnose(transaction) -> Diagnosis`

**Backend Task C — Decision engine**
*Depends on Diagnosis output shape (Task B's contract, not its implementation).*
- A explicit rules table mapping `root_cause` → `action_type` + bounds (see Section 10)
- No LLM here — this must be deterministic and explainable, that's the "bounded and gated"
  requirement
- Write result to `decisions` table
- Output: a function `decide(diagnosis) -> Decision`

**Backend Task D — Execution / recovery agent**
*Depends on Decision output shape (Task C's contract).*
- Executes the decided action against Razorpay test-mode APIs:
  - `retry` → re-attempt the payment via test-mode API
  - `new_payment_link` → create a fresh Razorpay Payment Link (test-mode)
  - `nudge` → generate a reminder message (stretch: Hinglish via LLM) — sending is simulated/logged,
    not actually SMS'd anywhere
  - `escalate` → mark as needing human attention, stop automated action
- Enforces stopping rules: max attempts (from `bounds_applied`), cooldown, and hard stop → escalate
- Write result to `actions` table, update `batch_runs` aggregate numbers
- Output: a function `execute(decision) -> ActionResult`, plus the batch orchestrator that runs
  A→B→C→D across a whole batch and updates `batch_runs`

**Backend Task E — API layer**
*Depends on all of the above existing as callable functions; can be scaffolded early against
mocked data using the contract in Section 8.*
- Implement the endpoints exactly as specified in Section 8
- CORS configured for the Vercel frontend origin
- Deploy to Render free tier

### FRONTEND

**Frontend Task A — Dashboard shell + batch summary**
*Can be built entirely against mocked/hardcoded JSON matching Section 8's `/summary` shape —
does not need the real backend to exist yet.*
- Next.js page showing: total at risk, total recovered, recovery rate (big number cards), a
  simple bar/donut chart (Recharts, reuse Corporate Action Scorer styling)
- "Run new batch" button wired to `POST /api/batch/run`

**Frontend Task B — Live case list/feed**
*Can be built against mocked `/cases` response.*
- Table/list of cases: type, amount, root cause, action taken, result, status badge
  (recovered / pending / escalated / failed)
- Polling (simplest) or WebSocket (if Task D on backend implements it) for live updates while a
  batch is running

**Frontend Task C — Case detail / audit trail view**
*Can be built against mocked `/audit-trail` response.*
- Click into any case → timeline view: detected → diagnosed (with reasoning) → decided (with
  bounds shown) → action(s) taken → final result
- This is the single most important screen for the pitch — it's the literal proof of "explainable,
  bounded, gated" — make it clean and readable, not cluttered

**Frontend Task D — Polish pass**
*Depends on A, B, C existing.*
- Consistent theming (reuse Bloomberg-terminal-style dark theme from Corporate Action Scorer, or
  the neon dashboard system from GoTeeOff — whichever fits better)
- Empty/loading/error states
- Mobile-reasonable layout (not required to be perfect, just not broken)

---

## 10. Root-cause → action mapping (Decision engine rules — starting point, refine as needed)

| root_cause          | action_type       | max_retries | cooldown   | notes                                  |
|----------------------|-------------------|-------------|------------|------------------------------------------|
| bank_declined         | retry             | 2           | 30 min     | some banks auto-clear on retry           |
| insufficient_funds    | nudge (later)     | 1           | 24 hr      | retrying immediately rarely helps        |
| mandate_expired       | new_payment_link  | 1           | immediate  | old mandate is dead, need a fresh one    |
| gateway_timeout        | retry             | 3           | 5 min      | usually transient                        |
| user_abandoned         | nudge             | 2           | 2 hr, 24 hr| reminder messages, optionally Hinglish   |
| subscription_failed    | retry, then nudge | 2 retries + 1 nudge | per Razorpay recommended cadence | escalate to "promise to pay" if all fail |
| unknown/low_confidence | escalate          | 0           | —          | don't guess with real money actions      |

Hard global rule: **no action type gets unlimited retries.** After bounds are exhausted →
`escalate`, logged as an honest exception, not hidden.

---

## 11. Judging-criteria alignment (keep this in mind while building, and for the pitch)

- **Problem Taste** → Section 2/3 (real, common, quantifiable loss)
- **Build Quality** → clean repo structure (separate `backend/` and `frontend/` folders, this
  file at root, clear README linking to both)
- **AI Judgment** → LLM used only where it's actually needed (diagnosis of messy/ambiguous
  error text, optional Hinglish generation) — NOT used for the decision engine, which must stay
  deterministic and explainable. Be ready to explain this choice explicitly in the pitch — it's
  a strong "AI Judgment" signal to show restraint.
- **Failure Recovery** → the decision engine's stopping rules and escalation path ARE the
  failure-recovery story: when the agent can't recover money, it says so honestly rather than
  faking success or looping forever.

## 12. Pitch structure (for the 5-minute walkthrough later)

1. The problem in one sentence (Section 2)
2. Live demo: run a batch, watch the dashboard populate in real time
3. Click into one recovered case → walk the audit trail (detect → diagnose → decide → act)
4. Click into one escalated/failed case → show it was an honest, bounded give-up, not a hidden
   failure
5. Show the batch summary number: ₹X at risk, ₹Y recovered, Z% recovery rate
6. One line on why LLM was used only for diagnosis/nudges, not for the money-moving decision —
   this is the AI Judgment answer

---

## 13. Open decisions still to make

- Final project name (currently neutral/working-title only)
- Whether WebSocket or polling for live updates (recommend: start with polling, it's simpler and
  good enough for a demo)
- Whether to attempt the Hinglish nudge stretch feature before or after MVP is fully working
  (recommend: after)
