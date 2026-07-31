"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Registrations close in HH:MM:SS" banner.
 *
 * The deadline comes from the database (app_deadline), so the club can move it
 * without a redeploy. This is display only — the real cutoff lives in
 * app_register, which refuses new applications once the deadline passes. So a
 * wrong clock on someone's phone can shift what they SEE, never what they can do.
 *
 * At zero the countdown stops (it never goes negative) and calls onExpire, which
 * re-checks with the server and flips the page into its closed state.
 */

const PS = "'Press Start 2P', monospace";
const VT = "'VT323', monospace";

function parts(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return {
    hh: String(Math.floor(s / 3600)).padStart(2, "0"),
    mm: String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    ss: String(s % 60).padStart(2, "0"),
    total: s,
  };
}

export default function DeadlineTicker({
  closesAt,
  onExpire,
}: {
  /** ISO timestamp, or null when no deadline is set. */
  closesAt: string | null;
  onExpire?: () => void;
}) {
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!closesAt) return;
    const target = new Date(closesAt).getTime();
    if (Number.isNaN(target)) return;

    const tick = () => {
      const left = target - Date.now();
      setMsLeft(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;   // only once, even though the timer keeps running
        onExpire?.();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closesAt]);

  if (!closesAt || msLeft === null) return null;

  const { hh, mm, ss, total } = parts(msLeft);
  const expired = total <= 0;
  // Under an hour it turns urgent; that's the window where people actually rush.
  const urgent = !expired && total <= 3600;
  const accent = expired ? "#ff2bd1" : urgent ? "#ff2bd1" : "#ffb800";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "clamp(8px,1.4vw,14px)",
        flexWrap: "wrap",
        justifyContent: "center",
        background: `${accent}14`,
        border: `2px solid ${accent}`,
        borderRadius: "10px",
        padding: "clamp(9px,1.4vw,13px) clamp(12px,2vw,20px)",
        boxShadow: `0 0 22px ${accent}44`,
      }}
    >
      <span
        style={{
          fontFamily: PS,
          fontSize: "clamp(7px,1vw,10px)",
          color: accent,
          textShadow: `0 0 8px ${accent}`,
          letterSpacing: "1px",
        }}
      >
        {expired ? "🔒 REGISTRATIONS CLOSED" : "⏳ REGISTRATIONS CLOSE IN"}
      </span>

      {!expired && (
        <span
          style={{
            fontFamily: PS,
            fontSize: "clamp(12px,2vw,20px)",
            color: accent,
            textShadow: `0 0 12px ${accent}`,
            letterSpacing: "2px",
            // tabular figures stop the width jittering as digits change
            fontVariantNumeric: "tabular-nums",
            animation: urgent ? "blink 1.05s steps(1) infinite" : "none",
          }}
        >
          {hh}:{mm}:{ss}
        </span>
      )}

      <span style={{ fontFamily: VT, fontSize: "clamp(13px,1.6vw,17px)", color: "#a9c3d6" }}>
        {expired ? "Applications are now closed." : "Apply before the timer runs out."}
      </span>
    </div>
  );
}
