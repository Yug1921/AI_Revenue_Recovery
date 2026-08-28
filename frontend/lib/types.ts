export type BatchStatus = "running" | "completed";

export type BatchSummary = {
  batch_id: string;
  status: BatchStatus;
  total_transactions: number;
  total_at_risk: number;
  total_recovered: number;
  recovery_rate: number;
  exceptions_count: number;
};

export type Case = {
  transaction_id: string;
  type: string;
  amount: number;
  root_cause: string | null;
  action_type: string | null;
  result: string | null;
  amount_recovered: number;
  updated_at: string;
};

export type AuditAction = {
  attempt_number: number;
  action_type: string;
  razorpay_call: Record<string, unknown> | null;
  result: string;
  amount_recovered: number;
  created_at: string;
};

export type AuditTrail = {
  transaction: Record<string, unknown>;
  diagnosis: { root_cause: string; confidence: number; reasoning: string } | null;
  decision: { action_type: string; bounds_applied: Record<string, unknown>; reasoning: string } | null;
  actions: AuditAction[];
};