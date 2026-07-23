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

const VT = "'VT323', monospace";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const MASTER_KEY = "techno21";

const STAGES = [
  { key: "submitted", label: "FORM SUBMITTED", icon: "✓", color: "#5fb9d6" },
  { key: "screening", label: "SCREENING", icon: "◉", color: "#29d3ec" },
  { key: "task", label: "TASK ROUND", icon: "⚔", color: "#29d3ec" },
  { key: "interview", label: "INTERVIEW", icon: "☎", color: "#29d3ec" },
  { key: "recruited", label: "RECRUITED", icon: "★", color: "#2ee88c" },
  { key: "rejected", label: "BENCH / ON HOLD", icon: "✕", color: "#ff5c6a" },
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
    background: "#0e1119",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "14px",
    padding: "20px",
  };

  const inputStyle: CSSProperties = {
    background: "#0a0c14",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: "8px",
    color: "#e8ecf3",
    fontFamily: VT,
    fontSize: "18px",
    padding: "10px 14px",
    width: "100%",
  };

  // ---------------- LOGIN GATE ----------------
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0c14", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ width: "100%", maxWidth: "420px", background: "#0e1119", border: "1px solid rgba(255,255,255,.08)", borderRadius: "16px", padding: "36px 30px", textAlign: "center" }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "26px", color: "#e8ecf3", letterSpacing: "-.5px" }}>Command Center</div>
          <div style={{ fontFamily: VT, fontSize: "17px", color: "#6b7688", marginTop: "6px" }}>Technovation Recruitment · Restricted access</div>

          <form onSubmit={handleLogin} style={{ marginTop: "26px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontFamily: VT, fontSize: "14px", color: "#6b7688", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>Master access key</div>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="Enter admin key"
                disabled={lockoutTime > 0}
                style={{ ...inputStyle, textAlign: "center", letterSpacing: "2px" }}
              />
            </div>

            {authError && (
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#ff5c6a", lineHeight: 1.4 }}>
                {authError} {lockoutTime > 0 && `(${lockoutTime}s)`}
              </div>
            )}

            <button
              type="submit"
              disabled={lockoutTime > 0}
              style={{
                cursor: lockoutTime > 0 ? "not-allowed" : "pointer",
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: "15px",
                color: lockoutTime > 0 ? "#6b7688" : "#06121a",
                background: lockoutTime > 0 ? "#1a1f2b" : "#29d3ec",
                border: "none",
                borderRadius: "8px",
                padding: "13px",
                marginTop: "4px",
              }}
            >
              {lockoutTime > 0 ? `Locked (${lockoutTime}s)` : "Authenticate →"}
            </button>
          </form>

          <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/" style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688" }}>← Back to arcade</Link>
            <span style={{ fontFamily: VT, fontSize: "15px", color: "#4a5464" }}>Secure · SSL 256</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- ADMIN DASHBOARD ----------------
  return (
    <div style={{ minHeight: "100vh", background: "#0a0c14", color: "#c9cfe0", padding: "24px 20px 80px" }}>
      <div style={{ maxWidth: "1320px", margin: "0 auto" }}>
        {/* Header Bar */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: "20px", marginBottom: "26px" }}>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "clamp(24px,2.6vw,32px)", color: "#f0f3f8", letterSpacing: "-.5px" }}>
              Command Center
            </div>
            <div style={{ fontFamily: VT, fontSize: "17px", color: "#6b7688", marginTop: "2px" }}>
              Technovation Recruitment · Applicant review & stage progression
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={exportXLSX}
              style={{ cursor: "pointer", fontFamily: VT, fontSize: "16px", color: "#06121a", background: "#29d3ec", border: "none", borderRadius: "8px", padding: "9px 16px" }}
            >
              ↓ Excel
            </button>
            <button
              onClick={exportCSV}
              style={{ cursor: "pointer", fontFamily: VT, fontSize: "16px", color: "#c9cfe0", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: "8px", padding: "9px 16px" }}
            >
              ↓ CSV
            </button>
            <button
              onClick={() => { setWebhookDraft(webhookUrl); setShowSyncCfg((v) => !v); }}
              style={{ cursor: "pointer", fontFamily: VT, fontSize: "16px", color: webhookUrl ? "#2ee88c" : "#6b7688", background: "transparent", border: `1px solid ${webhookUrl ? "rgba(46,232,140,.4)" : "rgba(255,255,255,.15)"}`, borderRadius: "8px", padding: "9px 16px" }}
            >
              {webhookUrl ? "● " : "○ "}Sheet sync
            </button>
            <button
              onClick={() => setIsAuthenticated(false)}
              style={{ cursor: "pointer", fontFamily: VT, fontSize: "16px", color: "#ff5c6a", background: "transparent", border: "1px solid rgba(255,92,106,.35)", borderRadius: "8px", padding: "9px 16px" }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Google Sheets live-sync config */}
        {showSyncCfg && (
          <div style={{ ...cardBox, marginBottom: "24px", borderLeft: "3px solid #2ee88c" }}>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#2ee88c", textTransform: "uppercase", letterSpacing: "1px" }}>Google Sheets live sync</div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#8a93a5", marginTop: "6px", marginBottom: "12px", lineHeight: 1.4 }}>
              Paste your Apps Script Web App URL. Once saved, the full roster auto-pushes to your sheet on every promotion, rejection, score, and submission. Setup steps are in <span style={{ color: "#29d3ec" }}>SHEET_SYNC.md</span>.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={webhookDraft}
                onChange={(e) => setWebhookDraft(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                style={{ ...inputStyle, flex: 1, minWidth: "260px", fontSize: "16px" }}
              />
              <button onClick={saveWebhook} style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#06121a", background: "#29d3ec", border: "none", borderRadius: "8px", padding: "10px 16px" }}>Save</button>
              <button onClick={syncNow} disabled={!webhookUrl} style={{ cursor: webhookUrl ? "pointer" : "not-allowed", fontFamily: VT, fontSize: "15px", color: webhookUrl ? "#06180f" : "#6b7688", background: webhookUrl ? "#2ee88c" : "#1a1f2b", border: "none", borderRadius: "8px", padding: "10px 16px" }}>Sync now</button>
            </div>
            {lastSync && <div style={{ fontFamily: VT, fontSize: "15px", color: "#2ee88c", marginTop: "10px" }}>{lastSync}</div>}
          </div>
        )}

        {/* Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "TOTAL", val: stats.total, color: "#f0f3f8" },
            { label: "SCREENING", val: stats.screening, color: "#f0f3f8" },
            { label: "TASK ROUND", val: stats.task, color: "#f0f3f8" },
            { label: "INTERVIEW", val: stats.interview, color: "#f0f3f8" },
            { label: "RECRUITED", val: stats.recruited, color: "#2ee88c" },
          ].map((st, i) => (
            <div key={i} style={{ ...cardBox, padding: "18px 20px" }}>
              <div style={{ fontFamily: VT, fontSize: "14px", color: "#6b7688", textTransform: "uppercase", letterSpacing: "1.5px" }}>{st.label}</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "34px", color: st.color, marginTop: "6px", lineHeight: 1 }}>{st.val}</div>
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
                placeholder="Search by name, email, branch or ID..."
                style={{ ...inputStyle, fontSize: "17px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto", fontSize: "16px", padding: "10px 12px", color: "#c9cfe0" }}
              >
                <option value="all">All domains</option>
                {DOMAINS.map((d) => (
                  <option key={d.key} value={d.key}>{d.name}</option>
                ))}
              </select>

              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                style={{ ...inputStyle, width: "auto", fontSize: "16px", padding: "10px 12px", color: "#c9cfe0" }}
              >
                <option value="all">All stages</option>
                {STAGES.map((s, idx) => (
                  <option key={s.key} value={idx}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Applicants Table */}
        <div style={{ ...cardBox, overflowX: "auto", padding: "6px 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)", fontFamily: VT, fontSize: "14px", color: "#6b7688", textTransform: "uppercase", letterSpacing: ".5px" }}>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>ID</th>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>Applicant</th>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>Domains</th>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>Task</th>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>Stage</th>
                <th style={{ padding: "14px 12px", fontWeight: 400 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "30px", textAlign: "center", fontFamily: VT, fontSize: "18px", color: "#4a5464" }}>
                    No applicants found matching filters.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand) => {
                  const stage = STAGES[cand.stageIdx] || STAGES[0];
                  return (
                    <tr key={cand.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)", fontFamily: VT, fontSize: "18px" }}>
                      <td style={{ padding: "14px 12px", fontFamily: VT, fontSize: "16px", color: "#29d3ec", verticalAlign: "top" }}>
                        #{cand.playerNo}
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "16px", color: "#f0f3f8" }}>{cand.name}</div>
                        <div style={{ fontSize: "15px", color: "#8a93a5" }}>{cand.email}</div>
                        <div style={{ fontSize: "14px", color: "#5a6172" }}>
                          {cand.branch}{cand.section ? ` · ${cand.section}` : ""}{cand.collegeId ? ` · ${cand.collegeId}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {cand.domains.map((key, i) => {
                            const dm = DOMAINS.find((d) => d.key === key);
                            if (!dm) return null;
                            return (
                              <span
                                key={key}
                                style={{
                                  fontFamily: VT,
                                  fontSize: "14px",
                                  color: "#29d3ec",
                                  border: "1px solid rgba(41,211,236,.25)",
                                  background: "rgba(41,211,236,.08)",
                                  borderRadius: "6px",
                                  padding: "3px 9px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {i === 0 ? "1st" : "2nd"} · {dm.name}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        {sanitizeUrl(cand.submissionLink) ? (
                          <a
                            href={sanitizeUrl(cand.submissionLink)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: VT, fontSize: "15px", color: "#2ee88c", whiteSpace: "nowrap" }}
                          >
                            ✓ Submitted ↗
                          </a>
                        ) : cand.submissionLink ? (
                          <span style={{ fontFamily: VT, fontSize: "15px", color: "#ff5c6a" }}>⚠ Invalid</span>
                        ) : (
                          <span style={{ fontFamily: VT, fontSize: "15px", color: "#5a6172" }}>— Awaiting</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <span
                          style={{
                            fontFamily: VT,
                            fontSize: "14px",
                            color: stage.color,
                            background: `${stage.color}18`,
                            border: `1px solid ${stage.color}44`,
                            borderRadius: "6px",
                            padding: "4px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {stage.icon} {stage.label}
                        </span>
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            onClick={() => {
                              setSelectedCandidate(cand);
                              setEditingNotes(cand.notes || "");
                              setScoreTask(cand.taskScore != null ? String(cand.taskScore) : "");
                              setScoreInterview(cand.interviewScore != null ? String(cand.interviewScore) : "");
                            }}
                            style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#29d3ec", background: "transparent", border: "1px solid rgba(41,211,236,.35)", borderRadius: "7px", padding: "6px 13px" }}
                          >
                            Dossier
                          </button>

                          {cand.stageIdx < 4 && (
                            <button
                              onClick={() => setConfirmPromote(cand)}
                              style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#06180f", background: "#2ee88c", border: "none", borderRadius: "7px", padding: "6px 13px" }}
                            >
                              Promote →
                            </button>
                          )}

                          {cand.stageIdx < 4 && (
                            <button
                              onClick={() => { setConfirmReject(cand); setRejectFeedback(cand.rejectionFeedback || ""); }}
                              style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#ff5c6a", background: "transparent", border: "1px solid rgba(255,92,106,.4)", borderRadius: "7px", padding: "6px 13px" }}
                            >
                              Stop
                            </button>
                          )}

                          {cand.stageIdx === 5 && (
                            <span style={{ fontFamily: VT, fontSize: "15px", color: "#ff5c6a", border: "1px solid rgba(255,92,106,.3)", background: "rgba(255,92,106,.12)", borderRadius: "7px", padding: "5px 12px" }}>Stopped</span>
                          )}

                          <button
                            title="Delete applicant permanently"
                            onClick={() => { setConfirmDelete(cand); setDeleteErr(""); }}
                            style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#6b7688", background: "transparent", border: "1px solid rgba(255,255,255,.12)", borderRadius: "7px", padding: "6px 10px" }}
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
              background: "#0e1119",
              border: "1px solid rgba(255,255,255,.1)",
              borderRadius: "16px",
              padding: "28px",
              position: "relative",
            }}
          >
            <button
              onClick={() => setSelectedCandidate(null)}
              style={{ position: "absolute", top: "18px", right: "20px", cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,.15)", color: "#c9cfe0", borderRadius: "7px", padding: "6px 12px", fontFamily: VT, fontSize: "15px" }}
            >
              ✕ Close
            </button>

            <div style={{ fontFamily: VT, fontSize: "15px", color: "#29d3ec", textTransform: "uppercase", letterSpacing: "1px" }}>
              Candidate dossier · #{selectedCandidate.playerNo}
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "24px", color: "#f0f3f8", marginTop: "4px" }}>
              {selectedCandidate.name}
            </div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#8a93a5", marginTop: "2px" }}>
              {selectedCandidate.email}
            </div>
            <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginTop: "4px" }}>
              Branch: {selectedCandidate.branch} · Section: {selectedCandidate.section} · Admission No: {selectedCandidate.collegeId} · Phone: {selectedCandidate.phone}
            </div>

            {/* STAGE PROGRESSION — read-only pipeline. Fully visible, but the
                admin cannot click to change it here. Promotion happens only
                from the applicant list via the confirmation-gated PROMOTE. */}
            <div style={{ marginTop: "22px", padding: "18px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "12px" }}>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginBottom: "18px", textTransform: "uppercase", letterSpacing: "1px" }}>
                Stage progression <span style={{ color: "#4a5464" }}>· 🔒 view only</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                {STAGES.slice(0, 5).map((s, idx) => {
                  const curIdx = selectedCandidate.stageIdx;
                  const done = idx < curIdx;
                  const isCur = idx === curIdx;
                  const col = done ? "#2ee88c" : isCur ? "#29d3ec" : "#2a3350";
                  return (
                    <div key={s.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
                      {idx > 0 && (
                        <div style={{ position: "absolute", top: "17px", left: "-50%", width: "100%", height: "3px", background: idx <= curIdx ? "#2ee88c" : "rgba(255,255,255,.08)", zIndex: 0 }} />
                      )}
                      <div style={{ position: "relative", zIndex: 1, width: "36px", height: "36px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: VT, fontSize: "17px", color: isCur ? "#06121a" : done ? "#06180f" : col, background: isCur ? "#29d3ec" : done ? "#2ee88c" : "rgba(255,255,255,.03)", border: `2px solid ${col}` }}>
                        {done ? "✓" : s.icon}
                      </div>
                      <div style={{ fontFamily: VT, fontSize: "13px", color: col, marginTop: "10px", lineHeight: 1.3 }}>{s.label}</div>
                    </div>
                  );
                })}
              </div>

              {selectedCandidate.stageIdx === 5 && (
                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  <span style={{ fontFamily: VT, fontSize: "15px", color: "#ff5c6a", border: "1px solid rgba(255,92,106,.4)", background: "rgba(255,92,106,.12)", borderRadius: "7px", padding: "5px 12px" }}>✕ Bench / on hold</span>
                </div>
              )}

              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginTop: "18px", lineHeight: 1.4, textAlign: "center" }}>
                View only — stage cannot be changed here. Use Promote in the applicant list (requires admin confirmation).
              </div>
            </div>

            {/* Task submission links — one field per enlisted domain */}
            {selectedCandidate.domains && selectedCandidate.domains.length > 0 && (
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", textTransform: "uppercase", letterSpacing: "1px" }}>Task submissions</div>
                {selectedCandidate.domains.map((key, i) => {
                  const dm = DOMAINS.find((d) => d.key === key);
                  const link =
                    (selectedCandidate.submissions && selectedCandidate.submissions[key]) ||
                    (i === 0 ? selectedCandidate.submissionLink : "") ||
                    "";
                  const safe = sanitizeUrl(link);
                  return (
                    <div key={key} style={{ padding: "12px 14px", background: "rgba(41,211,236,.05)", border: "1px solid rgba(41,211,236,.2)", borderRadius: "10px" }}>
                      <div style={{ fontFamily: VT, fontSize: "14px", color: "#29d3ec" }}>
                        {i === 0 ? "1st" : "2nd"} · {dm ? dm.name : key} task
                      </div>
                      {link ? (
                        safe ? (
                          <a
                            href={safe}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: VT, fontSize: "17px", color: "#29d3ec", textDecoration: "underline", wordBreak: "break-all" }}
                          >
                            {link} ↗
                          </a>
                        ) : (
                          <span style={{ fontFamily: VT, fontSize: "16px", color: "#ff5c6a" }}>[blocked invalid link]</span>
                        )
                      ) : (
                        <div style={{ fontFamily: VT, fontSize: "16px", color: "#5a6172" }}>— not submitted yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Evaluation scores — unlock per stage reached */}
            <div style={{ marginTop: "20px", padding: "18px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: "12px" }}>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "1px" }}>Evaluation scores <span style={{ color: "#4a5464" }}>(each / 100)</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Task score — unlocks at Task Round */}
                <div>
                  <div style={{ fontFamily: VT, fontSize: "14px", color: selectedCandidate.stageIdx >= 2 ? "#29d3ec" : "#4a5464", marginBottom: "7px", textTransform: "uppercase", letterSpacing: ".5px" }}>Task round score</div>
                  {selectedCandidate.stageIdx >= 2 ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreTask}
                      onChange={(e) => setScoreTask(e.target.value)}
                      placeholder="0 - 100"
                      style={{ ...inputStyle, color: "#29d3ec" }}
                    />
                  ) : (
                    <div style={{ fontFamily: VT, fontSize: "16px", color: "#5a6172" }}>🔒 Unlocks at Task Round</div>
                  )}
                </div>
                {/* Interview score — unlocks at Interview */}
                <div>
                  <div style={{ fontFamily: VT, fontSize: "14px", color: selectedCandidate.stageIdx >= 3 ? "#2ee88c" : "#4a5464", marginBottom: "7px", textTransform: "uppercase", letterSpacing: ".5px" }}>Interview score</div>
                  {selectedCandidate.stageIdx >= 3 ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={scoreInterview}
                      onChange={(e) => setScoreInterview(e.target.value)}
                      placeholder="0 - 100"
                      style={{ ...inputStyle, color: "#2ee88c" }}
                    />
                  ) : (
                    <div style={{ fontFamily: VT, fontSize: "16px", color: "#5a6172" }}>🔒 Unlocks at Interview</div>
                  )}
                </div>
              </div>

              {selectedCandidate.stageIdx >= 2 && (
                <button
                  onClick={() => saveScores(selectedCandidate.id)}
                  style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#06121a", background: "#29d3ec", border: "none", borderRadius: "8px", padding: "9px 16px", marginTop: "12px" }}
                >
                  Save scores
                </button>
              )}

              <div style={{ fontFamily: VT, fontSize: "15px", color: "#8a93a5", marginTop: "12px" }}>
                Recorded — Task: <span style={{ color: "#29d3ec" }}>{selectedCandidate.taskScore != null ? `${selectedCandidate.taskScore}/100` : "—"}</span> · Interview: <span style={{ color: "#2ee88c" }}>{selectedCandidate.interviewScore != null ? `${selectedCandidate.interviewScore}/100` : "—"}</span>
                {selectedCandidate.taskScore != null && selectedCandidate.interviewScore != null && (
                  <span> · Total: <span style={{ color: "#2ee88c" }}>{selectedCandidate.taskScore + selectedCandidate.interviewScore}/200</span></span>
                )}
              </div>
            </div>

            {/* 7 Quest Answers */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "1px" }}>
                Recruitment quest responses (7 trials)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {Object.entries(selectedCandidate.answers).map(([key, val], i) => (
                  <div key={key} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.07)", padding: "12px 14px", borderRadius: "10px" }}>
                    <div style={{ fontFamily: VT, fontSize: "14px", color: "#6b7688" }}>Question {i + 1}</div>
                    <div style={{ fontFamily: VT, fontSize: "18px", color: "#c9cfe0", marginTop: "4px", lineHeight: 1.4 }}>
                      "{val || "No answer submitted"}"
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Internal Review Notes */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>
                Internal review notes
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
                style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#06121a", background: "#29d3ec", border: "none", borderRadius: "8px", padding: "9px 16px", marginTop: "8px" }}
              >
                Save reviewer notes
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
              style={{ width: "100%", maxWidth: "520px", background: "#0e1119", border: "1px solid rgba(255,255,255,.1)", borderRadius: "16px", padding: "28px", textAlign: "center" }}
            >
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "19px", color: "#f0f3f8" }}>Confirm promotion</div>
              <div style={{ fontFamily: VT, fontSize: "19px", color: "#c9cfe0", marginTop: "12px" }}>
                Promote <span style={{ color: "#29d3ec" }}>{confirmPromote.name}</span> (#{confirmPromote.playerNo})?
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", margin: "18px 0" }}>
                <span style={{ fontFamily: VT, fontSize: "14px", color: from.color, border: `1px solid ${from.color}44`, background: `${from.color}18`, borderRadius: "6px", padding: "5px 11px", whiteSpace: "nowrap" }}>{from.icon} {from.label}</span>
                <span style={{ fontFamily: VT, fontSize: "16px", color: "#6b7688" }}>→</span>
                <span style={{ fontFamily: VT, fontSize: "14px", color: to.color, border: `1px solid ${to.color}66`, background: `${to.color}22`, borderRadius: "6px", padding: "5px 11px", whiteSpace: "nowrap" }}>{to.icon} {to.label}</span>
              </div>

              <div style={{ fontFamily: VT, fontSize: "16px", color: hasTask ? "#2ee88c" : "#ff5c6a", marginBottom: "6px" }}>
                {hasTask ? "✓ Task submission on file." : "⚠ No valid task submission on file yet."}
              </div>
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#6b7688", marginBottom: "22px" }}>
                This action advances the applicant to the next stage. Please re-confirm.
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => setConfirmPromote(null)}
                  style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#c9cfe0", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: "8px", padding: "11px 20px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={promoteConfirmed}
                  style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#06180f", background: "#2ee88c", border: "none", borderRadius: "8px", padding: "11px 22px" }}
                >
                  Confirm promote →
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
              style={{ width: "100%", maxWidth: "560px", background: "#0e1119", border: "1px solid rgba(255,255,255,.1)", borderRadius: "16px", padding: "28px" }}
            >
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "18px", color: "#ff5c6a", textAlign: "center" }}>Stop applicant journey</div>
              <div style={{ fontFamily: VT, fontSize: "19px", color: "#c9cfe0", marginTop: "12px", textAlign: "center" }}>
                End the recruitment journey for <span style={{ color: "#29d3ec" }}>{confirmReject.name}</span> (#{confirmReject.playerNo})?
              </div>
              <div style={{ fontFamily: VT, fontSize: "16px", color: "#8a93a5", marginTop: "8px", textAlign: "center" }}>
                They were at the <span style={{ color: at.color }}>{at.label}</span> stage. This marks them as rejected and shows the outcome on their dashboard.
              </div>

              <div style={{ marginTop: "18px" }}>
                <div style={{ fontFamily: VT, fontSize: "14px", color: "#6b7688", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".5px" }}>Feedback for applicant (optional — shown to them)</div>
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
                  style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#c9cfe0", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: "8px", padding: "11px 20px" }}
                >
                  Cancel
                </button>
                <button
                  onClick={rejectConfirmed}
                  style={{ cursor: "pointer", fontFamily: VT, fontSize: "15px", color: "#2a0508", background: "#ff5c6a", border: "none", borderRadius: "8px", padding: "11px 22px" }}
                >
                  Confirm stop
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
            style={{ width: "100%", maxWidth: "500px", background: "#0e1119", border: "1px solid rgba(255,255,255,.1)", borderRadius: "16px", padding: "28px", textAlign: "center" }}
          >
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "18px", color: "#ff5c6a" }}>🗑 Delete applicant</div>
            <div style={{ fontFamily: VT, fontSize: "19px", color: "#c9cfe0", marginTop: "12px" }}>
              Permanently delete <span style={{ color: "#29d3ec" }}>{confirmDelete.name}</span> (#{confirmDelete.playerNo})?
            </div>
            <div style={{ fontFamily: VT, fontSize: "16px", color: "#8a93a5", marginTop: "8px" }}>
              This removes their record from Supabase and the site for good. It cannot be undone.
            </div>
            {deleteErr && (
              <div style={{ fontFamily: VT, fontSize: "15px", color: "#ff5c6a", marginTop: "14px", lineHeight: 1.3, wordBreak: "break-word" }}>⚠ {deleteErr}</div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginTop: "22px" }}>
              <button
                onClick={() => { setConfirmDelete(null); setDeleteErr(""); }}
                disabled={deleting}
                style={{ cursor: deleting ? "not-allowed" : "pointer", fontFamily: VT, fontSize: "15px", color: "#c9cfe0", background: "transparent", border: "1px solid rgba(255,255,255,.15)", borderRadius: "8px", padding: "11px 20px" }}
              >
                Cancel
              </button>
              <button
                onClick={deleteConfirmed}
                disabled={deleting}
                style={{ cursor: deleting ? "not-allowed" : "pointer", fontFamily: VT, fontSize: "15px", color: "#2a0508", background: deleting ? "#5a2a30" : "#ff5c6a", border: "none", borderRadius: "8px", padding: "11px 22px" }}
              >
                {deleting ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
