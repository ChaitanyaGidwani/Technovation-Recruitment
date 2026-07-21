"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * An arcade joystick whose ball/shaft leans toward the cursor. We track the
 * global mouse position, compute the angle from the joystick's centre, and
 * feed a spring so the lean feels physical rather than snappy.
 */
export default function Joystick({ size = 140 }: { size?: number }) {
  // Normalised cursor offset from screen centre, range roughly [-1, 1].
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);

  const sx = useSpring(nx, { stiffness: 120, damping: 12 });
  const sy = useSpring(ny, { stiffness: 120, damping: 12 });

  // Convert offset into tilt (rotate) and a small parallax shift for the ball.
  const rotateY = useTransform(sx, [-1, 1], [-22, 22]);
  const rotateX = useTransform(sy, [-1, 1], [22, -22]);
  const ballX = useTransform(sx, [-1, 1], [-16, 16]);
  const ballY = useTransform(sy, [-1, 1], [-16, 16]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      nx.set(Math.max(-1, Math.min(1, (e.clientX - cx) / cx)));
      ny.set(Math.max(-1, Math.min(1, (e.clientY - cy) / cy)));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [nx, ny]);

  return (
    <div
      className="relative"
      style={{ width: size, height: size, perspective: 500 }}
      aria-hidden
    >
      {/* Base plate */}
      <div
        className="absolute left-1/2 bottom-0 -translate-x-1/2 rounded-full"
        style={{
          width: size * 0.8,
          height: size * 0.28,
          background:
            "radial-gradient(ellipse at center, #2a1a4a 0%, #120a24 70%)",
          boxShadow: "0 6px 0 rgba(0,0,0,0.5)",
        }}
      />
      {/* Shaft + ball, tilting toward the cursor */}
      <motion.div
        className="absolute left-1/2 bottom-6 origin-bottom"
        style={{
          x: "-50%",
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="mx-auto"
          style={{
            width: 12,
            height: size * 0.5,
            background: "linear-gradient(#c0c0d0, #6a6a80)",
            borderRadius: 6,
          }}
        />
        <motion.div
          className="absolute left-1/2 -top-6 -translate-x-1/2 rounded-full"
          style={{
            x: ballX,
            y: ballY,
            width: 44,
            height: 44,
            background:
              "radial-gradient(circle at 32% 30%, #ff6b9d, #ff2e63 55%, #a3123c)",
            boxShadow: "0 0 18px #ff2e63, inset -4px -6px 8px rgba(0,0,0,0.4)",
          }}
        />
      </motion.div>
    </div>
  );
}
