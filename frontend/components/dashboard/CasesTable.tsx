"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import {
  SectionPanel,
  SectionHeader,
  ResultBadge,
  CAUSE_COLOR,
} from "./primitives";
import { Case } from "@/lib/types";

function formatCause(cause: string | null) {
  return cause ? cause.replace(/_/g, " ") : "—";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CasesTable({
  cases,
  onSelect,
  highlightedCaseId,
}: {
  cases: Case[];
  onSelect: (id: string, origin: { x: number; y: number }) => void;
  highlightedCaseId?: string | null;
}) {
  useEffect(() => {
    if (!highlightedCaseId) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`case-row-${highlightedCaseId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);

    return () => clearTimeout(timer);
  }, [highlightedCaseId]);

  return (
    <SectionPanel className="!p-0 overflow-hidden">
      <div className="p-5 lg:p-6 border-b border-border/50">
        <SectionHeader
          title="Cases"
          subtitle={`${cases.length} transactions in this batch`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                #
              </th>
              <th className="text-left p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                Type
              </th>
              <th className="text-right p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                Amount
              </th>
              <th className="text-left p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] hidden md:table-cell">
                Root Cause
              </th>
              <th className="text-left p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] hidden sm:table-cell">
                Action
              </th>
              <th className="text-left p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                Result
              </th>
              <th className="text-right p-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em] hidden lg:table-cell">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c, i) => (
              <motion.tr
                key={c.transaction_id}
                id={`case-row-${c.transaction_id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.6) }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSelect(c.transaction_id, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  });
                }}
                className={`border-b border-border/30 hover:bg-accent/20 transition-all duration-200 cursor-pointer ${
                  c.transaction_id === highlightedCaseId ? "bg-accent-blue/10" : ""
                }`}
              >
                <td className="p-4 text-xs text-muted-foreground">{i + 1}</td>
                <td className="p-4 text-xs text-muted-foreground capitalize">
                  {c.type.replace(/_/g, " ")}
                </td>
                <td className="p-4 text-right font-mono font-bold text-foreground">
                  ₹
                  {c.amount.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground capitalize">
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: CAUSE_COLOR[c.root_cause ?? "unknown"],
                      }}
                    />
                    {formatCause(c.root_cause)}
                  </span>
                </td>
                <td className="p-4 hidden sm:table-cell text-xs text-muted-foreground capitalize">
                  {c.action_type?.replace(/_/g, " ") ?? "—"}
                </td>
                <td className="p-4">
                  {c.result ? (
                    <ResultBadge result={c.result} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      in progress
                    </span>
                  )}
                </td>
                <td className="p-4 text-right text-xs text-muted-foreground hidden lg:table-cell font-mono">
                  {formatTime(c.updated_at)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}
