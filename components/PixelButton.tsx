"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface PixelButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  color?: string;
  disabled?: boolean;
  glow?: boolean;
  className?: string;
}

/**
 * A chunky 3D arcade button. It sits on a coloured "base" and depresses
 * when pressed, mimicking a physical cabinet button.
 */
export default function PixelButton({
  children,
  onClick,
  type = "button",
  color = "#39ff14",
  disabled = false,
  glow = true,
  className = "",
}: PixelButtonProps) {
  return (
    <div
      className="inline-block"
      style={{ filter: disabled ? "grayscale(1) opacity(0.5)" : undefined }}
    >
      <motion.button
        type={type}
        onClick={onClick}
        disabled={disabled}
        whileHover={disabled ? {} : { y: -2 }}
        whileTap={disabled ? {} : { y: 4 }}
        className={`relative select-none font-pixel text-[10px] sm:text-xs uppercase tracking-wider text-black px-5 py-3 ${className}`}
        style={{
          background: color,
          borderRadius: 4,
          boxShadow: `0 6px 0 0 rgba(0,0,0,0.55)${
            glow ? `, 0 0 18px ${color}` : ""
          }`,
          textShadow: "0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        {children}
      </motion.button>
    </div>
  );
}
