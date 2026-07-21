"use client";

/**
 * /process — "The Recruitment Quest" briefing.
 * Intermediate route between the arcade floor (landing) and domain selection.
 * Cinematic arcade/quest motif: neon timeline, glassmorphic round cards with
 * hover-tilt, staggered reveals — all Framer Motion.
 */

import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { type CSSProperties, type ReactNode, useRef } from "react";

// Palette shared with the rest of the arcade (floor / create / pass / HQ).
const CYAN = "#00f0ff";
const MAGENTA = "#ff2bd1";
const YELLOW = "#ffe600";
const GREEN = "#39ff14";
const PS = "'Press Start 2P'";
const VT = "'VT323'";

const STATS = [
  { label: "FEE", value: "100% FREE", color: GREEN },
  { label: "DOMAINS", value: "6 GUILDS", color: CYAN },
  { label: "STAGES", value: "3 BOSS LEVELS", color: MAGENTA },
];

const TIMELINE = [
  { phase: "PHASE 1", title: "REGISTRATION WINDOW", when: "24 JUL – 31 JUL 2026 · 5:00 PM", glyph: "▶", color: CYAN },
  { phase: "PHASE 2", title: "DOMAIN TASK CHALLENGE", when: "1 AUG – 4 AUG 2026", glyph: "⚔", color: MAGENTA },
  { phase: "PHASE 3", title: "EVALUATION PHASE", when: "5 AUG – 6 AUG 2026", glyph: "◉", color: YELLOW },
  { phase: "PHASE 4", title: "INTERVIEW BOSS ROUND", when: "7 AUG – 9 AUG 2026", glyph: "☎", color: GREEN },
  { phase: "PHASE 5", title: "FINAL GUILD ROSTER DROP", when: "11 / 12 AUGUST 2026", glyph: "★", color: CYAN },
];

const ROUNDS = [
  {
    level: "LEVEL 1",
    title: "CHARACTER SCREENING",
    glyph: "🜂",
    color: CYAN,
    desc: "Personality & Mindset Check. Showcase your passion, drive, and compatibility with the TECHNOVATION culture.",
  },
  {
    level: "LEVEL 2",
    title: "DOMAIN-SPECIFIC TASK",
    glyph: "⚙",
    color: MAGENTA,
    desc: "Hands-on Challenge. Shortlisted candidates receive a practical task via official college email to prove domain skills.",
  },
  {
    level: "LEVEL 3",
    title: "ONLINE INTERVIEW",
    glyph: "☠",
    color: YELLOW,
    desc: "The Final Boss Round. A 1-on-1 discussion evaluating communication, problem-solving, and vision.",
  },
];

const STEPS = [
  { n: "01", icon: "📝", text: "Submit Registration & Quest Form", color: CYAN },
  { n: "02", icon: "📩", text: "Get Shortlisted & Receive Domain Task via Email", color: MAGENTA },
  { n: "03", icon: "⏱", text: "Complete & Submit Task Before Deadline", color: YELLOW },
  { n: "04", icon: "🏆", text: "Clear Interview & Join TECHNOVATION Batch 2026–27", color: GREEN },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function SectionTitle({ children, color }: { children: ReactNode; color: string }) {
  return (
    <motion.h2
      variants={item}
      style={{
        fontFamily: PS,
        fontSize: "clamp(13px,2.2vw,22px)",
        color,
        textShadow: `0 0 10px ${color}`,
        letterSpacing: "1px",
        textAlign: "center",
        marginBottom: "clamp(24px,4vw,44px)",
      }}
    >
      {children}
    </motion.h2>
  );
}

// glassmorphic card with pointer-driven 3D tilt
function TiltCard({
  children,
  glow,
  style,
}: {
  children: ReactNode;
  glow: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [10, -10]), { stiffness: 150, damping: 15 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), { stiffness: 150, damping: 15 });

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      variants={item}
      onPointerMove={onMove}
      onPointerLeave={reset}
      whileHover={{ scale: 1.03 }}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformStyle: "preserve-3d",
        transformPerspective: 900,
        background: "linear-gradient(160deg, rgba(255,255,255,.06), rgba(10,14,26,.5))",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `2px solid ${glow}55`,
        borderRadius: "16px",
        boxShadow: `0 0 24px ${glow}22, inset 0 0 22px rgba(255,255,255,.03)`,
        padding: "clamp(20px,2.6vw,30px)",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

function GlowButton({
  children,
  onClick,
  color = MAGENTA,
}: {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.06, boxShadow: `0 0 34px ${color}, 0 8px 0 rgba(0,0,0,.4)` }}
      whileTap={{ scale: 0.95, y: 4 }}
      animate={{ boxShadow: [`0 0 16px ${color}88`, `0 0 30px ${color}`, `0 0 16px ${color}88`] }}
      transition={{ boxShadow: { repeat: Infinity, duration: 1.8 } }}
      style={{
        cursor: "pointer",
        fontFamily: PS,
        fontSize: "clamp(11px,1.5vw,16px)",
        color: "#04040a",
        background: `linear-gradient(135deg, #fff, ${color} 55%, ${color})`,
        border: "none",
        borderRadius: "10px",
        padding: "clamp(16px,2.2vw,22px) clamp(28px,4vw,46px)",
        letterSpacing: "1px",
        textShadow: "0 1px 0 rgba(255,255,255,.4)",
      }}
    >
      {children}
    </motion.button>
  );
}

