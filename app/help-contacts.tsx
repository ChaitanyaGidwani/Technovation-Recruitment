"use client";

import { useState } from "react";

/**
 * Floating "Need help?" button, fixed to the bottom-right of every screen.
 *
 * Deliberately fixed rather than a footer: an applicant stuck mid-form
 * shouldn't have to scroll to the bottom of the page to find who to contact.
 * Collapsed it's a small pill; tapping it opens the two coordinators.
 *
 * The number is shown as plain text and WhatsApp is the one-tap action — no
 * click-to-call, so nobody dials by accident.
 */

const PS = "'Press Start 2P', monospace";
const VT = "'VT323', monospace";

const CONTACTS = [
  { name: "Chaitanya", display: "94542 43781", wa: "919454243781" },
  { name: "Lavi", display: "99272 26271", wa: "919927226271" },
];

export default function HelpContacts() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        right: "clamp(10px,2vw,20px)",
        bottom: "clamp(10px,2vw,20px)",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "8px",
      }}
    >
      {open && (
        <div
          style={{
            width: "min(90vw, 290px)",
            background: "rgba(10,14,26,.97)",
            border: "2px solid #ffb800",
            borderRadius: "12px",
            padding: "14px",
            boxShadow: "0 0 30px rgba(255,180,40,.28), 0 12px 30px rgba(0,0,0,.6)",
          }}
        >
          <div style={{ fontFamily: PS, fontSize: "9px", color: "#ffb800", textShadow: "0 0 8px #ffb800", letterSpacing: "1px" }}>
            NEED HELP?
          </div>
          <div style={{ fontFamily: VT, fontSize: "16px", color: "#a9c3d6", marginTop: "6px", marginBottom: "12px", lineHeight: 1.35 }}>
            Stuck with registration, your PIN or a task? Reach out to us.
          </div>

          {CONTACTS.map((c) => (
            <div
              key={c.name}
              style={{
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,180,40,.28)",
                borderRadius: "9px",
                padding: "10px 11px",
                marginBottom: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ fontFamily: PS, fontSize: "9px", color: "#00f0ff", textShadow: "0 0 6px #00f0ff" }}>
                  {c.name.toUpperCase()}
                </div>
                {/* Plain text, deliberately not a tel: link — selectable and
                    copyable, but it can't trigger a call by accident. */}
                <div style={{ fontFamily: VT, fontSize: "18px", color: "#ffb800", userSelect: "all" }}>
                  {c.display}
                </div>
              </div>
              <a
                href={`https://wa.me/${c.wa}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: "9px",
                  fontFamily: VT,
                  fontSize: "17px",
                  color: "#06180f",
                  background: "#2ee88c",
                  borderRadius: "6px",
                  padding: "8px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Message on WhatsApp
              </a>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close help contacts" : "Open help contacts"}
        style={{
          cursor: "pointer",
          fontFamily: PS,
          fontSize: "9px",
          color: "#241a11",
          background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 55%, #b8a200)",
          border: "none",
          borderRadius: "999px",
          padding: "11px 16px",
          boxShadow: "0 4px 0 #8a7900, 0 0 18px rgba(255,180,40,.5)",
          letterSpacing: "1px",
          whiteSpace: "nowrap",
        }}
      >
        {open ? "✕ CLOSE" : "? NEED HELP"}
      </button>
    </div>
  );
}
