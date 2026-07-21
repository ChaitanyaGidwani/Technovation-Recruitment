"use client";

import { motion } from "framer-motion";
import type { DOMAINS } from "@/lib/types";

type Domain = (typeof DOMAINS)[number];

interface DomainCabinetProps {
  domain: Domain;
  selected?: boolean;
  onSelect?: (id: string) => void;
  index?: number;
}

/**
 * A pixel-art arcade cabinet representing one recruitment domain.
 * Hovering lifts it; selecting lights up the marquee.
 */
export default function DomainCabinet({
  domain,
  selected = false,
  onSelect,
  index = 0,
}: DomainCabinetProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(domain.id)}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group relative flex w-full flex-col items-center rounded-lg p-1 text-left"
      style={{
        background: "linear-gradient(#160b2e, #0c0620)",
        border: `3px solid ${selected ? domain.color : "#2a1a4a"}`,
        boxShadow: selected
          ? `0 0 22px ${domain.color}, inset 0 0 12px ${domain.color}55`
          : "0 8px 0 rgba(0,0,0,0.4)",
      }}
    >
      {/* Marquee */}
      <div
        className="w-full rounded-t px-2 py-2 text-center"
        style={{
          background: selected ? domain.color : `${domain.color}22`,
          transition: "background 0.2s",
        }}
      >
        <span
          className="font-pixel text-[8px] uppercase leading-tight"
          style={{ color: selected ? "#000" : domain.color }}
        >
          {domain.name}
        </span>
      </div>

      {/* Screen */}
      <div
        className="crt-scanlines relative my-2 flex aspect-[4/3] w-[92%] flex-col items-center justify-center overflow-hidden rounded"
        style={{ background: "#05130a" }}
      >
        <span
          className="text-4xl"
          style={{ filter: `drop-shadow(0 0 8px ${domain.color})` }}
        >
          {domain.icon}
        </span>
        <span
          className="mt-2 font-pixel text-[7px] uppercase"
          style={{ color: domain.color }}
        >
          {domain.codename}
        </span>
      </div>

      {/* Blurb + control deck */}
      <p className="font-term w-[92%] px-1 pb-2 text-center text-lg leading-none text-white/70">
        {domain.blurb}
      </p>
      <div className="mb-2 flex gap-2">
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: domain.color, boxShadow: `0 0 6px ${domain.color}` }}
        />
        <span className="h-3 w-3 rounded-full bg-white/20" />
        <span className="h-3 w-3 rounded-full bg-white/20" />
      </div>

      {selected && (
        <div
          className="absolute -top-2 right-2 rotate-6 rounded px-1 font-pixel text-[7px] text-black"
          style={{ background: domain.color }}
        >
          PICKED
        </div>
      )}
    </motion.button>
  );
}
