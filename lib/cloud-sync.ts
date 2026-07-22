import { supabase, isSupabaseConfigured } from "./supabase";

/**
 * Two-way cloud sync.
 *
 * The whole app already uses the localStorage key `tech_candidates_admin`
 * (an array of candidate objects) as its in-browser source of truth, and both
 * the candidate HQ and the admin already react to `storage` events + polling.
 *
 * This layer mirrors that array to a Supabase `candidates` table and back:
 *   • on load  → pull cloud rows, merge into localStorage (migrates existing data up)
 *   • on change → push localStorage up (debounced)
 *   • realtime → cloud changes flow back into localStorage, and the app's
 *                existing listeners re-render automatically.
 *
 * Nothing in the page/admin business logic has to change. If Supabase isn't
 * configured, this is a no-op and the app stays purely local.
 */

const KEY = "tech_candidates_admin";
type Cand = Record<string, any>;

// ---- object <-> row mapping (readable columns in the Supabase table) ----
function rowFromCand(c: Cand) {
  const doms: string[] = c.domains ?? [];
  const subs: Record<string, string> = c.submissions ?? {};
  const link1 = subs[doms[0]] || c.submissionLink || null;
  const link2 = subs[doms[1]] || null;
  return {
    email: String(c.email || "").toLowerCase(),
    app_id: c.id ?? null,
    player_no: c.playerNo ?? null,
    name: c.name ?? "",
    branch: c.branch ?? "",
    section: c.section ?? "",
    phone: c.phone ?? "",
    college_id: c.collegeId ?? "",
    domains: doms,
    answers: c.answers ?? {},
    pin_hash: c.pinHash ?? "",
    stage_idx: c.stageIdx ?? 1,
    sub_link_1: link1,   // 1st-domain task submission
    sub_link_2: link2,   // 2nd-domain task submission
    task_score: c.taskScore ?? null,
    interview_score: c.interviewScore ?? null,
    rejected: !!c.rejected,
    rejected_at_stage: c.rejectedAtStage ?? null,
    rejection_feedback: c.rejectionFeedback ?? null,
    notes: c.notes ?? null,
    client_updated_at: Date.now(),
  };
}

function candFromRow(r: Cand): Cand {
  return {
    id: r.app_id || `cand-${r.email}`,
    playerNo: r.player_no ?? 1001,
    name: r.name || "",
    email: r.email || "",
    branch: r.branch || "",
    section: r.section || "",
    phone: r.phone || "",
    collegeId: r.college_id || "",
    domains: r.domains || [],
    answers: r.answers || {},
    pinHash: r.pin_hash || "",
    stageIdx: r.stage_idx ?? 1,
    submissions: (() => {
      const doms: string[] = r.domains || [];
      const m: Record<string, string> = {};
      if (doms[0] && r.sub_link_1) m[doms[0]] = r.sub_link_1;
      if (doms[1] && r.sub_link_2) m[doms[1]] = r.sub_link_2;
      return m;
    })(),
    submissionLink: r.sub_link_1 || undefined,
    taskScore: r.task_score ?? undefined,
    interviewScore: r.interview_score ?? undefined,
    rejected: !!r.rejected,
    rejectedAtStage: r.rejected_at_stage ?? undefined,
    rejectionFeedback: r.rejection_feedback ?? undefined,
    notes: r.notes ?? undefined,
    updatedAt: "SYNCED",
  };
}

function readLocal(): Cand[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(list: Cand[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  // storage events don't fire in the same tab — nudge the app's listeners.
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  } catch {
    /* older browsers */
  }
}

// Merge cloud rows with any local-only (not-yet-pushed) rows, cloud wins.
function merge(cloud: Cand[], local: Cand[]): Cand[] {
  const byEmail: Record<string, Cand> = {};
  cloud.forEach((c) => { byEmail[String(c.email).toLowerCase()] = c; });
  local.forEach((c) => {
    const k = String(c.email || "").toLowerCase();
    if (k && !byEmail[k]) byEmail[k] = c;
  });
  return Object.values(byEmail);
}

let lastHash = "";
let started = false;

const log = (...a: unknown[]) => console.info("%c[cloud-sync]", "color:#39ff14", ...a);
const warn = (...a: unknown[]) => console.warn("[cloud-sync]", ...a);

export function initCloudSync(): void {
  if (typeof window === "undefined") return;
  if (!isSupabaseConfigured || !supabase) {
    warn("Supabase not configured — running local-only. Set NEXT_PUBLIC_SUPABASE_URL and a key in .env.local, then restart.");
    return;
  }
  if (started) return;
  started = true;
  const sb = supabase;
  log("starting… syncing localStorage <-> Supabase 'candidates' table");

  const pullMerge = async () => {
    try {
      const { data, error } = await sb.from("candidates").select("*");
      if (error) {
        warn("read failed:", error.message || error);
        return;
      }
      const merged = merge((data || []).map(candFromRow), readLocal());
      const h = JSON.stringify(merged);
      if (h !== JSON.stringify(readLocal())) {
        lastHash = h; // set before write so our own storage event doesn't re-push
        writeLocal(merged);
        log("pulled", (data || []).length, "cloud rows → local now has", merged.length);
      } else {
        lastHash = h;
      }
    } catch (e) {
      warn("read error:", e);
    }
  };

  const pushLocal = async () => {
    const local = readLocal();
    const h = JSON.stringify(local);
    if (h === lastHash) return;
    lastHash = h;
    if (!local.length) return;
    try {
      const rows = local.map(rowFromCand);
      const { error } = await sb.from("candidates").upsert(rows, { onConflict: "email" });
      if (error) warn("write failed:", error.message || error);
      else log("pushed", rows.length, "rows to Supabase");
    } catch (e) {
      warn("write error:", e);
    }
  };

  // 1) initial pull (migrates any existing local data up), then continuous push
  pullMerge().then(pushLocal);

  const iv = window.setInterval(pushLocal, 2500);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) pushLocal(); };
  window.addEventListener("storage", onStorage);

  // 2) realtime: any cloud change → refresh local
  sb.channel("candidates-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, pullMerge)
    .subscribe((status) => log("realtime channel:", status));

  window.addEventListener("beforeunload", () => {
    window.clearInterval(iv);
    window.removeEventListener("storage", onStorage);
  });
}
