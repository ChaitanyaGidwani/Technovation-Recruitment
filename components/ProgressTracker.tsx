"use client";

import { motion } from "framer-motion";
import { STAGES, type Stage } from "@/lib/types";

/**
 * 8-bit horizontal stage tracker. The current stage pulses; cleared stages
 * glow neon; upcoming stages are dim.
 */
export default function ProgressTracker({ stage }: { stage: Stage }) {
  const currentIndex = STAGES.indexOf(stage);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-1">
        {STAGES.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const color = done || active ? "#39ff14" : "#2a1a4a";
          return (
            <div key={s} className="flex flex-1 items-center">
              <div className="flex flex-1 flex-col items-center">
                <motion.div
                  animate={
                    active
                      ? { boxShadow: ["0 0 4px #39ff14", "0 0 18px #39ff14", "0 0 4px #39ff14"] }
                      : {}
                  }
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="flex h-9 w-9 items-center justify-center rounded"
                  style={{
                    background: done || active ? "#39ff14" : "#160b2e",
                    border: `2px solid ${color}`,
                    color: done || active ? "#000" : "#5a4a7a",
                  }}
                >
                  <span className="font-pixel text-[9px]">
                    {done ? "✓" : i + 1}
                  </span>
                </motion.div>
                <span
                  className="mt-1 text-center font-pixel text-[6px] uppercase leading-tight"
                  style={{ color: done || active ? "#39ff14" : "#5a4a7a" }}
                >
                  {s}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="mb-4 h-1 flex-1"
                  style={{ background: i < currentIndex ? "#39ff14" : "#2a1a4a" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
