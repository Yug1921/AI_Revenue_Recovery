"use client";

import React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export const CARD_SHADOW =
  "rgba(0, 0, 0, 0.35) 0px 0px 0px 1px, rgba(0, 0, 0, 0.32) 0px 8px 18px -6px, rgba(0, 0, 0, 0.24) 0px 22px 40px -14px";

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// Local color constants for Recharts/inline SVG (Tailwind classes don't reach into recharts props)
export const C = {
  blue: "oklch(0.68 0.17 255)",
  gold: "oklch(0.75 0.14 88)",
  gain: "oklch(0.68 0.18 155)",
  loss: "oklch(0.62 0.22 24)",
  purple: "oklch(0.62 0.14 300)",
  teal: "oklch(0.68 0.1 200)",
  slate: "oklch(0.56 0.01 250)",
  grid: "oklch(0.25 0.005 260)",
  tick: "oklch(0.58 0.01 250)",
};

// Root cause -> color, used consistently across the donut, badges, and table
export const CAUSE_COLOR: Record<string, string> = {
  bank_declined: C.loss,
  gateway_timeout: C.blue,
  subscription_failed: C.purple,
  insufficient_funds: C.gold,
  mandate_expired: C.teal,
  user_abandoned: C.slate,
  unknown: "oklch(0.4 0.01 260)",
};

export function GlowOrb({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-3xl pointer-events-none ${className}`} />;
}

export function KpiCard({
  label, value, prefix = "", suffix = "", delay = 0, icon: Icon, tone,
}: {
  label: string; value: string; prefix?: string; suffix?: string; delay?: number;
  icon?: React.ElementType; tone?: "gain" | "loss" | "pending" | "primary" | "neutral";

}) {
  const toneColor = tone === "gain" ? C.gain : tone === "loss" ? C.loss : tone === "pending" ? C.gold : tone === "primary" ? C.blue : undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT }}
      className="relative overflow-hidden rounded-2xl surface-card p-4 lg:p-5 group hover:scale-[1.01] transition-transform duration-300"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.03] pointer-events-none">
        {Icon && <Icon className="size-24 -translate-y-4 translate-x-4" />}
      </div>
      <p className="text-xs font-medium tracking-[0.04em] uppercase text-muted-foreground mb-2.5">{label}</p>
      <p
        className="text-3xl lg:text-4xl font-semibold tracking-[-0.02em] leading-tight font-mono"
        style={{ color: toneColor ?? "var(--foreground)" }}
      >
        {prefix}{value}{suffix}
      </p>
    </motion.div>
  );
}

export function SectionPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: EASE_OUT }}
      className={`rounded-2xl surface-card p-5 lg:p-6 ${className}`}
      style={{ boxShadow: CARD_SHADOW }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl surface-elevated p-3 text-xs backdrop-blur-md" style={{ boxShadow: CARD_SHADOW }}>
      <p className="text-muted-foreground mb-2 font-semibold text-[11px] uppercase tracking-wider">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground capitalize">{entry.name}:</span>
          <span className="font-mono font-bold text-foreground">
            {typeof entry.value === "number" ? entry.value.toLocaleString("en-IN") : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// result -> badge tone, matches backend `actions.result` values exactly
const RESULT_TONE: Record<string, { bg: string; text: string; Icon: React.ElementType }> = {
  success: { bg: "bg-fin-gain/10", text: "text-fin-gain", Icon: ArrowDownRight },
  recovered: { bg: "bg-fin-gain/10", text: "text-fin-gain", Icon: ArrowDownRight },
  pending: { bg: "bg-fin-pending/10", text: "text-fin-pending", Icon: ArrowUpRight },
  failed: { bg: "bg-fin-loss/10", text: "text-fin-loss", Icon: ArrowUpRight },
  escalated: { bg: "bg-fin-loss/10", text: "text-fin-loss", Icon: ArrowUpRight },
};

export function ResultBadge({ result }: { result: string }) {
  const tone = RESULT_TONE[result] ?? { bg: "bg-muted", text: "text-muted-foreground", Icon: ArrowUpRight };
  const Icon = tone.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg ${tone.bg} ${tone.text}`}>
      <Icon className="size-3" />
      {result.toUpperCase()}
    </span>
  );
}