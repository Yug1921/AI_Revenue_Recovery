"use client";

import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  seeding: "Generating synthetic transactions…",
  diagnosing: "Diagnosing root causes…",
  deciding: "Deciding recovery actions…",
  executing: "Executing recovery actions…",
  done: "Finalizing…",
};

export function BatchLoadingOverlay({ visible, stage }: { visible: boolean; stage: string | null }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/70 backdrop-blur-xl px-10 py-8"
            style={{ boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)" }}
          >
            <Loader2 className="size-8 text-accent-blue animate-spin" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Running batch</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stage ? (STAGE_LABELS[stage] ?? `${stage}…`) : "Starting…"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
