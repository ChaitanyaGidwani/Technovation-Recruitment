"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface CRTFrameProps {
  children: ReactNode;
  className?: string;
  /** Adds the animated scan bar for a livelier screen. */
  animated?: boolean;
}

/**
 * A vintage CRT monitor: dark bezel, curved glass, scanlines, flicker and
 * a moving scan bar. Wrap any screen content in this to get the arcade look.
 */
export default function CRTFrame({
  children,
  className = "",
  animated = true,
}: CRTFrameProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`relative mx-auto w-full ${className}`}
    >
      {/* Monitor bezel */}
      <div
        className="relative rounded-3xl p-4 sm:p-6"
        style={{
          background:
            "linear-gradient(145deg, #1a1030 0%, #0d0820 60%, #060411 100%)",
          boxShadow:
            "0 0 0 4px #2a1a4a, 0 30px 60px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Glass screen */}
        <div
          className="crt-scanlines crt-vignette relative overflow-hidden rounded-2xl animate-flicker"
          style={{
            background:
              "radial-gradient(ellipse at center, #06160c 0%, #030a06 70%, #010402 100%)",
            minHeight: 200,
          }}
        >
          <div className={animated ? "crt-scanbar relative" : "relative"}>
            {children}
          </div>
        </div>

        {/* Bezel label */}
        <div className="pointer-events-none mt-3 flex items-center justify-between px-2">
          <span className="font-pixel text-[8px] text-arcade-neon/70">
            ● PWR
          </span>
          <span className="font-pixel text-[8px] text-white/30">
            ARCADE-OS v8.6
          </span>
        </div>
      </div>
    </motion.div>
  );
}
