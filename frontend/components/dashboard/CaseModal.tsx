"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Loader2, Mail, RefreshCw, X } from "lucide-react";
import { RecoveryTrace, TraceStage } from "./RecoveryTrace";
import { ResultBadge, SectionHeader, EASE_OUT } from "./primitives";
import { generateNudgeMessage, getCaseAuditTrail, sendNudge } from "@/lib/api";
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
  const [auditState, setAuditState] = useState<{
    transactionId: string | null;
    trail: AuditTrail | null;
    error: string | null;
  }>({ transactionId: null, trail: null, error: null });
  const [copied, setCopied] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState<string | null>(null);
  const [generatedForTransactionId, setGeneratedForTransactionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"idle" | "sent" | "error">("idle");

  useEffect(() => {
    if (!transactionId) return;
    getCaseAuditTrail(transactionId)
      .then((nextTrail) => {
        setAuditState({ transactionId, trail: nextTrail, error: null });
      })
      .catch((e) => {
        setAuditState({
          transactionId,
          trail: null,
          error: e instanceof Error ? e.message : "Failed to load case",
        });
      });
  }, [transactionId]);

  const open = !!transactionId;
  const trail = auditState.transactionId === transactionId ? auditState.trail : null;
  const error = auditState.transactionId === transactionId ? auditState.error : null;
  const originStyle = origin ? { transformOrigin: `${origin.x}px ${origin.y}px` } : {};
  const activeGeneratedMessage =
    generatedForTransactionId === transactionId ? generatedMessage : null;

  async function handleGenerate() {
    if (!trail) return;
    setGenerating(true);
    setSendResult("idle");
    try {
      const currentTransactionId = trail.transaction.id as string;
      const { message } = await generateNudgeMessage(currentTransactionId);
      setGeneratedMessage(message);
      setGeneratedForTransactionId(currentTransactionId);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!activeGeneratedMessage || !trail) return;
    setSending(true);
    try {
      const currentTransactionId = trail.transaction.id as string;
      const result = await sendNudge(currentTransactionId, activeGeneratedMessage);
      setSendResult(result.success ? "sent" : "error");
    } catch {
      setSendResult("error");
    } finally {
      setSending(false);
    }
  }

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

                        {trail.decision?.action_type === "nudge" && (
                          <div className="rounded-xl surface-elevated p-4">
                            {!activeGeneratedMessage ? (
                              <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={generating}
                                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                              >
                                {generating ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                                {generating ? "Generating..." : "Generate Message"}
                              </button>
                            ) : (
                              <>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Recovery Message
                                  </p>
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!activeGeneratedMessage) return;
                                        navigator.clipboard.writeText(activeGeneratedMessage);
                                        setCopied(true);
                                        window.setTimeout(() => setCopied(false), 1500);
                                      }}
                                      className="text-[11px] font-medium text-accent-blue hover:text-accent-blue/80 transition-colors flex items-center gap-1"
                                    >
                                      <Copy className="size-3" />
                                      {copied ? "Copied!" : "Copy"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSend}
                                      disabled={sending || sendResult === "sent"}
                                      className={`text-[11px] font-medium transition-colors flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-70 ${
                                        sendResult === "sent"
                                          ? "text-fin-gain"
                                          : sendResult === "error"
                                            ? "text-fin-loss hover:text-fin-loss/80"
                                            : "text-accent-blue hover:text-accent-blue/80"
                                      }`}
                                    >
                                      {sending ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : sendResult === "error" ? (
                                        <RefreshCw className="size-3" />
                                      ) : (
                                        <Mail className="size-3" />
                                      )}
                                      {sending ? "Sending..." : sendResult === "sent" ? "Sent" : sendResult === "error" ? "Retry Send" : "Send Mail"}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-sm text-foreground leading-relaxed">{activeGeneratedMessage}</p>
                                {sendResult === "error" && (
                                  <p className="text-xs text-fin-loss mt-2">Couldn&apos;t send the message. Try again.</p>
                                )}
                              </>
                            )}
                          </div>
                        )}

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