"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { RecoveryTrace, TraceStage } from "./RecoveryTrace";
import { ResultBadge, SectionHeader, EASE_OUT } from "./primitives";
import { getCaseAuditTrail } from "@/lib/api";
import { AuditTrail } from "@/lib/types";

export type Origin = { x: number; y: number } | null;

function formatCause(cause: string) {
  return cause.replace(/_/g, " ");
}

function buildStages(trail: AuditTrail): TraceStage[] {
  const hasDiagnosis = !!trail.diagnosis;
  const hasDecision = !!trail.decision;
  const hasActions = trail.actions.length > 0;
  const lastAction = trail.actions[trail.actions.length - 1];
  const isResolved = lastAction && ["success", "escalated"].includes(lastAction.result);

  return [
    { label: "Detected", status: "done" },
    { label: "Diagnosed", status: hasDiagnosis ? "done" : "active" },
    { label: "Decided", status: hasDecision ? "done" : hasDiagnosis ? "active" : "pending" },
    { label: "Acted", status: hasActions ? "done" : hasDecision ? "active" : "pending" },
    {
      label: isResolved && lastAction.result === "escalated" ? "Escalated" : "Result",
      status: isResolved ? "done" : hasActions ? "active" : "pending",
    },
  ];
}

export function CaseModal({
  transactionId, origin, onClose,
}: { transactionId: string | null; origin: Origin; onClose: () => void }) {
  const [trail, setTrail] = useState<AuditTrail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    setTrail(null);
    setError(null);
    getCaseAuditTrail(transactionId)
      .then(setTrail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load case"));
  }, [transactionId]);

  const open = !!transactionId;
  const originStyle = origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : {};

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 pointer-events-none">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto w-full max-w-4xl max-h-[88vh] overflow-y-auto scrollbar-none bg-card border border-border rounded-2xl"
                  style={{ ...originStyle, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)" }}
                  initial={{ opacity: 0, scale: 0.2 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.25 }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                >
                  <div className="flex items-center justify-between p-6 border-b border-border/50 sticky top-0 bg-card/95 backdrop-blur-md z-10 rounded-t-2xl">
                    <Dialog.Title className="text-lg font-semibold text-foreground">Case Detail</Dialog.Title>
                    <Dialog.Close asChild>
                      <button className="p-2 rounded-lg hover:bg-accent transition-colors" aria-label="Close">
                        <X className="size-5 text-muted-foreground" />
                      </button>
                    </Dialog.Close>
                  </div>

                  <div className="p-6 space-y-7">
                    {error && (
                      <div className="px-4 py-3 rounded-xl bg-fin-loss/10 border border-fin-loss/20 text-fin-loss text-sm">
                        {error}
                      </div>
                    )}

                    {!trail && !error && (
                      <div className="text-sm text-muted-foreground py-16 text-center">Loading audit trail…</div>
                    )}

                    {trail && (
                      <>
                        <div>
                          <SectionHeader title="Recovery Trace" subtitle="How this case was handled, end to end" />
                          <div className="py-3 px-2">
                            <RecoveryTrace stages={buildStages(trail)} />
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4">
                          {trail.diagnosis && (
                            <div className="rounded-xl surface-elevated p-4">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Diagnosis</p>
                              <p className="text-sm text-foreground capitalize font-medium">{formatCause(trail.diagnosis.root_cause)}</p>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{trail.diagnosis.reasoning}</p>
                              <p className="text-[11px] text-muted-foreground/70 mt-2.5 font-mono">
                                confidence: {(trail.diagnosis.confidence * 100).toFixed(0)}%
                              </p>
                            </div>
                          )}

                          {trail.decision && (
                            <div className="rounded-xl surface-elevated p-4">
                              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Decision</p>
                              <p className="text-sm text-foreground capitalize font-medium">{formatCause(trail.decision.action_type)}</p>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{trail.decision.reasoning}</p>
                            </div>
                          )}
                        </div>

                        {trail.actions.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions Taken</p>
                            <div className="space-y-2.5">
                              {trail.actions.map((a) => (
                                <div key={a.attempt_number} className="rounded-xl surface-elevated p-4 flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground capitalize">
                                      Attempt {a.attempt_number} — {formatCause(a.action_type)}
                                    </p>
                                    {a.amount_recovered > 0 && (
                                      <p className="text-xs text-fin-gain font-mono mt-1">
                                        ₹{a.amount_recovered.toLocaleString("en-IN")} recovered
                                      </p>
                                    )}
                                  </div>
                                  <ResultBadge result={a.result} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}