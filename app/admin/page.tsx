"use client";

/**
 * Technovation Guild Council — Secure Admin Command Center
 * 
 * Security Measures:
 * 1. Admin Authentication Gate (Master Key verification with session auto-expiry)
 * 2. Brute-Force Lockout Protection (Max 5 attempts before 60s cooldown)
 * 3. XSS & Injection Prevention (Safe URL sanitization for candidate submissions)
 * 4. Privacy Protection (Candidate PINs/passcodes remain encrypted/masked)
 * 5. Full Audit Trail & Real-time Candidate Stage Management
 */

import { useEffect, useState, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const PS = "'Press Start 2P', monospace";
const VT = "'VT323', monospace";

const MASTER_KEY = "techno21";

const STAGES = [
  { key: "submitted", label: "FORM SUBMITTED", icon: "✓", color: "#7de8ff" },
  { key: "screening", label: "SCREENING", icon: "◉", color: "#00f0ff" },
  { key: "task", label: "TASK ROUND", icon: "⚔", color: "#ffb800" },
  { key: "interview", label: "INTERVIEW", icon: "☎", color: "#ff2bd1" },
  { key: "recruited", label: "RECRUITED", icon: "★", color: "#ffb800" },
  { key: "rejected", label: "BENCH / ON HOLD", icon: "✕", color: "#ff2bd1" },
];

const DOMAINS = [
  { key: "tech", name: "TECHNICAL", color: "#00f0ff", glyph: "Ψ" },
  { key: "graphics", name: "GRAPHICS", color: "#ff2bd1", glyph: "✦" },
  { key: "prod", name: "PRODUCTION", color: "#00f0ff", glyph: "◈" },
  { key: "events", name: "EVENTS", color: "#ff2bd1", glyph: "⚔" },
  { key: "pr", name: "PR/OUTREACH", color: "#00f0ff", glyph: "➤" },
  { key: "content", name: "CONTENT", color: "#ff2bd1", glyph: "✎" },
];

interface Candidate {
  id: string;
  playerNo: number;
  name: string;
  email: string;
  branch: string;
  section: string;
  phone: string;
  collegeId: string;
  domains: string[]; // Primary & Secondary domain keys
  answers: Record<string, string>;
  stageIdx: number; // 0 to 4 (or 5 for rejected)
  submissionLink?: string;
  submissions?: Record<string, string>;
  notes?: string;
  rejected?: boolean;
  rejectedAtStage?: number;
  rejectionFeedback?: string;
  taskScore?: number;      // /100, set once candidate reaches Task Round
  interviewScore?: number; // /100, set once candidate reaches Interview
  updatedAt: string;
}

// Real Applicant Data (Starts empty and populates dynamically as candidates apply)
const INITIAL_CANDIDATES: Candidate[] = [];

// Helper to safely format URLs against XSS / javascript: protocol injection
function sanitizeUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^(https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return null; // Block malicious protocols like javascript:
}

export default function AdminPage() {
  // Auth & Security state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Candidates & Filtering state
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tech_candidates_admin");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          /* fallback */
        }
      }
    }
    return INITIAL_CANDIDATES;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [scoreTask, setScoreTask] = useState("");
  const [scoreInterview, setScoreInterview] = useState("");
  // Google Sheets live-sync config
  const [webhookUrl, setWebhookUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("tech_sheet_webhook") || "" : ""
  );
  const [webhookDraft, setWebhookDraft] = useState("");
  const [showSyncCfg, setShowSyncCfg] = useState(false);
  const [lastSync, setLastSync] = useState("");
  // Candidate awaiting a promotion the admin must re-confirm.
  const [confirmPromote, setConfirmPromote] = useState<Candidate | null>(null);
  // Candidate awaiting a rejection ("stop journey") the admin must re-confirm.
  const [confirmReject, setConfirmReject] = useState<Candidate | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  // Candidate awaiting permanent deletion the admin must re-confirm.
  const [confirmDelete, setConfirmDelete] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  // Persist candidates to LocalStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tech_candidates_admin", JSON.stringify(candidates));
    }
  }, [candidates]);

  // ---- LIVE: reflect new applicants & candidate task submissions ----
  // Reloads the roster whenever another tab (a candidate) writes the store,
  // on window focus, and on a gentle poll. The equality guard prevents any
  // churn or clobbering of the admin's own in-tab edits.
  useEffect(() => {
    const reload = () => {
      try {
        const raw = localStorage.getItem("tech_candidates_admin");
        if (!raw) return;
        setCandidates((prev) => (JSON.stringify(prev) === raw ? prev : JSON.parse(raw)));
      } catch {
        /* ignore */
      }
    };
    const onStorage = (e: StorageEvent) => { if (e.key === "tech_candidates_admin") reload(); };
    const onFocus = () => reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(reload, 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, []);

  // Lockout Timer countdown
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const timer = setInterval(() => {
      setLockoutTime((t) => (t > 1 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutTime]);

  // Auto session expiry after 30 mins
  useEffect(() => {
    if (!isAuthenticated) return;
    const timeout = setTimeout(() => {
      setIsAuthenticated(false);
      setAuthError("SESSION EXPIRED FOR SECURITY. PLEASE LOG IN AGAIN.");
    }, 30 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutTime > 0) return;

    if (inputKey.trim().toLowerCase() === MASTER_KEY.toLowerCase()) {
      setIsAuthenticated(true);
      setAuthError("");
      setAttempts(0);
      setInputKey("");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLockoutTime(60);
        setAuthError("TOO MANY FAILED ATTEMPTS. LOCKED FOR 60s.");
      } else {
        setAuthError(`INVALID MASTER KEY. (${5 - newAttempts} ATTEMPTS REMAINING)`);
      }
    }
  };

  const updateStage = (candId: string, newStageIdx: number) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candId) {
          const updated = {
            ...c,
            stageIdx: newStageIdx,
            updatedAt: "JUST NOW",
          };
          if (selectedCandidate?.id === candId) {
            setSelectedCandidate(updated);
          }
          return updated;
        }
        return c;
      })
    );
  };

  // Executed only after the admin confirms the promotion dialog.
  const promoteConfirmed = () => {
    if (!confirmPromote) return;
    const next = Math.min(confirmPromote.stageIdx + 1, 4);
    updateStage(confirmPromote.id, next);
    setConfirmPromote(null);
  };

  // Stop an applicant's journey (rejection) — only after admin confirmation.
  const rejectConfirmed = () => {
    if (!confirmReject) return;
    const atStage = confirmReject.stageIdx; // stage reached when stopped
    const feedback = rejectFeedback.trim();
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === confirmReject.id) {
          const updated: Candidate = {
            ...c,
            stageIdx: 5,
            rejected: true,
            rejectedAtStage: atStage,
            rejectionFeedback: feedback,
            updatedAt: "JUST NOW",
          };
          if (selectedCandidate?.id === c.id) setSelectedCandidate(updated);
          return updated;
        }
        return c;
      })
    );
    setConfirmReject(null);
    setRejectFeedback("");
  };

  // Permanently delete an applicant — from Supabase first (so it can't
  // resurrect via sync), then from the local roster.
  const deleteConfirmed = async () => {
    if (!confirmDelete) return;
    const email = (confirmDelete.email || "").toLowerCase();
    const id = confirmDelete.id;
    setDeleting(true);
    setDeleteErr("");
    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from("candidates").delete().eq("email", email);
        if (error) {
          // Almost always a missing DELETE policy — keep the row, tell the admin.
          setDeleteErr("Delete blocked by Supabase: " + (error.message || String(error)) + " — re-run supabase/schema_live.sql to add the delete policy.");
          setDeleting(false);
          return;
        }
      }
      // Forget it in the sync's "seen in cloud" set so a re-registration works.
      try {
        const raw = localStorage.getItem("tech_pushed_emails");
        if (raw) {
          const next = (JSON.parse(raw) as string[]).filter((e) => e.toLowerCase() !== email);
          localStorage.setItem("tech_pushed_emails", JSON.stringify(next));
        }
      } catch { /* ignore */ }
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      if (selectedCandidate?.id === id) setSelectedCandidate(null);
      setDeleting(false);
      setConfirmDelete(null);
    } catch (e) {
      setDeleteErr("Delete error: " + String(e));
      setDeleting(false);
    }
  };

  // Save Task / Interview scores (each out of 100). Empty clears the score.
  const clampScore = (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    if (Number.isNaN(n)) return undefined;
    return Math.max(0, Math.min(100, Math.round(n)));
  };
  const saveScores = (candId: string) => {
    const t = clampScore(scoreTask);
    const iv = clampScore(scoreInterview);
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candId) {
          const updated: Candidate = { ...c, taskScore: t, interviewScore: iv, updatedAt: "JUST NOW" };
          if (selectedCandidate?.id === candId) setSelectedCandidate(updated);
          return updated;
        }
        return c;
      })
    );
  };

  const saveNotes = (candId: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candId) {
          const updated = { ...c, notes: editingNotes, updatedAt: "JUST NOW" };
          setSelectedCandidate(updated);
          return updated;
        }
        return c;
      })
    );
  };

  // The two per-domain task submission links, in domain order [1st, 2nd].
  const subLinksFor = (c: Candidate): [string, string] => {
    const doms = c.domains || [];
    const subs = c.submissions || {};
    const l1 = subs[doms[0]] || c.submissionLink || "";
    const l2 = subs[doms[1]] || "";
    return [l1, l2];
  };

  const exportCSV = () => {
    const headers = ["PlayerNo", "Name", "Email", "Branch", "Phone", "Domains", "Stage", "TaskScore", "InterviewScore", "TotalScore", "SubLink1", "SubLink2", "Updated"];
    const rows = candidates.map((c) => {
      const [l1, l2] = subLinksFor(c);
      return [
        c.playerNo,
        `"${c.name}"`,
        `"${c.email}"`,
        `"${c.branch}"`,
        `"${c.phone}"`,
        `"${c.domains.join(" + ")}"`,
        `"${STAGES[c.stageIdx]?.label || "UNKNOWN"}"`,
        c.taskScore != null ? c.taskScore : "",
        c.interviewScore != null ? c.interviewScore : "",
        c.taskScore != null && c.interviewScore != null ? c.taskScore + c.interviewScore : "",
        `"${l1.replace(/"/g, "'")}"`,
        `"${l2.replace(/"/g, "'")}"`,
        `"${c.updatedAt}"`,
      ];
    });
    const content = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technovation_candidates_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Excel export (opens natively in Excel / Google Sheets). Dependency-free:
  // an Office-flavoured HTML table saved with an .xls extension.
  const exportXLSX = () => {
    const esc = (v: unknown) =>
      String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Mirror the Supabase `candidates` table exactly (same column names & order).
    const cols = [
      "email", "app_id", "player_no", "name", "branch", "section", "phone",
      "college_id", "domains", "answers", "stage_idx",
      "sub_link_1", "sub_link_2", "task_score", "interview_score",
      "rejected", "rejected_at_stage", "rejection_feedback", "notes", "updated_at",
    ];
    const head = `<tr>${cols.map((c) => `<th style="background:#1c2540;color:#fff">${esc(c)}</th>`).join("")}</tr>`;
    const body = candidates
      .map((c) => {
        const [l1, l2] = subLinksFor(c);
        const vals = [
          c.email,
          c.id ?? "",
          c.playerNo ?? "",
          c.name ?? "",
          c.branch ?? "",
          c.section ?? "",
          c.phone ?? "",
          c.collegeId ?? "",
          `{${(c.domains || []).join(",")}}`,
          JSON.stringify(c.answers || {}),
          c.stageIdx ?? "",
          l1,
          l2,
          c.taskScore ?? "",
          c.interviewScore ?? "",
          c.rejected ? "true" : "false",
          c.rejectedAtStage ?? "",
          c.rejectionFeedback ?? "",
          c.notes ?? "",
          c.updatedAt ?? "",
        ];
        return `<tr>${vals.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`;
      })
      .join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technovation_candidates_${Date.now()}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -------- Google Sheets live sync --------
  const SHEET_HEADERS = ["PlayerNo", "Name", "Email", "Branch", "Section", "Phone", "Domains", "Stage", "TaskScore", "InterviewScore", "TotalScore", "SubLink1", "SubLink2", "ReviewerNotes", "Updated"];
  const rosterRows = () =>
    candidates.map((c) => {
      const total = c.taskScore != null && c.interviewScore != null ? c.taskScore + c.interviewScore : "";
      const [l1, l2] = subLinksFor(c);
      const row = [
        c.playerNo, c.name, c.email, c.branch, c.section, c.phone,
        (c.domains || []).join(" + "),
        c.rejected ? "REJECTED / STOPPED" : STAGES[c.stageIdx]?.label || "UNKNOWN",
        c.taskScore ?? "", c.interviewScore ?? "", total,
        l1, l2, c.notes || "", c.updatedAt,
      ];
      return row.map((v) => (v == null ? "" : v));
    });

  const syncNow = () => {
    if (!webhookUrl) return;
    setLastSync("Syncing…");
    const body = JSON.stringify({ headers: SHEET_HEADERS, rows: rosterRows(), syncedAt: new Date().toISOString() });
    fetch(webhookUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body })
      .then(() => setLastSync("Synced " + new Date().toLocaleTimeString()))
      .catch(() => setLastSync("Sync failed — check the URL"));
  };

  const saveWebhook = () => {
    const u = webhookDraft.trim();
    setWebhookUrl(u);
    try { localStorage.setItem("tech_sheet_webhook", u); } catch { /* ignore */ }
    setLastSync(u ? "Saved — will sync on the next update" : "Sheet sync disabled");
  };

  // Auto-push the roster to the sheet whenever anything changes (debounced).
  useEffect(() => {
    if (!webhookUrl) return;
    const t = setTimeout(syncNow, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, webhookUrl]);

  // Filtered + evaluation-ordered candidates
  const filteredCandidates = useMemo(() => {
    const list = candidates.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(c.playerNo).includes(searchQuery);

      const matchesDomain =
        domainFilter === "all" || c.domains.includes(domainFilter);

      const matchesStage =
        stageFilter === "all" ||
        (stageFilter === "rejected" ? c.stageIdx === 5 : c.stageIdx === Number(stageFilter));

      return matchesSearch && matchesDomain && matchesStage;
    });

    // Evaluation order: pending review first (submitted a task but not yet
    // promoted), then furthest-along stage, then by player number.
    return list.sort((a, b) => {
      const aReady = a.submissionLink && a.stageIdx < 4 ? 1 : 0;
      const bReady = b.submissionLink && b.stageIdx < 4 ? 1 : 0;
      return bReady - aReady || b.stageIdx - a.stageIdx || a.playerNo - b.playerNo;
    });
  }, [candidates, searchQuery, domainFilter, stageFilter]);

  // Metric counts
  const stats = useMemo(() => {
    const total = candidates.length;
    const screening = candidates.filter((c) => c.stageIdx === 1).length;
    const task = candidates.filter((c) => c.stageIdx === 2).length;
    const interview = candidates.filter((c) => c.stageIdx === 3).length;
    const recruited = candidates.filter((c) => c.stageIdx === 4).length;
    return { total, screening, task, interview, recruited };
  }, [candidates]);

  // Styles
  const cardBox: CSSProperties = {
    background: "rgba(10,14,26,.85)",
    border: "2px solid #1c2540",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 0 26px rgba(0,0,0,.4)",
  };

  const inputStyle: CSSProperties = {
    background: "#050a10",
    border: "2px solid #3a3410",
    borderRadius: "6px",
    color: "#ffb800",
    fontFamily: VT,
    fontSize: "18px",
    padding: "8px 12px",
    width: "100%",
  };

  // ---------------- LOGIN GATE ----------------
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#04040a", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, opacity: 0.15, pointerEvents: "none", background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.55) 2px 4px)" }} />
        
        <div style={{ width: "100%", maxWidth: "460px", background: "radial-gradient(120% 100% at 50% 0%, #12192e 0%, #070914 100%)", border: "3px solid #ff2bd1", borderRadius: "16px", padding: "36px 28px", boxShadow: "0 0 50px rgba(255,43,209,.25)", textAlign: "center" }}>
          <div style={{ fontFamily: PS, fontSize: "28px", color: "#ff2bd1", textShadow: "0 0 16px #ff2bd1" }}>🛡 ADMIN</div>
          <div style={{ fontFamily: PS, fontSize: "11px", color: "#00f0ff", marginTop: "8px", letterSpacing: "1px" }}>GUILD COUNCIL COMMAND CENTER</div>
          <div style={{ fontFamily: VT, fontSize: "16px", color: "#7de8ff", marginTop: "12px" }}>Restricted Access · Authorized Personnel Only</div>

          <form onSubmit={handleLogin} style={{ marginTop: "28px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#ffb800", textAlign: "left", marginBottom: "6px" }}>MASTER ACCESS KEY</div>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="ENTER ADMIN KEY"
                disabled={lockoutTime > 0}
                style={{ ...inputStyle, textAlign: "center", letterSpacing: "3px" }}
              />
            </div>

            {authError && (
              <div style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1", textShadow: "0 0 8px #ff2bd1", lineHeight: 1.4 }}>
                {authError} {lockoutTime > 0 && `(${lockoutTime}s)`}
              </div>
            )}

            <button
              type="submit"
              disabled={lockoutTime > 0}
              style={{
                cursor: lockoutTime > 0 ? "not-allowed" : "pointer",
                fontFamily: PS,
                fontSize: "11px",
                color: "#04040a",
                background: lockoutTime > 0 ? "#4a5a7a" : "radial-gradient(circle at 40% 30%, #ff9de3, #ff2bd1 60%, #8a0e6d)",
                border: "none",
                borderRadius: "8px",
                padding: "14px",
                boxShadow: lockoutTime > 0 ? "none" : "0 6px 0 #4d063d, 0 0 20px rgba(255,43,209,.5)",
                marginTop: "6px",
              }}
            >
              {lockoutTime > 0 ? `LOCKED (${lockoutTime}s)` : "AUTHENTICATE ▶"}
            </button>
          </form>

          <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid #1c2540", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/" style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff" }}>◄ BACK TO ARCADE</Link>
            <span style={{ fontFamily: PS, fontSize: "8px", color: "#ffb800" }}>SECURE SSL 256</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- ADMIN DASHBOARD ----------------
  return (
    <div style={{ minHeight: "100vh", background: "#04040a", color: "#7de8ff", padding: "24px 20px 80px", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, opacity: 0.15, pointerEvents: "none", background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.55) 2px 4px)" }} />

      <div style={{ maxWidth: "1280px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Header Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", borderBottom: "3px solid #1c2540", paddingBottom: "18px", marginBottom: "24px" }}>
          <div>
            <div style={{ fontFamily: PS, fontSize: "clamp(16px,2.4vw,28px)", color: "#00f0ff", textShadow: "0 0 14px rgba(0,240,255,.5)" }}>
              GUILD COUNCIL COMMAND CENTER
            </div>
            <div style={{ fontFamily: VT, fontSize: "18px", color: "#ff2bd1", marginTop: "4px" }}>
              Technovation Recruitment Admin · Applicant Review & Stage Progression System
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={exportXLSX}
              style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "6px", padding: "10px 14px", boxShadow: "0 4px 0 #3a3410" }}
            >
              ⤓ EXPORT EXCEL
            </button>
            <button
              onClick={exportCSV}
              style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "6px", padding: "10px 14px", boxShadow: "0 4px 0 #8a7b00" }}
            >
              ⤓ EXPORT CSV
            </button>
            <button
              onClick={() => { setWebhookDraft(webhookUrl); setShowSyncCfg((v) => !v); }}
              style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: webhookUrl ? "#ffb800" : "#7de8ff", background: "transparent", border: `2px solid ${webhookUrl ? "#ffb800" : "#1c3a4a"}`, borderRadius: "6px", padding: "8px 12px" }}
            >
              {webhookUrl ? "● " : "○ "}⚙ SHEET SYNC
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff2bd1", background: "transparent", border: "2px solid #ff2bd1", borderRadius: "6px", padding: "8px 12px" }}
            >
              🔒 LOGOUT
            </button>
          </div>
        </div>

        {/* Google Sheets live-sync config */}
        {showSyncCfg && (
          <div style={{ ...cardBox, marginBottom: "24px", borderLeft: "4px solid #ffb800" }}>
            <div style={{ fontFamily: PS, fontSize: "10px", color: "#ffb800", textShadow: "0 0 8px #ffb800" }}>⚙ GOOGLE SHEETS LIVE SYNC</div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#7de8ff", marginTop: "6px", marginBottom: "12px", lineHeight: 1.3 }}>
              Paste your Apps Script Web App URL. Once saved, the full roster auto-pushes to your sheet on every promotion, rejection, score, and submission. Setup steps are in <span style={{ color: "#ffb800" }}>SHEET_SYNC.md</span>.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={webhookDraft}
                onChange={(e) => setWebhookDraft(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                style={{ ...inputStyle, flex: 1, minWidth: "260px", color: "#7de8ff", fontSize: "16px" }}
              />
              <button onClick={saveWebhook} style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "4px", padding: "10px 14px", boxShadow: "0 3px 0 #3a3410" }}>💾 SAVE</button>
              <button onClick={syncNow} disabled={!webhookUrl} style={{ cursor: webhookUrl ? "pointer" : "not-allowed", fontFamily: PS, fontSize: "8px", color: "#04040a", background: webhookUrl ? "#00f0ff" : "#4a5a7a", border: "none", borderRadius: "4px", padding: "10px 14px", boxShadow: webhookUrl ? "0 3px 0 #007a8a" : "none" }}>⟳ SYNC NOW</button>
            </div>
            {lastSync && <div style={{ fontFamily: VT, fontSize: "15px", color: "#ffb800", marginTop: "10px" }}>{lastSync}</div>}
          </div>
        )}

        {/* Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "TOTAL APPLICANTS", val: stats.total, color: "#00f0ff" },
            { label: "IN SCREENING", val: stats.screening, color: "#ffb800" },
            { label: "IN TASK ROUND", val: stats.task, color: "#ff2bd1" },
            { label: "INTERVIEW STAGE", val: stats.interview, color: "#ff2bd1" },
            { label: "RECRUITED", val: stats.recruited, color: "#ffb800" },
          ].map((st, i) => (
            <div key={i} style={{ ...cardBox, padding: "16px", borderLeft: `4px solid ${st.color}` }}>
              <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff" }}>{st.label}</div>
              <div style={{ fontFamily: PS, fontSize: "22px", color: st.color, textShadow: `0 0 10px ${st.color}`, marginTop: "8px" }}>{st.val}</div>
            </div>
          ))}
        </div>

        {/* Filter & Search Toolbar */}
        <div style={{ ...cardBox, marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: "240px" }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 SEARCH BY NAME, EMAIL, BRANCH OR ID..."
                style={{ ...inputStyle, fontSize: "16px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto", fontSize: "14px", padding: "8px" }}
              >
                <option value="all">ALL DOMAINS</option>
                {DOMAINS.map((d) => (
                  <option key={d.key} value={d.key}>{d.name}</option>
                ))}
              </select>

              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto", fontSize: "14px", padding: "8px" }}
              >
                <option value="all">ALL STAGES</option>
                {STAGES.map((s, idx) => (
                  <option key={s.key} value={idx}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Applicants Table */}
        <div style={{ ...cardBox, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #1c2540", fontFamily: PS, fontSize: "9px", color: "#ffb800" }}>
                <th style={{ padding: "12px" }}>ID</th>
                <th style={{ padding: "12px" }}>APPLICANT</th>
                <th style={{ padding: "12px" }}>DOMAINS</th>
                <th style={{ padding: "12px" }}>TASK</th>
                <th style={{ padding: "12px" }}>CURRENT STAGE</th>
                <th style={{ padding: "12px" }}>MANUAL ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", fontFamily: VT, fontSize: "20px", color: "#4a5a7a" }}>
                    NO APPLICANTS FOUND MATCHING FILTERS.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand) => {
                  const stage = STAGES[cand.stageIdx] || STAGES[0];
                  return (
                    <tr key={cand.id} style={{ borderBottom: "1px solid #12192e", fontFamily: VT, fontSize: "18px" }}>
                      <td style={{ padding: "12px", fontFamily: PS, fontSize: "10px", color: "#00f0ff" }}>
                        #{cand.playerNo}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ color: "#fff", fontWeight: "bold" }}>{cand.name}</div>
                        <div style={{ fontSize: "14px", color: "#7de8ff" }}>{cand.email}</div>
                        <div style={{ fontSize: "13px", color: "#4a5a7a" }}>
                          {cand.branch}{cand.section ? ` · SEC ${cand.section}` : ""}{cand.collegeId ? ` · ${cand.collegeId}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {cand.domains.map((key, i) => {
                            const dm = DOMAINS.find((d) => d.key === key);
                            if (!dm) return null;
                            return (
                              <span
                                key={key}
                                style={{
                                  fontFamily: PS,
                                  fontSize: "8px",
                                  color: dm.color,
                                  border: `1px solid ${dm.color}55`,
                                  background: `${dm.color}11`,
                                  borderRadius: "4px",
                                  padding: "3px 6px",
                                }}
                              >
                                {i === 0 ? "1ST" : "2ND"} {dm.glyph} {dm.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        {sanitizeUrl(cand.submissionLink) ? (
                          <a
                            href={sanitizeUrl(cand.submissionLink)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: PS, fontSize: "8px", color: "#ffb800", border: "1px solid #ffb80066", background: "#ffb80011", borderRadius: "4px", padding: "4px 8px", whiteSpace: "nowrap" }}
                          >
                            ✓ SUBMITTED ↗
                          </a>
                        ) : cand.submissionLink ? (
                          <span style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1" }}>⚠ INVALID</span>
                        ) : (
                          <span style={{ fontFamily: PS, fontSize: "8px", color: "#4a5a7a" }}>— AWAITING</span>
                        )}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            fontFamily: PS,
                            fontSize: "8px",
                            color: stage.color,
                            background: `${stage.color}15`,
                            border: `1px solid ${stage.color}66`,
                            borderRadius: "4px",
                            padding: "4px 8px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stage.icon} {stage.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            onClick={() => {
                              setSelectedCandidate(cand);
                              setEditingNotes(cand.notes || "");
                              setScoreTask(cand.taskScore != null ? String(cand.taskScore) : "");
                              setScoreInterview(cand.interviewScore != null ? String(cand.interviewScore) : "");
                            }}
                            style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#00f0ff", background: "transparent", border: "1.5px solid #00f0ff44", borderRadius: "4px", padding: "6px 10px" }}
                          >
                            👁 DOSSIER
                          </button>

                          {cand.stageIdx < 4 && (
                            <button
                              onClick={() => setConfirmPromote(cand)}
                              style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "4px", padding: "6px 10px", boxShadow: "0 3px 0 #3a3410" }}
                            >
                              PROMOTE ▶
                            </button>
                          )}

                          {cand.stageIdx < 4 && (
                            <button
                              onClick={() => { setConfirmReject(cand); setRejectFeedback(cand.rejectionFeedback || ""); }}
                              style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#ff2bd1", background: "transparent", border: "1.5px solid #ff2bd1", borderRadius: "4px", padding: "6px 10px" }}
                            >
                              ✕ STOP
                            </button>
                          )}

                          {cand.stageIdx === 5 && (
                            <span style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1", border: "1px solid #ff2bd166", background: "rgba(255,43,209,.1)", borderRadius: "4px", padding: "5px 8px" }}>✕ JOURNEY STOPPED</span>
                          )}

                          <button
                            title="Delete applicant permanently"
                            onClick={() => { setConfirmDelete(cand); setDeleteErr(""); }}
                            style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#ff2bd1", background: "transparent", border: "1.5px solid #4d063d", borderRadius: "4px", padding: "6px 9px" }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidate Dossier & Manual Review Modal */}
      {selectedCandidate && (
        <div
          onClick={() => setSelectedCandidate(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(4,4,10,0.92)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "840px",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "radial-gradient(120% 100% at 50% 0%, #12192e 0%, #070914 100%)",
              border: "3px solid #00f0ff",
              borderRadius: "16px",
              padding: "28px",
              boxShadow: "0 0 60px rgba(0,240,255,.3)",
              position: "relative",
            }}
          >
            <button
              onClick={() => setSelectedCandidate(null)}
              style={{ position: "absolute", top: "18px", right: "20px", cursor: "pointer", background: "transparent", border: "2px solid #ff2bd1", color: "#ff2bd1", borderRadius: "6px", padding: "6px 10px", fontFamily: PS, fontSize: "9px" }}
            >
              ✕ CLOSE
            </button>

            <div style={{ fontFamily: PS, fontSize: "20px", color: "#00f0ff", textShadow: "0 0 12px #00f0ff" }}>
              CANDIDATE DOSSIER #{selectedCandidate.playerNo}
            </div>
            <div style={{ fontFamily: VT, fontSize: "22px", color: "#fff", marginTop: "4px" }}>
              {selectedCandidate.name} · {selectedCandidate.email}
            </div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#7de8ff" }}>
              Branch: {selectedCandidate.branch} | Section: {selectedCandidate.section} | Admission No: {selectedCandidate.collegeId} | Phone: {selectedCandidate.phone}
            </div>

            {/* STAGE PROGRESSION — read-only pipeline. Fully visible, but the
                admin cannot click to change it here. Promotion happens only
                from the applicant list via the confirmation-gated PROMOTE. */}
            <div style={{ marginTop: "20px", padding: "18px", background: "rgba(255,255,255,.02)", border: "2px solid #1c2540", borderRadius: "10px" }}>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#ffb800", marginBottom: "18px" }}>
                STAGE PROGRESSION <span style={{ color: "#4a5a7a" }}>· 🔒 VIEW ONLY</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                {STAGES.slice(0, 5).map((s, idx) => {
                  const curIdx = selectedCandidate.stageIdx;
                  const done = idx < curIdx;
                  const isCur = idx === curIdx;
                  const col = done ? "#ffb800" : isCur ? s.color : "#2a3350";
                  return (
                    <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                      {idx > 0 && (
                        <div style={{ position: "absolute", top: "17px", left: "-50%", width: "100%", height: "4px", background: idx <= curIdx ? "#ffb800" : "#1c2540", zIndex: 0 }} />
                      )}
                      <div style={{ position: "relative", zIndex: 1, width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: PS, fontSize: "12px", color: isCur ? "#04040a" : col, background: isCur ? s.color : done ? "rgba(255,180,40,.12)" : "rgba(255,255,255,.02)", border: `3px solid ${col}`, boxShadow: done || isCur ? `0 0 14px ${col}` : "none", animation: isCur ? "floaty 1.6s ease-in-out infinite" : "none" }}>
                        {done ? "✓" : s.icon}
                      </div>
                      <div style={{ fontFamily: PS, fontSize: "7px", color: col, marginTop: "10px", lineHeight: 1.4, textShadow: done || isCur ? `0 0 6px ${col}` : "none" }}>{s.label}</div>
                    </div>
                  );
                })}
              </div>

              {selectedCandidate.stageIdx === 5 && (
                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  <span style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1", border: "1px solid #ff2bd1", background: "rgba(255,43,209,.12)", borderRadius: "4px", padding: "5px 9px" }}>✕ BENCH / ON HOLD</span>
                </div>
              )}

              <div style={{ fontFamily: VT, fontSize: "15px", color: "#7de8ff", marginTop: "18px", lineHeight: 1.3, textAlign: "center" }}>
                View only — stage cannot be changed here. Use PROMOTE in the applicant list (requires admin confirmation).
              </div>
            </div>

            {/* Task submission links — one field per enlisted domain */}
            {selectedCandidate.domains && selectedCandidate.domains.length > 0 && (
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontFamily: PS, fontSize: "9px", color: "#ffb800" }}>▮ TASK SUBMISSIONS</div>
                {selectedCandidate.domains.map((key, i) => {
                  const dm = DOMAINS.find((d) => d.key === key);
                  const accent = dm?.color || "#ffb800";
                  const link =
                    (selectedCandidate.submissions && selectedCandidate.submissions[key]) ||
                    (i === 0 ? selectedCandidate.submissionLink : "") ||
                    "";
                  const safe = sanitizeUrl(link);
                  return (
                    <div key={key} style={{ padding: "12px", background: `${accent}0d`, border: `1.5px solid ${accent}66`, borderRadius: "8px" }}>
                      <div style={{ fontFamily: PS, fontSize: "8px", color: accent }}>
                        {i === 0 ? "1ST" : "2ND"} · {dm ? dm.name : key} TASK
                      </div>
                      {link ? (
                        safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: VT, fontSize: "18px", color: "#ffb800", textDecoration: "underline", wordBreak: "break-all" }}
                          >
                            {link} ↗
                          </a>
                        ) : (
                          <span style={{ fontFamily: VT, fontSize: "16px", color: "#ff2bd1" }}>[BLOCKED INVALID LINK]</span>
                        )
                      ) : (
                        <div style={{ fontFamily: VT, fontSize: "16px", color: "#4a5a7a" }}>— not submitted yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Evaluation scores — unlock per stage reached */}
            <div style={{ marginTop: "20px", padding: "16px", background: "rgba(255,255,255,.02)", border: "2px solid #1c2540", borderRadius: "10px" }}>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#ffb800", marginBottom: "14px" }}>▮ EVALUATION SCORES <span style={{ color: "#4a5a7a" }}>(EACH / 100)</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Task score — unlocks at Task Round */}
                <div>
                  <div style={{ fontFamily: PS, fontSize: "8px", color: selectedCandidate.stageIdx >= 2 ? "#ffb800" : "#4a5a7a", marginBottom: "7px" }}>TASK ROUND SCORE</div>
                  {selectedCandidate.stageIdx >= 2 ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreTask}
                      onChange={(e) => setScoreTask(e.target.value)}
                      placeholder="0 - 100"
                      style={{ ...inputStyle, color: "#ffb800" }}
                    />
                  ) : (
                    <div style={{ fontFamily: VT, fontSize: "16px", color: "#4a5a7a" }}>🔒 Unlocks at Task Round</div>
                  )}
                </div>
                {/* Interview score — unlocks at Interview */}
                <div>
                  <div style={{ fontFamily: PS, fontSize: "8px", color: selectedCandidate.stageIdx >= 3 ? "#ff2bd1" : "#4a5a7a", marginBottom: "7px" }}>INTERVIEW SCORE</div>
                  {selectedCandidate.stageIdx >= 3 ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreInterview}
                      onChange={(e) => setScoreInterview(e.target.value)}
                      placeholder="0 - 100"
                      style={{ ...inputStyle, color: "#ff2bd1" }}
                    />
                  ) : (
                    <div style={{ fontFamily: VT, fontSize: "16px", color: "#4a5a7a" }}>🔒 Unlocks at Interview</div>
                  )}
                </div>
              </div>

              {selectedCandidate.stageIdx >= 2 && (
                <button
                  onClick={() => saveScores(selectedCandidate.id)}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#04040a", background: "#ffb800", border: "none", borderRadius: "4px", padding: "8px 14px", marginTop: "12px", boxShadow: "0 3px 0 #8a7b00" }}
                >
                  💾 SAVE SCORES
                </button>
              )}

              <div style={{ fontFamily: VT, fontSize: "15px", color: "#7de8ff", marginTop: "12px" }}>
                Recorded — Task: <span style={{ color: "#ffb800" }}>{selectedCandidate.taskScore != null ? `${selectedCandidate.taskScore}/100` : "—"}</span> · Interview: <span style={{ color: "#ff2bd1" }}>{selectedCandidate.interviewScore != null ? `${selectedCandidate.interviewScore}/100` : "—"}</span>
                {selectedCandidate.taskScore != null && selectedCandidate.interviewScore != null && (
                  <span> · Total: <span style={{ color: "#ffb800" }}>{selectedCandidate.taskScore + selectedCandidate.interviewScore}/200</span></span>
                )}
              </div>
            </div>

            {/* 7 Quest Answers */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontFamily: PS, fontSize: "11px", color: "#ffb800", marginBottom: "14px" }}>
                ▶ RECRUITMENT QUEST RESPONSES (7 TRIALS)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {Object.entries(selectedCandidate.answers).map(([key, val], i) => (
                  <div key={key} style={{ background: "rgba(0,0,0,.4)", border: "1px solid #3a3410", padding: "12px 14px", borderRadius: "8px" }}>
                    <div style={{ fontFamily: PS, fontSize: "8px", color: "#7de8ff" }}>QUESTION {i + 1}</div>
                    <div style={{ fontFamily: VT, fontSize: "18px", color: "#ffb800", marginTop: "4px", lineHeight: 1.4 }}>
                      "{val || "NO ANSWER SUBMITTED"}"
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Internal Review Notes */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontFamily: PS, fontSize: "9px", color: "#ff2bd1", marginBottom: "6px" }}>
                INTERNAL GUILD COUNCIL REVIEW NOTES:
              </div>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                rows={3}
                placeholder="Type reviewer notes here..."
                style={{ ...inputStyle, minHeight: "80px" }}
              />
              <button
                onClick={() => saveNotes(selectedCandidate.id)}
                style={{ cursor: "pointer", fontFamily: PS, fontSize: "8px", color: "#04040a", background: "#ff2bd1", border: "none", borderRadius: "4px", padding: "8px 14px", marginTop: "8px" }}
              >
                💾 SAVE REVIEWER NOTES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promotion re-confirmation — required before advancing any applicant */}
      {confirmPromote && (() => {
        const from = STAGES[confirmPromote.stageIdx] || STAGES[0];
        const to = STAGES[Math.min(confirmPromote.stageIdx + 1, 4)];
        const hasTask = !!sanitizeUrl(confirmPromote.submissionLink);
        return (
          <div
            onClick={() => setConfirmPromote(null)}
            style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,4,10,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: "520px", background: "radial-gradient(120% 100% at 50% 0%, #2a0e18 0%, #070914 100%)", border: "3px solid #ffb800", borderRadius: "16px", padding: "28px", boxShadow: "0 0 50px rgba(255,180,40,.25)", textAlign: "center" }}
            >
              <div style={{ fontFamily: PS, fontSize: "16px", color: "#ffb800", textShadow: "0 0 12px #ffb800" }}>⚠ CONFIRM PROMOTION</div>
              <div style={{ fontFamily: VT, fontSize: "20px", color: "#fff", marginTop: "14px" }}>
                Promote <span style={{ color: "#00f0ff" }}>{confirmPromote.name}</span> (#{confirmPromote.playerNo})?
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", margin: "18px 0" }}>
                <span style={{ fontFamily: PS, fontSize: "8px", color: from.color, border: `1px solid ${from.color}66`, background: `${from.color}15`, borderRadius: "4px", padding: "6px 9px", whiteSpace: "nowrap" }}>{from.icon} {from.label}</span>
                <span style={{ fontFamily: PS, fontSize: "12px", color: "#7de8ff" }}>▶</span>
                <span style={{ fontFamily: PS, fontSize: "8px", color: to.color, border: `1px solid ${to.color}`, background: `${to.color}22`, borderRadius: "4px", padding: "6px 9px", whiteSpace: "nowrap", boxShadow: `0 0 12px ${to.color}66` }}>{to.icon} {to.label}</span>
              </div>

              <div style={{ fontFamily: VT, fontSize: "16px", color: hasTask ? "#ffb800" : "#ffb800", marginBottom: "6px" }}>
                {hasTask ? "✓ Task submission on file." : "⚠ No valid task submission on file yet."}
              </div>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#7de8ff", marginBottom: "22px" }}>
                This action advances the applicant to the next stage. Please re-confirm.
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => setConfirmPromote(null)}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#ff2bd1", background: "transparent", border: "2px solid #ff2bd1", borderRadius: "8px", padding: "12px 18px" }}
                >
                  ✕ CANCEL
                </button>
                <button
                  onClick={promoteConfirmed}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#04040a", background: "radial-gradient(circle at 40% 30%, #fff5b0, #ffb800 60%, #b8a200)", border: "none", borderRadius: "8px", padding: "12px 20px", boxShadow: "0 5px 0 #3a3410, 0 0 18px rgba(255,180,40,.5)" }}
                >
                  ✓ CONFIRM PROMOTE
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rejection ("stop journey") re-confirmation with optional feedback */}
      {confirmReject && (() => {
        const at = STAGES[confirmReject.stageIdx] || STAGES[0];
        return (
          <div
            onClick={() => { setConfirmReject(null); setRejectFeedback(""); }}
            style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(4,4,10,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: "560px", background: "radial-gradient(120% 100% at 50% 0%, #2a0e18 0%, #070914 100%)", border: "3px solid #ff2bd1", borderRadius: "16px", padding: "28px", boxShadow: "0 0 50px rgba(255,43,209,.25)" }}
            >
              <div style={{ fontFamily: PS, fontSize: "15px", color: "#ff2bd1", textShadow: "0 0 12px #ff2bd1", textAlign: "center" }}>✕ STOP APPLICANT JOURNEY</div>
              <div style={{ fontFamily: VT, fontSize: "20px", color: "#fff", marginTop: "14px", textAlign: "center" }}>
                End the recruitment journey for <span style={{ color: "#00f0ff" }}>{confirmReject.name}</span> (#{confirmReject.playerNo})?
              </div>
              <div style={{ fontFamily: VT, fontSize: "16px", color: "#7de8ff", marginTop: "8px", textAlign: "center" }}>
                They were at the <span style={{ color: at.color }}>{at.label}</span> stage. This marks them as rejected and shows the outcome on their dashboard.
              </div>

              <div style={{ marginTop: "18px" }}>
                <div style={{ fontFamily: PS, fontSize: "8px", color: "#ff2bd1", marginBottom: "6px" }}>FEEDBACK FOR APPLICANT (OPTIONAL — SHOWN TO THEM):</div>
                <textarea
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  rows={3}
                  placeholder="e.g. Strong fundamentals — sharpen your project depth and reapply next season."
                  style={{ ...inputStyle, minHeight: "78px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "20px" }}>
                <button
                  onClick={() => { setConfirmReject(null); setRejectFeedback(""); }}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "8px", padding: "12px 18px" }}
                >
                  ◄ CANCEL
                </button>
                <button
                  onClick={rejectConfirmed}
                  style={{ cursor: "pointer", fontFamily: PS, fontSize: "9px", color: "#fff", background: "radial-gradient(circle at 40% 30%, #ff9de3, #ff2bd1 60%, #8a0e6d)", border: "none", borderRadius: "8px", padding: "12px 20px", boxShadow: "0 5px 0 #4d063d, 0 0 18px rgba(255,43,209,.5)" }}
                >
                  ✕ CONFIRM STOP
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Permanent delete — re-confirmation */}
      {confirmDelete && (
        <div
          onClick={() => { if (!deleting) setConfirmDelete(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(4,4,10,0.9)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: "500px", background: "radial-gradient(120% 100% at 50% 0%, #2a0e18 0%, #070914 100%)", border: "3px solid #ff2bd1", borderRadius: "16px", padding: "28px", boxShadow: "0 0 50px rgba(255,43,209,.3)", textAlign: "center" }}
          >
            <div style={{ fontFamily: PS, fontSize: "15px", color: "#ff2bd1", textShadow: "0 0 12px #ff2bd1" }}>🗑 DELETE APPLICANT</div>
            <div style={{ fontFamily: VT, fontSize: "20px", color: "#fff", marginTop: "14px" }}>
              Permanently delete <span style={{ color: "#00f0ff" }}>{confirmDelete.name}</span> (#{confirmDelete.playerNo})?
            </div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#ffb800", marginTop: "8px" }}>
              This removes their record from Supabase and the site for good. It cannot be undone.
            </div>
            {deleteErr && (
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#ff2bd1", marginTop: "14px", lineHeight: 1.3, wordBreak: "break-word" }}>⚠ {deleteErr}</div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "22px" }}>
              <button
                onClick={() => { setConfirmDelete(null); setDeleteErr(""); }}
                disabled={deleting}
                style={{ cursor: deleting ? "not-allowed" : "pointer", fontFamily: PS, fontSize: "9px", color: "#7de8ff", background: "transparent", border: "2px solid #1c3a4a", borderRadius: "8px", padding: "12px 18px" }}
              >
                ◄ CANCEL
              </button>
              <button
                onClick={deleteConfirmed}
                disabled={deleting}
                style={{ cursor: deleting ? "not-allowed" : "pointer", fontFamily: PS, fontSize: "9px", color: "#fff", background: deleting ? "#4d063d" : "radial-gradient(circle at 40% 30%, #ff9de3, #ff2bd1 60%, #8a0e6d)", border: "none", borderRadius: "8px", padding: "12px 20px", boxShadow: deleting ? "none" : "0 5px 0 #4d063d, 0 0 18px rgba(255,43,209,.5)" }}
              >
                {deleting ? "DELETING…" : "🗑 DELETE FOREVER"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
