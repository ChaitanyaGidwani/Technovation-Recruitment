"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import CRTFrame from "@/components/CRTFrame";
import PixelButton from "@/components/PixelButton";
import { DOMAINS } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useCandidate } from "@/lib/candidate-context";

const SCENARIOS = [
  {
    key: "q1",
    label: "SIDE QUEST",
    prompt: "Why do you want to join this domain? (your origin story)",
  },
  {
    key: "q2",
    label: "BOSS FIGHT",
    prompt:
      "Describe a time you shipped something under pressure. How did you win?",
  },
  {
    key: "q3",
    label: "CHEAT CODE",
    prompt: "What's a superpower you bring to the party?",
  },
];

export default function CharacterCreation() {
  const router = useRouter();
  const { draft, ready } = useCandidate();

  const [form, setForm] = useState({
    name: "",
    branch: "",
    section: "",
    phone: "",
    college_email: "",
    domain: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({
    q1: "",
    q2: "",
    q3: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill from the entrance quick-form.
  useEffect(() => {
    if (!ready) return;
    const preDomain =
      typeof window !== "undefined"
        ? sessionStorage.getItem("arcade:domain") ?? ""
        : "";
    setForm((f) => ({
      ...f,
      name: draft.name || f.name,
      domain: preDomain || f.domain,
    }));
    // If someone lands here with no draft, send them back to insert a coin.
    if (!draft.email) router.replace("/");
  }, [ready, draft, router]);

  const update = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  };

  const submit = async () => {
    if (!form.name.trim()) return setError("NAME REQUIRED");
    if (!form.domain) return setError("SELECT A DOMAIN");
    if (!form.college_email.trim()) return setError("COLLEGE EMAIL REQUIRED");
    if (!/^\S+@\S+\.\S+$/.test(form.college_email))
      return setError("INVALID COLLEGE EMAIL");
    if (!answers.q1.trim() || !answers.q2.trim() || !answers.q3.trim())
      return setError("ANSWER ALL 3 SCENARIOS");

    setSaving(true);
    setError("");

    const { error: dbError } = await supabase.from("candidates").insert({
      name: form.name.trim(),
      email: draft.email,
      college_email: form.college_email.trim(),
      branch: form.branch.trim() || null,
      section: form.section.trim() || null,
      phone: form.phone.trim() || null,
      domain: form.domain,
      answers,
    });

    setSaving(false);

    if (dbError) {
      if (dbError.code === "23505") {
        setError("THIS EMAIL ALREADY HAS A GAME SAVE. TRY LOGGING IN.");
      } else if (
        dbError.message.toLowerCase().includes("load failed") ||
        dbError.message.toLowerCase().includes("fetch")
      ) {
        setError(
          "SUPABASE DISCONNECTED: PLEASE ADD YOUR SUPABASE KEYS TO .ENV.LOCAL"
        );
      } else {
        setError(`SAVE FAILED: ${dbError.message.toUpperCase()}`);
      }
      return;
    }

    // Stash context for the confirmation screen.
    sessionStorage.setItem(
      "arcade:confirm",
      JSON.stringify({
        name: form.name.trim(),
        email: draft.email,
        domain: form.domain,
      })
    );
    router.push("/confirmation");
  };

  const inputCls =
    "mt-2 w-full rounded border-2 border-arcade-purple bg-black/60 px-3 py-2 font-term text-xl text-white outline-none focus:border-arcade-neon focus:shadow-neon";

  return (
    <main className="arcade-grid min-h-screen px-4 py-10">
      <CRTFrame className="max-w-3xl">
        <div className="px-5 py-8 sm:px-10">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center font-pixel text-base text-arcade-neon text-glow-neon sm:text-xl"
          >
            CHARACTER CREATION
          </motion.h1>
          <p className="font-term mt-2 text-center text-2xl text-white/60">
            Fill your stats, warrior. This becomes your player record.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="font-pixel text-[9px] text-arcade-neon">
              NAME
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="font-pixel text-[9px] text-arcade-cyan">
              PHONE
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                inputMode="tel"
                className={inputCls}
              />
            </label>
            <label className="font-pixel text-[9px] text-arcade-yellow">
              BRANCH
              <input
                value={form.branch}
                onChange={(e) => update("branch", e.target.value)}
                placeholder="e.g. CSE"
                className={inputCls}
              />
            </label>
            <label className="font-pixel text-[9px] text-arcade-magenta">
              SECTION
              <input
                value={form.section}
                onChange={(e) => update("section", e.target.value)}
                placeholder="e.g. B"
                className={inputCls}
              />
            </label>
            <label className="font-pixel text-[9px] text-arcade-cyan sm:col-span-2">
              COLLEGE EMAIL
              <input
                value={form.college_email}
                onChange={(e) => update("college_email", e.target.value)}
                placeholder="you@college.edu"
                className={inputCls}
              />
            </label>
          </div>

          {/* Domain picker */}
          <p className="mt-8 font-pixel text-[9px] text-arcade-neon">
            SELECTED DOMAIN
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DOMAINS.map((d, i) => {
              const on = form.domain === d.id;
              return (
                <motion.button
                  key={d.id}
                  type="button"
                  onClick={() => update("domain", d.id)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  whileHover={{ y: -3, scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 rounded px-2 py-2 text-left"
                  style={{
                    background: on ? d.color : "#160b2e",
                    border: `2px solid ${on ? d.color : "#2a1a4a"}`,
                    boxShadow: on ? `0 0 14px ${d.color}` : "none",
                  }}
                >
                  <span>{d.icon}</span>
                  <span
                    className="font-pixel text-[7px] leading-tight"
                    style={{ color: on ? "#000" : d.color }}
                  >
                    {d.name}
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* Scenario fields */}
          <div className="mt-8 flex flex-col gap-5">
            {SCENARIOS.map((s) => (
              <label
                key={s.key}
                className="font-pixel text-[9px] text-arcade-purple"
              >
                <span className="text-arcade-yellow">[{s.label}]</span>{" "}
                {s.prompt}
                <textarea
                  value={answers[s.key]}
                  onChange={(e) => {
                    setAnswers((a) => ({ ...a, [s.key]: e.target.value }));
                    setError("");
                  }}
                  rows={3}
                  className={inputCls + " resize-none"}
                />
              </label>
            ))}
          </div>

          {error && (
            <p className="mt-6 animate-blink text-center font-pixel text-[8px] text-arcade-red">
              ⚠ {error}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between">
            <a
              href="/"
              className="font-pixel text-[8px] text-white/40 hover:text-white"
            >
              ← BACK
            </a>
            <PixelButton
              color="#39ff14"
              onClick={submit}
              disabled={saving}
            >
              {saving ? "SAVING…" : "▶ CREATE PLAYER"}
            </PixelButton>
          </div>
        </div>
      </CRTFrame>
    </main>
  );
}
