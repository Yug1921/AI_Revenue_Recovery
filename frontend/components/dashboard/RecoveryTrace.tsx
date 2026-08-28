"use client";

import { motion } from "motion/react";
import { C } from "./primitives";

type StageStatus = "done" | "active" | "pending";
export type TraceStage = { label: string; status: StageStatus };

export function RecoveryTrace({ stages }: { stages: TraceStage[] }) {
  const width = 640;
  const height = 90;
  const padding = 28; // keeps node circles + labels fully inside the viewBox
  const usableWidth = width - padding * 2;
  const spacing = usableWidth / (stages.length - 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      style={{ "--trace-length": usableWidth } as React.CSSProperties}
    >
      <defs>
        <linearGradient id="traceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={C.gold} />
          <stop offset="100%" stopColor={C.blue} />
        </linearGradient>
      </defs>
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--border)" strokeWidth={2} />
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="url(#traceGradient)" strokeWidth={2} className="trace-path" />
      {stages.map((stage, i) => {
        const cx = padding + i * spacing;
        const color = stage.status === "done" ? C.gold : stage.status === "active" ? C.blue : "var(--text-faint)";
        return (
          <g key={stage.label}>
            <motion.circle
              cx={cx} cy={height / 2} r={8}
              fill={stage.status === "pending" ? "var(--card)" : color}
              stroke={color} strokeWidth={2}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 400, damping: 20 }}
            />
            <text x={cx} y={height / 2 + 28} textAnchor="middle" className="fill-muted-foreground text-[13px]">
              {stage.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}