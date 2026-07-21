"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import CRTFrame from "@/components/CRTFrame";
import PixelButton from "@/components/PixelButton";
import PixelAvatar from "@/components/PixelAvatar";
import ProgressTracker from "@/components/ProgressTracker";
import { supabase } from "@/lib/supabase";
import { useCandidate } from "@/lib/candidate-context";
import { getDomain, STAGES, type Candidate, type Stage } from "@/lib/types";

/** Builds a comms feed from the candidate's current stage. */
function buildComms(c: Candidate): { tag: string; color: string; text: string }[] {
  const idx = STAGES.indexOf(c.stage);
  const feed: { tag: string; color: string; text: string }[] = [
    {
      tag: "SYSTEM",
      color: "#39ff14",
      text: `Welcome, ${c.name}. Your application to ${
        getDomain(c.domain)?.codename ?? c.domain
      } is logged.`,
    },
  ];
  if (idx >= 1)
    feed.push({
      tag: "RECRUITER",
      color: "#00f0ff",
      text: "You cleared screening. A task will drop in your Quest Log soon.",
    });
  if (c.assigned_task_title)
    feed.push({
      tag: "QUEST",
      color: "#ffe600",
      text: `New quest assigned: "${c.assigned_task_title}". Submit your proof link below.`,
    });
  if (idx >= 3)
    feed.push({
      tag: "INTERVIEW",
      color: "#ff00d4",
      text: "Interview stage unlocked — watch this channel for your schedule.",
    });
  if (c.stage === "Recruited")
    feed.push({
      tag: "1UP",
      color: "#39ff14",
      text: "🎉 You've been RECRUITED. Welcome to the party!",
    });
  return feed.reverse();
}

