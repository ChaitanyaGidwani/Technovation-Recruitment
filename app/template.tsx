"use client";

/**
 * Route template — re-mounts on every navigation, giving each page a smooth
 * fade-in transition (Landing ⇄ Process ⇄ Domain Selection).
 * Opacity-only so it never interferes with the floor's sticky/fixed CRT layout.
 */

import { motion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
