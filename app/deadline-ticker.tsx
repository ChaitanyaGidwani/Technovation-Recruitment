"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Registration countdown.
 *
 * The deadline comes from the database (app_deadline), so the club can move it
 * without a redeploy. This is display only — the real cutoff lives in
 * app_register, which refuses new applications once the deadline passes. A
 * wrong clock on someone's phone can change what they SEE, never what they can do.
 *
 * Two variants:
 *   "hero" — the large block on the arcade screen
 *   "bar"  — a slim fixed strip so the reminder stays on screen while scrolling
 *
 * At zero the countdown freezes (never negative) and calls onExpire, which
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

function useCountdown(closesAt: string | null, onExpire?: () => void) {
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
        firedRef.current = true; // once only, though the interval keeps running
        onExpire?.();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closesAt]);

  return msLeft;
}

export default function DeadlineTicker({
  closesAt,
  onExpire,
  variant = "hero",
}: {
  closesAt: string | null;
  onExpire?: () => void;
  variant?: "hero" | "bar";
}) {
  const msLeft = useCountdown(closesAt, onExpire);
  if (!closesAt || msLeft === null) return null;

  const { hh, mm, ss, total } = parts(msLeft);
  const expired = total <= 0;
  // Under an hour it goes red and pulses — that's the window people actually rush.
  const urgent = !expired && total <= 3600;
  const accent = expired || urgent ? "#ff2bd1" : "#ffb800";
  const digits = { fontVariantNumeric: "tabular-nums" as const, letterSpacing: "2px" };

  /* ---------------------------- slim fixed bar --------------------------- */
  if (variant === "bar") {
    return (
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          flexWrap: "wrap",
          // room for the NEED HELP button in the bottom-right corner
          padding: "9px clamp(150px,22vw,230px) 9px 12px",
          background: expired ? "rgba(255,43,209,.16)" : "rgba(255,180,40,.14)",
          borderTop: `2px solid ${accent}`,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <span style={{ fontFamily: PS, fontSize: "clamp(6px,1vw,9px)", color: accent, textShadow: `0 0 8px ${accent}` }}>
          {expired ? "🔒 REGISTRATIONS CLOSED" : "⏳ CLOSES IN"}
        </span>
        {!expired && (
          <span
            style={{
              fontFamily: PS,
              fontSize: "clamp(11px,1.7vw,16px)",
              color: accent,
              textShadow: `0 0 12px ${accent}`,
              animation: urgent ? "blink 1.05s steps(1) infinite" : "none",
              ...digits,
            }}
          >
            {hh}:{mm}:{ss}
          </span>
        )}
      </div>
    );
  }

  /* ------------------------------ hero block ----------------------------- */
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "560px",
        margin: "0 auto",
        textAlign: "center",
        background: expired
          ? "linear-gradient(180deg, rgba(255,43,209,.18), rgba(255,43,209,.06))"
          : "linear-gradient(180deg, rgba(255,180,40,.18), rgba(255,180,40,.05))",
        border: `3px solid ${accent}`,
        borderRadius: "14px",
        padding: "clamp(14px,2.2vw,22px) clamp(12px,2vw,26px)",
        boxShadow: `0 0 34px ${accent}55, inset 0 0 26px ${accent}18`,
        animation: urgent ? "pressstart 1.1s infinite" : "none",
      }}
    >
      <div
        style={{
          fontFamily: PS,
          fontSize: "clamp(9px,1.5vw,14px)",
          color: accent,
          textShadow: `0 0 12px ${accent}`,
          letterSpacing: "2px",
          lineHeight: 1.5,
        }}
      >
        {expired ? "🔒 REGISTRATIONS CLOSED" : "⏳ REGISTRATIONS CLOSE IN"}
      </div>

      {!expired && (
        <div
          style={{
            fontFamily: PS,
            // the headline number — deliberately large
            fontSize: "clamp(26px,6vw,54px)",
            color: accent,
            textShadow: `0 0 18px ${accent}, 0 0 46px ${accent}88`,
            margin: "clamp(8px,1.4vw,14px) 0 clamp(4px,0.8vw,8px)",
            animation: urgent ? "blink 1.05s steps(1) infinite" : "none",
            ...digits,
          }}
        >
          {hh}:{mm}:{ss}
        </div>
      )}

      {!expired && (
        <div style={{ fontFamily: VT, fontSize: "clamp(11px,1.3vw,15px)", color: "#7de8ff", letterSpacing: "1px", marginBottom: "6px" }}>
          HOURS &nbsp;&nbsp;·&nbsp;&nbsp; MINUTES &nbsp;&nbsp;·&nbsp;&nbsp; SECONDS
        </div>
      )}

      <div style={{ fontFamily: VT, fontSize: "clamp(16px,2vw,21px)", color: expired ? "#ff9de3" : "#ffe9b8", lineHeight: 1.35 }}>
        {expired
          ? "Applications are now closed. Already applied? Use Player Login."
          : urgent
          ? "Final hour — apply now, this closes for good."
          : "Once the timer hits zero, no new applications are accepted."}
      </div>
    </div>
  );
}
