"use client";

import { useEffect, useState } from "react";

/**
 * Task Round countdown — a ticking arcade clock plus the time remaining.
 *
 * The clock face shows India Standard Time rather than the visitor's local
 * time, so what an applicant sees always matches the deadline they were given.
 */

const PS = "'Press Start 2P', monospace";
const VT = "'VT323', monospace";

/**
 * Single source of truth for the deadline.
 *
 * The explicit +05:30 matters. Parsing "5 Aug 2026 23:59" without an offset
 * makes the browser read it in the visitor's own timezone, so the same page
 * would show a different deadline depending on where it was opened.
 */
export const TASK_DEADLINE_ISO = "2026-08-07T18:00:00+05:30";
export const TASK_DEADLINE = "7 AUGUST, 6:00 PM";

/** The ring drains across the final week; before that it simply sits full. */
const RING_WINDOW_MS = 7 * 24 * 3600 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

type Props = {
  /**
   * "large" is the arcade-floor variant. It sits inside the CRT boot screen,
   * which is a fixed-height stage with the title above it and the scroll hint
   * pinned at the bottom — so it is deliberately WIDE AND SHORT rather than
   * simply scaled up. An earlier version used a 168px clock and 44px digits
   * and pushed the screen title out of frame.
   */
  size?: "normal" | "large";
  /** Inside the Task Round panel the surrounding copy already gives context. */
  heading?: string;
};

export default function TaskCountdown({ size = "normal", heading }: Props) {
  const big = size === "large";

  // Null until mounted. The server has no clock, so rendering a time during
  // SSR would guarantee a hydration mismatch the moment the page arrives.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(TASK_DEADLINE_ISO).getTime();
  const left = now === null ? 0 : target - now;
  const expired = now !== null && left <= 0;

  const secsLeft = Math.max(0, Math.floor(left / 1000));
  const days = Math.floor(secsLeft / 86400);
  const hrs = Math.floor((secsLeft % 86400) / 3600);
  const mins = Math.floor((secsLeft % 3600) / 60);
  const secs = secsLeft % 60;

  // Inside the last six hours the panel turns pink to read as urgent.
  const urgent = !expired && left <= 6 * 3600 * 1000;
  const accent = expired ? "#ff4d6d" : urgent ? "#ff2bd1" : "#ffb800";

  // Hands are drawn from IST, derived from the epoch so it holds regardless of
  // where the browser thinks it is.
  let hh = 0;
  let mm = 0;
  let ss = 0;
  if (now !== null) {
    const d = new Date(now);
    const ist = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    hh = ist.getHours() % 12;
    mm = ist.getMinutes();
    ss = ist.getSeconds();
  }

  const R = 44;
  const circumference = 2 * Math.PI * R;
  const ringLeft = Math.max(0, Math.min(1, left / RING_WINDOW_MS));

  const cell = (value: number, label: string) => (
    <div style={{ textAlign: "center", minWidth: big ? "clamp(40px,5.4vw,58px)" : "clamp(46px,7vw,64px)" }}>
      <div
        style={{
          fontFamily: PS,
          fontSize: big ? "clamp(15px,2.5vw,24px)" : "clamp(14px,2.6vw,22px)",
          color: accent,
          textShadow: `0 0 12px ${accent}`,
          background: "rgba(0,0,0,.35)",
          border: "2px solid " + accent,
          borderRadius: "7px",
          padding: big ? "8px 4px" : "9px 4px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pad(value)}
      </div>
      <div
        style={{
          fontFamily: PS,
          fontSize: big ? "clamp(6px,.9vw,9px)" : "clamp(6px,.85vw,8px)",
          color: "#a9c3d6",
          marginTop: big ? "5px" : "6px",
          letterSpacing: "1px",
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div
      style={{
        padding: big ? "clamp(10px,1.5vw,15px) clamp(12px,1.8vw,18px)" : "13px",
        background: expired ? "rgba(255,77,109,.1)" : "rgba(0,0,0,.28)",
        border: "2px solid " + accent,
        borderRadius: "10px",
        boxShadow: `0 0 22px ${accent}33`,
      }}
    >
      <div
        style={{
          fontFamily: PS,
          fontSize: big ? "clamp(8px,1.2vw,12px)" : "clamp(8px,1.1vw,11px)",
          color: accent,
          textShadow: `0 0 10px ${accent}`,
          textAlign: "center",
          lineHeight: 1.5,
          letterSpacing: big ? "1px" : undefined,
        }}
      >
        {expired ? "⏰ DEADLINE PASSED" : heading || "⏰ TIME LEFT TO SUBMIT"}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: big ? "clamp(10px,1.6vw,16px)" : "clamp(12px,2.5vw,22px)",
          flexWrap: "wrap",
          marginTop: big ? "8px" : "12px",
        }}
      >
        <svg
          width={big ? 74 : 104}
          height={big ? 74 : 104}
          viewBox="0 0 100 100"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="50" cy="50" r={R} fill="rgba(0,0,0,.45)" stroke="#1c3a4a" strokeWidth="3" />
          {/* Drains as the deadline approaches. */}
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ringLeft)}
            transform="rotate(-90 50 50)"
            opacity={0.85}
          />
          {Array.from({ length: 12 }).map((_, i) => (
            <rect
              key={i}
              x="49.2"
              y="11"
              width="1.6"
              height={i % 3 === 0 ? 7 : 4}
              fill={i % 3 === 0 ? accent : "#4a5a7a"}
              transform={`rotate(${i * 30} 50 50)`}
            />
          ))}
          {now !== null && (
            <>
              <line x1="50" y1="50" x2="50" y2="28" stroke="#7de8ff" strokeWidth="4" strokeLinecap="round"
                    transform={`rotate(${hh * 30 + mm * 0.5} 50 50)`} />
              <line x1="50" y1="50" x2="50" y2="20" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"
                    transform={`rotate(${mm * 6 + ss * 0.1} 50 50)`} />
              <line x1="50" y1="56" x2="50" y2="16" stroke={accent} strokeWidth="1.4" strokeLinecap="round"
                    transform={`rotate(${ss * 6} 50 50)`} />
            </>
          )}
          <circle cx="50" cy="50" r="3" fill={accent} />
        </svg>

        {expired ? (
          <div
            style={{
              fontFamily: VT,
              fontSize: big ? "clamp(17px,2.3vw,24px)" : "clamp(17px,2.2vw,23px)",
              color: "#ffd9e0",
              maxWidth: "300px",
              lineHeight: 1.4,
            }}
          >
            The submission window has closed. Late submissions will not be accepted.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: big ? "clamp(5px,.9vw,9px)" : "clamp(6px,1.2vw,10px)",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {cell(days, "DAYS")}
            {cell(hrs, "HRS")}
            {cell(mins, "MIN")}
            {cell(secs, "SEC")}
          </div>
        )}
      </div>

      <div
        style={{
          fontFamily: VT,
          fontSize: big ? "clamp(13px,1.5vw,17px)" : "clamp(14px,1.7vw,19px)",
          color: "#ffe9b8",
          marginTop: big ? "8px" : "11px",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        Deadline —{" "}
        <span style={{ fontFamily: PS, fontSize: big ? "clamp(8px,1.2vw,12px)" : "clamp(8px,1vw,10px)", color: accent }}>
          {TASK_DEADLINE}
        </span>{" "}
        (IST)
      </div>
    </div>
  );
}
