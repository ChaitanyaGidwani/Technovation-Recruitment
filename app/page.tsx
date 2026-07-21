"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import CRTFrame from "@/components/CRTFrame";
import Joystick from "@/components/Joystick";
import DomainCabinet from "@/components/DomainCabinet";
import PixelButton from "@/components/PixelButton";
import { DOMAINS } from "@/lib/types";
import { useCandidate } from "@/lib/candidate-context";

export default function ArcadeEntrance() {
  const router = useRouter();
  const { setDraft } = useCandidate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pickedDomain, setPickedDomain] = useState<string | null>(null);
  const [error, setError] = useState("");

  const start = () => {
    if (!name.trim() || !email.trim()) {
      setError("ENTER NAME & EMAIL TO CONTINUE");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("INVALID EMAIL FORMAT");
      return;
    }
    setDraft({ name: name.trim(), email: email.trim() });
    // Carry a pre-picked domain (if any) into character creation.
    if (pickedDomain) sessionStorage.setItem("arcade:domain", pickedDomain);
    router.push("/character-creation");
  };

  const scrollDown = () =>
    document
      .getElementById("panel")
      ?.scrollIntoView({ behavior: "smooth" });

  return (
    <main className="arcade-grid min-h-screen">
      {/* -------- HERO: CRT viewport -------- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <CRTFrame className="max-w-3xl">
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <motion.p
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="font-pixel text-[10px] text-arcade-cyan text-glow-cyan"
            >
              ★ NOW RECRUITING ★
            </motion.p>
            <h1 className="mt-6 font-pixel text-xl leading-relaxed text-arcade-neon text-glow-neon sm:text-3xl">
              CLUB
              <br />
              RECRUITMENT
              <br />
              ARCADE
            </h1>
            <p className="font-term mt-6 max-w-md text-2xl leading-tight text-white/70">
              Six domains. One party to join. Pick your cabinet, build your
              character, and press start.
            </p>
            <div className="mt-8 animate-blink font-pixel text-[9px] text-arcade-yellow text-glow-yellow">
              ▾ SCROLL DOWN TO PLAY ▾
            </div>
          </div>
        </CRTFrame>

        <button
          onClick={scrollDown}
          className="mt-8 font-pixel text-[9px] text-white/50 hover:text-arcade-neon"
        >
          [ INSERT COIN ]
        </button>
      </section>

      {/* -------- CONTROL PANEL -------- */}
      <section
        id="panel"
        className="relative mx-auto max-w-6xl px-4 py-16"
      >
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-2 text-center font-pixel text-sm text-arcade-magenta text-glow-magenta sm:text-lg"
        >
          SELECT YOUR DOMAIN
        </motion.h2>
        <p className="font-term mb-10 text-center text-2xl text-white/50">
          Move the stick. Feel the machine. These are your six cabinets.
        </p>

        {/* Cabinets */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {DOMAINS.map((d, i) => (
            <DomainCabinet
              key={d.id}
              domain={d}
              index={i}
              selected={pickedDomain === d.id}
              onSelect={(id) =>
                setPickedDomain((prev) => (prev === id ? null : id))
              }
            />
          ))}
        </div>

        {/* Console: joystick + buttons + quick form */}
        <div
          className="mt-12 grid grid-cols-1 items-center gap-8 rounded-2xl p-6 sm:p-10 md:grid-cols-2"
          style={{
            background:
              "linear-gradient(160deg, #1a1030, #0c0620)",
            border: "3px solid #2a1a4a",
            boxShadow: "0 12px 0 rgba(0,0,0,0.4)",
          }}
        >
          {/* Left: joystick + deco buttons */}
          <div className="flex flex-col items-center gap-6">
            <Joystick />
            <div className="flex gap-4">
              {["#ff2e63", "#ffe600", "#00f0ff"].map((c) => (
                <motion.div
                  key={c}
                  whileHover={{ y: -3 }}
                  whileTap={{ y: 3 }}
                  className="h-10 w-10 rounded-full"
                  style={{
                    background: c,
                    boxShadow: `0 5px 0 rgba(0,0,0,0.5), 0 0 14px ${c}`,
                  }}
                />
              ))}
            </div>
            <p className="font-pixel text-[7px] text-white/30">
              MOVE CURSOR — THE STICK FOLLOWS
            </p>
          </div>

          {/* Right: quick form */}
          <div className="flex flex-col gap-4">
            <label className="font-pixel text-[9px] text-arcade-neon">
              PLAYER NAME
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="ARCADE HERO"
                className="mt-2 w-full rounded border-2 border-arcade-neon bg-black/60 px-3 py-2 font-term text-xl text-arcade-neon outline-none focus:shadow-neon"
              />
            </label>
            <label className="font-pixel text-[9px] text-arcade-cyan">
              EMAIL
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="hero@player.one"
                className="mt-2 w-full rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-xl text-arcade-cyan outline-none focus:shadow-cyan"
              />
            </label>

            {error && (
              <p className="animate-blink font-pixel text-[8px] text-arcade-red">
                ⚠ {error}
              </p>
            )}

            <motion.div
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="mt-2 self-start"
            >
              <PixelButton color="#ffe600" onClick={start}>
                ▶ PRESS START
              </PixelButton>
            </motion.div>

            <p className="font-term text-lg text-white/40">
              Already a player?{" "}
              <a
                href="/dashboard"
                className="text-arcade-cyan underline hover:text-arcade-neon"
              >
                Enter Player HQ →
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
