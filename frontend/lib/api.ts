import { BatchListItem, BatchSummary, Case, AuditTrail, NudgeCandidate } from "./types";

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

export function runBatch(count?: number): Promise<{ batch_id: string; status: string }> {
  return request("/api/batch/run", {
    method: "POST",
    body: JSON.stringify(count !== undefined ? { count } : {}),
  });
}

export function listBatches(): Promise<BatchListItem[]> {
  return request("/api/batches");
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

export function listNudges(batchId: string): Promise<NudgeCandidate[]> {
  return request(`/api/nudges?batch_id=${batchId}`);
}

export function generateNudgeMessage(
  transactionId: string,
): Promise<{ message: string; source: "ai" | "fallback" }> {
  return request(`/api/nudge/${transactionId}/generate-message`);
}

export function sendNudge(
  transactionId: string,
  message?: string,
): Promise<{ success: boolean; demo_email: string; error: string | null }> {
  return request(`/api/nudge/${transactionId}/send`, {
    method: "POST",
    body: JSON.stringify(message !== undefined ? { message } : {}),
  });
}