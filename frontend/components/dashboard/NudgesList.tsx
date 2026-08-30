"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { SectionHeader, SectionPanel } from "@/components/dashboard/primitives";
import { listNudges, sendNudge } from "@/lib/api";
import { NudgeCandidate } from "@/lib/types";

function formatAmount(value: number) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function NudgesList({
  batchId,
  batchStatus,
  onSelectCase,
}: {
  batchId: string | null;
  batchStatus: "running" | "completed" | null;
  onSelectCase: (id: string, origin: { x: number; y: number }) => void;
}) {
  const [candidates, setCandidates] = useState<NudgeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [sendingMap, setSendingMap] = useState<Record<string, boolean>>({});
  const [sendingAll, setSendingAll] = useState(false);

  const markCandidateSent = (transactionId: string) => {
    setCandidates((prev) =>
      prev.map((item) =>
        item.transaction_id === transactionId ? { ...item, send_status: "sent" } : item,
      ),
    );
  };

  const handleSendAll = async () => {
    if (!batchId || sendingAll) return;

    setSendingAll(true);

    for (const candidate of candidates) {
      if (candidate.send_status !== "not_sent") continue;

      try {
        const result = await sendNudge(candidate.transaction_id);
        if (result.success) {
          markCandidateSent(candidate.transaction_id);
        } else {
          setErrorMap((prev) => ({
            ...prev,
            [candidate.transaction_id]: result.error ?? "Failed to send",
          }));
        }
      } catch {
        setErrorMap((prev) => ({
          ...prev,
          [candidate.transaction_id]: "Failed to send",
        }));
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    setSendingAll(false);
  };

  useEffect(() => {
    if (!batchId) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);
    listNudges(batchId)
      .then((data) => {
        if (!ignore) {
          setCandidates(data);
        }
      })
      .catch(() => {
        if (!ignore) {
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [batchId]);

  useEffect(() => {
    if (!batchId || batchStatus !== "running") {
      return;
    }

    const interval = setInterval(() => {
      listNudges(batchId)
        .then((data) => {
          setCandidates(data);
        })
        .catch(() => {
          setCandidates([]);
        });
    }, 5000);

    return () => clearInterval(interval);
  }, [batchId, batchStatus]);

  const rowStatusClass = useMemo(
    () => ({
      sent: "bg-fin-gain/10 text-fin-gain border border-fin-gain/20",
      not_sent: "bg-muted/40 text-muted-foreground border border-border/60",
    }),
    [],
  );

  if (!batchId) {
    return (
      <SectionPanel>
        <SectionHeader title="Nudges" subtitle="Abandoned-checkout cases with a recovery message ready to send" />
        <div className="text-sm text-muted-foreground py-8">Load a batch first</div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel className="!p-0 overflow-hidden">
      <div className="p-5 lg:p-6 border-b border-border/50">
        <SectionHeader title="Nudges" subtitle="Abandoned-checkout cases with a recovery message ready to send">
          <button
            type="button"
            onClick={handleSendAll}
            disabled={sendingAll || candidates.every((candidate) => candidate.send_status === "sent")}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {sendingAll && <Loader2 className="size-4 animate-spin" />}
            Send All
          </button>
        </SectionHeader>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading nudges…
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {candidates.length === 0 ? (
            <div className="px-5 py-10 text-sm text-muted-foreground">
              {batchStatus === "running" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-fin-pending animate-pulse-soft" />
                  Batch still processing — nudge candidates will appear once decisions are made.
                </span>
              ) : (
                "No nudge candidates for this batch."
              )}
            </div>
          ) : (
            candidates.map((candidate) => {
              const isSending = !!sendingMap[candidate.transaction_id];
              const rowError = errorMap[candidate.transaction_id];
              const isSent = candidate.send_status === "sent";

              return (
                <div
                  key={candidate.transaction_id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    onSelectCase(candidate.transaction_id, {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    });
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors cursor-pointer border-b border-border/30 last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{candidate.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{formatAmount(candidate.amount)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${rowStatusClass[candidate.send_status]}`}
                        >
                          {candidate.send_status === "sent" ? "sent" : "not sent"}
                        </span>
                        <button
                          type="button"
                          disabled={isSending || isSent}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isSending || isSent) return;

                            setSendingMap((prev) => ({ ...prev, [candidate.transaction_id]: true }));
                            setErrorMap((prev) => ({ ...prev, [candidate.transaction_id]: "" }));

                            sendNudge(candidate.transaction_id)
                              .then((result) => {
                                if (result.success) {
                                  markCandidateSent(candidate.transaction_id);
                                  return;
                                }
                                setErrorMap((prev) => ({
                                  ...prev,
                                  [candidate.transaction_id]: result.error ?? "Failed to send",
                                }));
                              })
                              .catch(() => {
                                setErrorMap((prev) => ({
                                  ...prev,
                                  [candidate.transaction_id]: "Failed to send",
                                }));
                              })
                              .finally(() => {
                                setSendingMap((prev) => ({ ...prev, [candidate.transaction_id]: false }));
                              });
                          }}
                          className={`inline-flex min-w-[88px] items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isSent
                              ? "bg-fin-gain/10 text-fin-gain cursor-default"
                              : isSending
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : rowError
                                  ? "bg-fin-loss/10 text-fin-loss hover:bg-fin-loss/15"
                                  : "bg-primary/10 text-primary hover:bg-primary/15"
                          }`}
                        >
                          {isSending ? "Sending…" : rowError ? `Failed — retry` : isSent ? "Sent" : "Send Mail"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-mono tracking-tight text-foreground/85 truncate max-w-[220px]">{candidate.demo_email}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="line-clamp-1 text-muted-foreground/90 max-w-[420px]">{candidate.message_preview}</span>
                    </div>

                    {rowError && (
                      <div className="mt-2 text-[11px] text-fin-loss">{rowError}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </SectionPanel>
  );
}
