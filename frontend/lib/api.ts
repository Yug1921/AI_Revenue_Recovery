import { BatchSummary, Case, AuditTrail } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export function runBatch(count = 60): Promise<{ batch_id: string; status: string }> {
  return request("/api/batch/run", { method: "POST", body: JSON.stringify({ count }) });
}

export async function getBatchSummary(batchId: string): Promise<BatchSummary | null> {
  const res = await fetch(`${BASE_URL}/api/batch/${batchId}/summary`);
  if (res.status === 404) return null; // not ready yet, not an error
  if (!res.ok) throw new Error(`summary failed: ${res.status}`);
  return res.json();
}

export function getBatchCases(batchId: string): Promise<Case[]> {
  return request(`/api/batch/${batchId}/cases`);
}

export function getCaseAuditTrail(transactionId: string): Promise<AuditTrail> {
  return request(`/api/case/${transactionId}/audit-trail`);
}