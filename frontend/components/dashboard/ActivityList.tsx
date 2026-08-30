"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SectionHeader, SectionPanel } from "./primitives";
import { listBatches } from "@/lib/api";
import { BatchListItem } from "@/lib/types";

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRate(rate: number | null) {
  return rate == null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

function formatRecovered(amount: number | null) {
  return amount == null ? "—" : `₹${amount.toLocaleString("en-IN")}`;
}

export function ActivityList({ onSelectBatch }: { onSelectBatch: (batchId: string) => void }) {
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listBatches()
      .then((result) => {
        if (mounted) setBatches(result);
      })
      .catch((reason) => {
        if (mounted) setError(reason instanceof Error ? reason.message : "Failed to load batch history");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SectionPanel className="!p-0 overflow-hidden">
      <div className="p-5 lg:p-6 border-b border-border/50">
        <SectionHeader title="Batch History" subtitle="All batches run in this session" />
      </div>

      {loading && (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading batch history…</div>
      )}

      {!loading && error && (
        <div className="p-8 text-center text-sm text-fin-loss">{error}</div>
      )}

      {!loading && !error && batches.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">No batches run yet</div>
      )}

      {!loading && !error && batches.length > 0 && (
        <div>
          {batches.map((batch) => (
            <button
              key={batch.batch_id}
              type="button"
              onClick={() => onSelectBatch(batch.batch_id)}
              className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1.5fr_auto_auto_auto_auto] gap-3 items-center text-left p-4 border-b border-border/30 hover:bg-accent/20 transition-all duration-200 cursor-pointer last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">
                  {formatTime(batch.started_at)}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono truncate mt-1">
                  <span className="truncate">{batch.batch_id}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(batch.batch_id);
                      setCopiedId(batch.batch_id);
                      setTimeout(() => setCopiedId((id) => (id === batch.batch_id ? null : id)), 1500);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Copy batch ID"
                  >
                    {copiedId === batch.batch_id ? <Check className="size-3.5 text-fin-gain" /> : <Copy className="size-3.5" />}
                  </button>
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                  batch.status === "completed"
                    ? "bg-fin-gain/10 text-fin-gain"
                    : "bg-fin-pending/10 text-fin-pending animate-pulse-soft"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {batch.status}
              </span>
              <span className="hidden md:block text-right font-mono text-sm text-foreground">
                {formatRate(batch.recovery_rate)}
              </span>
              <span className="hidden md:block text-right font-mono text-sm text-fin-gain">
                {formatRecovered(batch.total_recovered)}
              </span>
              <span className="hidden md:block text-right font-mono text-sm text-muted-foreground">
                {batch.exceptions_count == null ? "—" : batch.exceptions_count}
              </span>
            </button>
          ))}
        </div>
      )}
    </SectionPanel>
  );
}