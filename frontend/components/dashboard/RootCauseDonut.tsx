"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { SectionPanel, SectionHeader, ChartTooltipContent, CAUSE_COLOR } from "./primitives";
import { Case } from "@/lib/types";

function formatCause(cause: string) {
  return cause.replace(/_/g, " ");
}

export function RootCauseDonut({ cases }: { cases: Case[] }) {
  const counts: Record<string, number> = {};
  for (const c of cases) {
    const key = c.root_cause ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const data = Object.entries(counts).map(([name, value]) => ({
    name, value, color: CAUSE_COLOR[name] ?? CAUSE_COLOR.unknown,
  }));

  return (
    <SectionPanel>
      <SectionHeader title="Root Cause Breakdown" subtitle="Why each case failed" />
      <div className="h-48 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%" innerRadius="58%" outerRadius="82%"
              paddingAngle={4} dataKey="value" stroke="none"
              animationDuration={1200} animationEasing="ease-out"
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2.5 mt-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground capitalize">{formatCause(item.name)}</span>
            </div>
            <span className="font-mono font-bold text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </SectionPanel>
  );
}