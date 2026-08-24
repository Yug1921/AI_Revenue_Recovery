-- Run this once in the Supabase SQL Editor.
-- Matches Section 7 of PROJECT_CONTEXT.md exactly.

create extension if not exists "pgcrypto";

create table if not exists transactions (
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

create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  root_cause text not null,
  confidence numeric,
  reasoning text,
  created_at timestamptz default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  action_type text not null,
  bounds_applied jsonb,
  reasoning text,
  created_at timestamptz default now()
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id),
  attempt_number int not null,
  action_type text not null,
  razorpay_call jsonb,
  result text not null,
  amount_recovered numeric default 0,
  created_at timestamptz default now()
);

create table if not exists batch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  completed_at timestamptz,
  total_transactions int,
  total_at_risk numeric,
  total_recovered numeric,
  recovery_rate numeric,
  exceptions_count int
);

-- helpful indexes for the dashboard queries
create index if not exists idx_transactions_batch on transactions(batch_id);
create index if not exists idx_diagnoses_txn on diagnoses(transaction_id);
create index if not exists idx_decisions_txn on decisions(transaction_id);
create index if not exists idx_actions_txn on actions(transaction_id);