// Same fixed scanline overlay the other pages use.
const scanlineOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 60,
  opacity: 0.28,
  background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.5) 2px 4px)",
};

export default function ProcessPage() {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: "100vh",
        // Matches the create / HQ screen backdrop for a single continuous theme.
        background:
          "radial-gradient(140% 90% at 50% -10%, #141a30 0%, #0a0d1a 55%, #05060d 100%)",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* soft top glow + faint steel grid, tuned to blend with the arcade floor */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(60% 45% at 50% 12%, rgba(0,240,255,.10), transparent 70%), radial-gradient(50% 40% at 50% 90%, rgba(255,43,209,.06), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage:
            "linear-gradient(rgba(28,37,64,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(28,37,64,.35) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(80% 60% at 50% 20%, #000, transparent 90%)",
          WebkitMaskImage: "radial-gradient(80% 60% at 50% 20%, #000, transparent 90%)",
        }}
      />
      <div style={scanlineOverlay} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "clamp(20px,4vw,40px) clamp(16px,4vw,40px) 90px",
        }}
      >
        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push("/")}
          whileTap={{ y: 2 }}
          style={{
            cursor: "pointer",
            fontFamily: PS,
            fontSize: "9px",
            color: "#7de8ff",
            background: "transparent",
            border: "2px solid #1c3a4a",
            borderRadius: "6px",
            padding: "9px 12px",
          }}
        >
          ◄ ARCADE FLOOR
        </motion.button>

        {/* ===== HERO ===== */}
        <motion.section
          variants={container}
          initial="hidden"
          animate="show"
          style={{ textAlign: "center", marginTop: "clamp(30px,6vw,64px)" }}
        >
          <motion.div
            variants={item}
            style={{
              fontFamily: PS,
              fontSize: "clamp(8px,1.2vw,12px)",
              color: MAGENTA,
              letterSpacing: "3px",
              textShadow: `0 0 10px ${MAGENTA}`,
              marginBottom: "16px",
            }}
          >
            ◆ INSERT COIN · MISSION BRIEFING ◆
          </motion.div>
          <motion.h1
            variants={item}
            style={{
              fontFamily: PS,
              fontSize: "clamp(18px,4vw,44px)",
              color: CYAN,
              lineHeight: 1.35,
              textShadow: `3px 0 ${MAGENTA}, -3px 0 ${YELLOW}, 0 0 28px rgba(0,243,255,.55)`,
              letterSpacing: "1px",
            }}
          >
            TECHNOVATION 2026–27
            <br />
            <span style={{ fontSize: "clamp(12px,2.4vw,26px)" }}>// THE RECRUITMENT QUEST</span>
          </motion.h1>
          <motion.p
            variants={item}
            style={{
              fontFamily: VT,
              fontSize: "clamp(18px,2.4vw,28px)",
              color: "#7de8ff",
              marginTop: "18px",
            }}
          >
            The Networking Club of ABES Engineering College
          </motion.p>

          {/* stats badge grid */}
          <motion.div
            variants={container}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "clamp(12px,2vw,20px)",
              marginTop: "clamp(28px,4vw,44px)",
            }}
          >
            {STATS.map((s) => (
              <motion.div
                key={s.label}
                variants={item}
                animate={{ y: [0, -6, 0] }}
                transition={{ y: { repeat: Infinity, duration: 3, ease: "easeInOut" } }}
                style={{
                  background: "rgba(255,255,255,.04)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: `2px solid ${s.color}`,
                  borderRadius: "12px",
                  padding: "clamp(14px,2vw,20px)",
                  boxShadow: `0 0 22px ${s.color}33`,
                }}
              >
                <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", letterSpacing: "1px" }}>{s.label}</div>
                <div style={{ fontFamily: PS, fontSize: "clamp(11px,1.6vw,16px)", color: s.color, marginTop: "10px", textShadow: `0 0 10px ${s.color}` }}>{s.value}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ===== TIMELINE ===== */}
        <motion.section
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          style={{ marginTop: "clamp(56px,9vw,110px)" }}
        >
          <SectionTitle color={CYAN}>▮ THE ROADMAP</SectionTitle>
          <div style={{ position: "relative", paddingLeft: "clamp(28px,5vw,40px)" }}>
            {/* vertical neon rail */}
            <div
              style={{
                position: "absolute",
                left: "clamp(11px,2vw,17px)",
                top: 6,
                bottom: 6,
                width: "3px",
                background: `linear-gradient(${CYAN}, ${MAGENTA})`,
                boxShadow: `0 0 12px ${CYAN}`,
                borderRadius: "3px",
              }}
            />
            {TIMELINE.map((t, i) => (
              <motion.div
                key={t.phase}
                variants={item}
                style={{ position: "relative", marginBottom: i === TIMELINE.length - 1 ? 0 : "clamp(18px,2.6vw,26px)" }}
              >
                {/* pulsing node */}
                <motion.div
                  animate={{ boxShadow: [`0 0 6px ${t.color}`, `0 0 20px ${t.color}`, `0 0 6px ${t.color}`] }}
                  transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.2 }}
                  style={{
                    position: "absolute",
                    left: "calc(-1 * clamp(28px,5vw,40px) + clamp(2px,0.6vw,6px))",
                    top: "clamp(14px,2vw,20px)",
                    width: "clamp(20px,3vw,26px)",
                    height: "clamp(20px,3vw,26px)",
                    borderRadius: "50%",
                    background: "#04040a",
                    border: `3px solid ${t.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: PS,
                    fontSize: "9px",
                    color: t.color,
                    zIndex: 2,
                  }}
                >
                  {t.glyph}
                </motion.div>
                <div
                  style={{
                    background: "linear-gradient(160deg, rgba(255,255,255,.05), rgba(10,14,26,.55))",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: `2px solid ${t.color}44`,
                    borderRadius: "12px",
                    padding: "clamp(14px,2vw,20px)",
                    boxShadow: `0 0 18px ${t.color}18`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: PS, fontSize: "clamp(9px,1.2vw,13px)", color: t.color, textShadow: `0 0 8px ${t.color}` }}>{t.title}</div>
                    <div style={{ fontFamily: PS, fontSize: "7px", color: "#7de8ff", border: `1px solid ${t.color}55`, borderRadius: "4px", padding: "4px 7px" }}>{t.phase}</div>
                  </div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#a9c3d6", marginTop: "8px" }}>{t.when}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ===== SELECTION ROUNDS ===== */}
        <motion.section
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          style={{ marginTop: "clamp(56px,9vw,110px)" }}
        >
          <SectionTitle color={MAGENTA}>⚔ THE STAGE BREAKDOWN</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "clamp(16px,2.4vw,26px)",
            }}
          >
            {ROUNDS.map((r) => (
              <TiltCard key={r.level} glow={r.color}>
                <div style={{ transform: "translateZ(30px)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff", letterSpacing: "1px" }}>{r.level}</div>
                    <div style={{ fontSize: "clamp(26px,4vw,38px)", filter: `drop-shadow(0 0 10px ${r.color})` }}>{r.glyph}</div>
                  </div>
                  <div style={{ fontFamily: PS, fontSize: "clamp(10px,1.4vw,14px)", color: r.color, marginTop: "14px", textShadow: `0 0 10px ${r.color}`, lineHeight: 1.5 }}>{r.title}</div>
                  <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#a9c3d6", marginTop: "12px", lineHeight: 1.3 }}>{r.desc}</div>
                </div>
              </TiltCard>
            ))}
          </div>
        </motion.section>

        {/* ===== HOW IT WORKS ===== */}
        <motion.section
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          style={{ marginTop: "clamp(56px,9vw,110px)" }}
        >
          <SectionTitle color={YELLOW}>▸ HOW THE QUEST WORKS</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "clamp(14px,2vw,22px)",
            }}
          >
            {STEPS.map((s) => (
              <motion.div
                key={s.n}
                variants={item}
                whileHover={{ y: -6 }}
                style={{
                  position: "relative",
                  background: "rgba(255,255,255,.03)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: `2px solid ${s.color}44`,
                  borderRadius: "14px",
                  padding: "clamp(18px,2.4vw,26px)",
                  boxShadow: `0 0 18px ${s.color}18`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: PS, fontSize: "clamp(16px,2.4vw,24px)", color: s.color, textShadow: `0 0 12px ${s.color}` }}>{s.n}</div>
                <div style={{ fontSize: "clamp(30px,5vw,44px)", margin: "12px 0" }}>{s.icon}</div>
                <div style={{ fontFamily: VT, fontSize: "clamp(15px,1.8vw,20px)", color: "#cfe8ff", lineHeight: 1.25 }}>{s.text}</div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ===== CTA ===== */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: "center", marginTop: "clamp(56px,9vw,110px)" }}
        >
          <div style={{ fontFamily: VT, fontSize: "clamp(18px,2.4vw,26px)", color: "#7de8ff", marginBottom: "22px" }}>
            &gt; READY, PLAYER ONE? YOUR GUILD AWAITS.
          </div>
          <GlowButton color={MAGENTA} onClick={() => router.push("/?step=create")}>
            SELECT YOUR DOMAIN →
          </GlowButton>
        </motion.section>
      </div>
    </div>
  );
}