export default function Dashboard() {
  const router = useRouter();
  const { session, setSession, ready } = useCandidate();

  // Login form state
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Quest submission state
  const [link, setLink] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const candidate = session?.candidate ?? null;

  useEffect(() => {
    if (candidate?.submission_link) setLink(candidate.submission_link);
  }, [candidate]);

  const login = async () => {
    if (!email.trim() || !pin.trim()) return setLoginError("ENTER EMAIL & PASSCODE");
    setLoggingIn(true);
    setLoginError("");
    const { data, error } = await supabase.rpc("candidate_login", {
      p_email: email.trim(),
      p_passcode: pin,
    });
    setLoggingIn(false);
    if (error) {
      if (
        error.message.toLowerCase().includes("load failed") ||
        error.message.toLowerCase().includes("fetch")
      ) {
        return setLoginError(
          "SUPABASE DISCONNECTED: PLEASE CHECK YOUR .ENV.LOCAL KEYS"
        );
      }
      return setLoginError(error.message.toUpperCase());
    }
    setSession({
      email: email.trim(),
      passcode: pin,
      candidate: data as unknown as Candidate,
    });
  };

  const refresh = async () => {
    if (!session) return;
    const { data } = await supabase.rpc("candidate_login", {
      p_email: session.email,
      p_passcode: session.passcode,
    });
    if (data)
      setSession({ ...session, candidate: data as unknown as Candidate });
  };

  const submitLink = async () => {
    if (!session) return;
    if (!/^https?:\/\/\S+$/.test(link))
      return setSubmitMsg("ENTER A VALID URL (https://…)");
    setSubmitting(true);
    setSubmitMsg("");
    const { data, error } = await supabase.rpc("submit_task_link", {
      p_email: session.email,
      p_passcode: session.passcode,
      p_link: link.trim(),
    });
    setSubmitting(false);
    if (error) return setSubmitMsg(error.message.toUpperCase());
    setSession({ ...session, candidate: data as unknown as Candidate });
    setSubmitMsg("✓ PROOF SUBMITTED. GG!");
  };

  const logout = () => {
    setSession(null);
    router.push("/");
  };

  const comms = useMemo(
    () => (candidate ? buildComms(candidate) : []),
    [candidate]
  );

  if (!ready) return null;

  // -------- LOGIN VIEW --------
  if (!session) {
    return (
      <main className="arcade-grid flex min-h-screen items-center justify-center px-4 py-10">
        <CRTFrame className="max-w-md">
          <div className="px-6 py-10">
            <h1 className="text-center font-pixel text-sm text-arcade-neon text-glow-neon">
              PLAYER HQ
            </h1>
            <p className="font-term mt-2 text-center text-xl text-arcade-ice/60">
              Insert your credentials to continue.
            </p>
            <div className="mt-8 flex flex-col gap-4">
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setLoginError("");
                }}
                placeholder="EMAIL"
                className="rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-xl text-arcade-cyan outline-none focus:shadow-cyan"
              />
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setLoginError("");
                }}
                placeholder="PASSCODE"
                className="rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-xl tracking-widest text-arcade-cyan outline-none focus:shadow-cyan"
              />
              {loginError && (
                <p className="animate-blink font-pixel text-[8px] text-arcade-red">
                  ⚠ {loginError}
                </p>
              )}
              <div className="flex justify-center">
                <PixelButton color="#39ff14" onClick={login} disabled={loggingIn}>
                  {loggingIn ? "…" : "▶ LOG IN"}
                </PixelButton>
              </div>
              <a
                href="/"
                className="text-center font-term text-lg text-arcade-ice/40 hover:text-arcade-neon"
              >
                New player? Insert a coin →
              </a>
            </div>
          </div>
        </CRTFrame>
      </main>
    );
  }

  // -------- DASHBOARD VIEW --------
  const domain = getDomain(candidate!.domain);
  return (
    <main className="arcade-grid min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl p-4"
          style={{ background: "#160b2e", border: "2px solid #2a1a4a" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="rounded"
              style={{ border: `2px solid ${domain?.color ?? "#39ff14"}` }}
            >
              <PixelAvatar seed={candidate!.email} size={56} />
            </div>
            <div>
              <p className="font-pixel text-[10px] text-arcade-neon">
                {candidate!.name.toUpperCase()}
              </p>
              <p className="font-term text-lg" style={{ color: domain?.color }}>
                {domain?.codename ?? candidate!.domain}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PixelButton color="#00f0ff" glow={false} onClick={refresh}>
              ⟳ Refresh
            </PixelButton>
            <PixelButton color="#ff2e63" glow={false} onClick={logout}>
              ⏻ Log out
            </PixelButton>
          </div>
        </div>

        {/* Progress tracker */}
        <section
          className="mb-6 rounded-xl p-5"
          style={{ background: "#0c0620", border: "2px solid #2a1a4a" }}
        >
          <h2 className="mb-5 font-pixel text-[10px] text-arcade-yellow text-glow-yellow">
            RECRUITMENT PROGRESS
          </h2>
          <ProgressTracker stage={candidate!.stage as Stage} />
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Quest Log */}
          <section
            className="rounded-xl p-5"
            style={{ background: "#0c0620", border: "2px solid #2a1a4a" }}
          >
            <h2 className="mb-4 font-pixel text-[10px] text-arcade-magenta text-glow-magenta">
              QUEST LOG
            </h2>
            {candidate!.assigned_task_title ? (
              <div>
                <p className="font-pixel text-[9px] text-arcade-neon">
                  {candidate!.assigned_task_title}
                </p>
                <p className="font-term mt-2 whitespace-pre-wrap text-lg text-arcade-ice/80">
                  {candidate!.assigned_task_desc ||
                    "Check the brief and submit your proof link below."}
                </p>
                <label className="mt-5 block font-pixel text-[8px] text-arcade-cyan">
                  PROOF URL (GitHub / Figma / Drive)
                  <input
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value);
                      setSubmitMsg("");
                    }}
                    placeholder="https://github.com/you/quest"
                    className="mt-2 w-full rounded border-2 border-arcade-cyan bg-black/60 px-3 py-2 font-term text-lg text-arcade-cyan outline-none focus:shadow-cyan"
                  />
                </label>
                {submitMsg && (
                  <p
                    className={`mt-3 font-pixel text-[8px] ${
                      submitMsg.startsWith("✓")
                        ? "text-arcade-neon"
                        : "animate-blink text-arcade-red"
                    }`}
                  >
                    {submitMsg}
                  </p>
                )}
                <div className="mt-4">
                  <PixelButton
                    color="#39ff14"
                    onClick={submitLink}
                    disabled={submitting}
                  >
                    {submitting ? "…" : "▶ Submit Proof"}
                  </PixelButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="font-pixel text-[9px] text-arcade-ice/50"
                >
                  NO QUEST ASSIGNED YET
                </motion.span>
                <p className="font-term mt-3 text-lg text-arcade-ice/40">
                  Sit tight — your recruiter will drop a task here once you clear
                  screening.
                </p>
              </div>
            )}
          </section>

          {/* Comms Feed */}
          <section
            className="rounded-xl p-5"
            style={{ background: "#0c0620", border: "2px solid #2a1a4a" }}
          >
            <h2 className="mb-4 font-pixel text-[10px] text-arcade-cyan text-glow-cyan">
              COMMS FEED
            </h2>
            <div className="flex flex-col gap-3">
              {comms.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded border-l-4 bg-black/40 px-3 py-2"
                  style={{ borderColor: c.color }}
                >
                  <span
                    className="font-pixel text-[7px]"
                    style={{ color: c.color }}
                  >
                    [{c.tag}]
                  </span>
                  <p className="font-term text-lg leading-tight text-arcade-ice/80">
                    {c.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
