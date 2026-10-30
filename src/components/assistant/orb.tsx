"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Orbul animat al asistentului (gradient conic care se rotește + „respirație”). */
export function AssistantOrb({ size = 32, active, className }: { size?: number; active?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: "conic-gradient(from 0deg, var(--primary), var(--accent), #ec4899, var(--primary))" }}
        animate={{ rotate: 360 }}
        transition={{ duration: active ? 2.2 : 8, repeat: Infinity, ease: "linear" }}
      />
      <motion.span
        className="absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.9),transparent_45%),linear-gradient(135deg,var(--primary),var(--accent))]"
        animate={active ? { scale: [1, 0.9, 1] } : { scale: [1, 0.96, 1] }}
        transition={{ duration: active ? 1.1 : 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 24 24" className="relative size-[45%] text-white drop-shadow" fill="currentColor">
        <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" />
        <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" opacity=".8" />
      </svg>
    </span>
  );
}
