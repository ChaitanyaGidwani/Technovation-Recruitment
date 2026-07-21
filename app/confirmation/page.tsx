"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import CRTFrame from "@/components/CRTFrame";
import PixelButton from "@/components/PixelButton";
import PlayerTicket from "@/components/PlayerTicket";
import { supabase } from "@/lib/supabase";
import { useCandidate } from "@/lib/candidate-context";
import type { Candidate } from "@/lib/types";

interface ConfirmData {
  name: string;
  email: string;
  domain: string;
}

export default function Confirmation() {
  const router = useRouter();
  const { setSession } = useCandidate();

  const [data, setData] = useState<ConfirmData | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFlash, setShowFlash] = useState(true);

  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem("arcade:confirm")
        : null;
    if (!raw) {
      router.replace("/");
      return;
    }
    setData(JSON.parse(raw));
    const t = setTimeout(() => setShowFlash(false), 1900);
    return () => clearTimeout(t);
  }, [router]);

  const finish = async () => {
    if (pin.length < 4) return setError("PIN MUST BE 4+ CHARACTERS");
    if (pin !== pin2) return setError("PINS DO NOT MATCH");
    if (!data) return;

    setSaving(true);
    setError("");

    const { data: rpc, error: rpcErr } = await supabase.rpc("set_passcode", {
      p_email: data.email,
      p_passcode: pin,
    });

    setSaving(false);

    if (rpcErr) {
      if (
        rpcErr.message.toLowerCase().includes("load failed") ||
        rpcErr.message.toLowerCase().includes("fetch")
      ) {
        setError("SUPABASE DISCONNECTED: PLEASE CHECK YOUR .ENV.LOCAL KEYS");
      } else {
        setError(rpcErr.message.toUpperCase());
      }
      return;
    }

    const candidate = rpc as unknown as Candidate;
    setSession({ email: data.email, passcode: pin, candidate });
    sessionStorage.removeItem("arcade:confirm");
    router.push("/dashboard");
  };

  if (!data) return null;

  const playerId = data.email; // deterministic avatar seed

  return (
    <main className="arcade-grid relative min-h-screen px-4 py-10">
      {/* LEVEL CLEAR flash overlay */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
          >
            <motion.h1
              animate={{ scale: [0.6, 1.15, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 0.8 }}
              className="font-pixel text-2xl text-arcade-yellow text-glow-yellow sm:text-4xl"
            >
              LEVEL CLEAR!
            </motion.h1>
            <motion.p
              animate={{ opacity: [0, 1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="mt-6 font-pixel text-lg text-arcade-neon text-glow-neon"
            >
              1 UP
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      <CRTFrame className="max-w-3xl">
        <div className="px-5 py-8 sm:px-10">
          <motion.p
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="text-center font-pixel text-xs text-arcade-neon text-glow-neon"
          >
            ★ PLAYER REGISTERED ★
          </motion.p>
          <p className="font-term mt-3 text-center text-2xl text-arcade-ice/70">
            Here&apos;s your Player ID. Download it, flex it, then lock in your
            passcode to enter Player HQ.
          </p>

          <div className="mt-8">
            <PlayerTicket
              name={data.name}
              email={data.email}
              domainId={data.domain}
              playerId={playerId}
            />
          </div>

          {/* Passcode setup */}
          <div
            className="mt-10 rounded-xl p-5 sm:p-7"
            style={{
              background: "#0c0620",
              border: "2px solid #2a1a4a",
            }}
          >
            <h2 className="font-pixel text-[10px] text-arcade-cyan">
              SET YOUR PASSCODE
            </h2>
            <p className="font-term mt-1 text-lg text-arcade-ice/60">
              You&apos;ll use your email + this passcode to log into your
              dashboard.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
                placeholder="PASSCODE"
                className="rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-xl tracking-widest text-arcade-cyan outline-none focus:shadow-cyan"
              />
              <input
                type="password"
                value={pin2}
                onChange={(e) => {
                  setPin2(e.target.value);
                  setError("");
                }}
                placeholder="CONFIRM PASSCODE"
                className="rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-xl tracking-widest text-arcade-cyan outline-none focus:shadow-cyan"
              />
            </div>

            {error && (
              <p className="mt-4 animate-blink font-pixel text-[8px] text-arcade-red">
                ⚠ {error}
              </p>
            )}

            <div className="mt-6 flex justify-center">
              <PixelButton color="#39ff14" onClick={finish} disabled={saving}>
                {saving ? "LOADING…" : "▶ ENTER PLAYER HQ"}
              </PixelButton>
            </div>
          </div>
        </div>
      </CRTFrame>
    </main>
  );
}
