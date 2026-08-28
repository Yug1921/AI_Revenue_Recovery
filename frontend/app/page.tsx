"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  DollarSign,
  TrendingUp,
  Percent,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Header, MeshBackground } from "@/components/dashboard/Header";
import { KpiCard, EASE_OUT } from "@/components/dashboard/primitives";
import { RecoveryTrendChart } from "@/components/dashboard/RecoveryTrendChart";
import { RootCauseDonut } from "@/components/dashboard/RootCauseDonut";
import { CasesTable } from "@/components/dashboard/CasesTable";
import { CaseModal, Origin } from "@/components/dashboard/CaseModal";
import { runBatch, getBatchSummary, getBatchCases } from "@/lib/api";
import { BatchSummary, Case } from "@/lib/types";

function formatInr(value: number | null | undefined) {
  return value == null
    ? "—"
    : value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function formatPct(value: number | null | undefined) {
  return value == null ? "—" : (value * 100).toFixed(1);
}

export default function DashboardPage() {
  const [batchIdInput, setBatchIdInput] = useState("");
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<Origin>(null);
  const [failCount, setFailCount] = useState(0);

  const refresh = useCallback(async (batchId: string) => {
    try {
      const [s, c] = await Promise.all([
        getBatchSummary(batchId),
        getBatchCases(batchId),
      ]);
      if (s === null) return null;
      setSummary(s);
      setCases(c);
      setFailCount(0);
      setError(null);

      return s;
    } catch (e) {
      setFailCount((prev) => {
        const next = prev + 1;
        if (next >= 2)
          setError(e instanceof Error ? e.message : "Failed to load batch");
        return next;
      });
      return null;
    }
  }, []);

  // Poll while a batch is still running
  useEffect(() => {
    if (!activeBatchId || summary?.status === "completed") return;
    const interval = setInterval(() => refresh(activeBatchId), 5000);
    return () => clearInterval(interval);
  }, [activeBatchId, summary?.status, refresh]);

  async function handleLoadBatch() {
    if (!batchIdInput.trim()) return;
    setBusy(true);
    await refresh(batchIdInput.trim());
    setActiveBatchId(batchIdInput.trim());
    setBusy(false);
  }

  async function handleRunNewBatch() {
    setBusy(true);
    setError(null);
    try {
      const { batch_id } = await runBatch(60);
      setActiveBatchId(batch_id);
      setBatchIdInput(batch_id);
      await refresh(batch_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start batch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col relative">
      <MeshBackground />
      <Header active="overview" onNavigate={() => {}} />

      <main className="w-full px-5 lg:px-10 xl:px-14 py-6 lg:py-8 flex-1 relative z-10">
        {/* Batch selector row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <input
            value={batchIdInput}
            onChange={(e) => setBatchIdInput(e.target.value)}
            placeholder="Paste a batch_id to load…"
            className="flex-1 min-w-[240px] px-3.5 py-2.5 rounded-xl bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleLoadBatch}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-secondary border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Load
          </button>
          <button
            onClick={handleRunNewBatch}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 glow-teal-sm"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Run new batch
          </button>
          {summary?.status === "running" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-fin-pending animate-pulse-soft" />
              Running…
            </span>
          )}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-fin-loss/10 border border-fin-loss/20 text-fin-loss text-sm">
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {summary && (
            <motion.div
              key={activeBatchId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="flex flex-col gap-5"
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <KpiCard
                  label="Total at risk"
                  value={formatInr(summary.total_at_risk)}
                  prefix="₹"
                  tone="loss"
                  icon={AlertTriangle}
                  delay={0}
                />
                <KpiCard
                  label="Total recovered"
                  value={formatInr(summary.total_recovered)}
                  prefix="₹"
                  tone="gain"
                  icon={DollarSign}
                  delay={0.06}
                />
                <KpiCard
                  label="Recovery rate"
                  value={formatPct(summary.recovery_rate)}
                  suffix="%"
                  tone="primary"
                  icon={Percent}
                  delay={0.12}
                />
                <KpiCard
                  label="Exceptions"
                  value={
                    summary.exceptions_count == null
                      ? "—"
                      : String(summary.exceptions_count)
                  }
                  tone="pending"
                  icon={TrendingUp}
                  delay={0.18}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <RecoveryTrendChart cases={cases} />
                <RootCauseDonut cases={cases} />
              </div>

              <CasesTable
                cases={cases}
                onSelect={(id, origin) => {
                  setSelectedCase(id);
                  setSelectedOrigin(origin);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!summary && !error && (
          <div className="text-center text-muted-foreground text-sm py-24">
            Load an existing batch_id or run a new batch to get started.
          </div>
        )}
      </main>
      <CaseModal
        transactionId={selectedCase}
        origin={selectedOrigin}
        onClose={() => setSelectedCase(null)}
      />
    </div>
  );
}
