"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SectionPanel, SectionHeader, ChartTooltipContent, C } from "./primitives";
import { Case } from "@/lib/types";

export function RecoveryTrendChart({ cases }: { cases: Case[] }) {
  // Build a cumulative recovered-amount series ordered by when each case last updated.
    const sorted = [...cases].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const data = sorted.reduce<{ index: number; recovered: number }[]>((acc, c) => {
    const prevTotal = acc.length > 0 ? acc[acc.length - 1].recovered : 0;
    acc.push({ index: acc.length + 1, recovered: Math.round(prevTotal + c.amount_recovered) });
    return acc;
  }, []);

  return (
    <SectionPanel className="lg:col-span-2 relative overflow-hidden">
      <SectionHeader title="Recovery Trend" subtitle="Cumulative amount recovered across the batch" />
      <div className="h-56 lg:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="recoveryFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
            <XAxis dataKey="index" tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: C.tick }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone" dataKey="recovered" name="recovered"
              stroke={C.blue} strokeWidth={2} fill="url(#recoveryFill)"
              animationDuration={1400} animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionPanel>
  );
}