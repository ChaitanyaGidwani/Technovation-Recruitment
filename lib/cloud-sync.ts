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
    // The server strips the real hash and sends `has_pin` instead. The sentinel
    // keeps the "account activated?" checks (which only test truthiness) working
    // without the hash ever reaching the browser.
    pinHash: r.pin_hash || (r.has_pin ? "set" : ""),
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
    // The single team a selected member was assigned to. Distinct from
    // `domains`, which stays as the two they applied for.
    department: r.department ?? undefined,
    // Drafted-but-unreleased decision. Only ever populated for the admin
    // listing — _cand_public strips these, so an applicant's own row can
    // never carry them.
    pendingStageIdx: r.pending_stage_idx ?? undefined,
    pendingRejected: r.pending_rejected ?? undefined,
    pendingRejectedAtStage: r.pending_rejected_at_stage ?? undefined,
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

// Emails we've confirmed exist(ed) in the cloud — lets us tell a brand-new
// local registration (keep) apart from a row deleted in Supabase (drop).
const PUSHED_KEY = "tech_pushed_emails";
function readPushed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PUSHED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function writePushed(s: Set<string>) {
  try {
    localStorage.setItem(PUSHED_KEY, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
}
function addPushed(emails: string[]) {
  const s = readPushed();
  emails.forEach((e) => e && s.add(e.toLowerCase()));
  writePushed(s);
}

// Reconcile cloud + local so DELETES in Supabase propagate:
//  • row in cloud                         → cloud wins
//  • local-only + previously in cloud     → deleted upstream → drop it
//  • local-only + never in cloud          → new registration → keep it
function reconcile(cloud: Cand[], local: Cand[]): Cand[] {
  const pushed = readPushed();
  const cloudEmails = new Set(cloud.map((c) => String(c.email).toLowerCase()));
  const result: Cand[] = [...cloud];
  const nextPushed = new Set(pushed);
  cloudEmails.forEach((e) => nextPushed.add(e));

  local.forEach((c) => {
    const k = String(c.email || "").toLowerCase();
    if (!k || cloudEmails.has(k)) return;   // already represented by the cloud row
    if (pushed.has(k)) {                     // was in cloud, now gone → deleted
      nextPushed.delete(k);
      return;
    }
    result.push(c);                          // never pushed → keep (new)
  });

  writePushed(nextPushed);
  return result;
}

let lastHash = "";
let started = false;

const log = (...a: unknown[]) => console.info("%c[cloud-sync]", "color:#39ff14", ...a);
const warn = (...a: unknown[]) => console.warn("[cloud-sync]", ...a);

/** Exposed so the admin panel can map server rows into the UI shape. */
export { candFromRow, rowFromCand };

/**
 * DISABLED BY DESIGN.
 *
 * This used to `select("*")` the whole `candidates` table on every page load
 * and mirror it into localStorage — which meant any visitor's browser held
 * every applicant's email, phone, admission number, answers and pin_hash.
 * That single call was what made the PIN and the phone-based reset pointless.
 *
 * The table now denies direct anon access entirely. Data flows explicitly:
 *   - applicants  → lib/api.ts login/register/save (PIN verified in Postgres)
 *   - admin panel → lib/api.ts adminAll/adminWrite/adminDelete (key verified
 *                   in Postgres, never shipped in the bundle)
 *
 * Kept as a no-op so the existing <CloudSync /> mount stays harmless.
 */
export function initCloudSync(): void {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;
  void lastHash;
  void reconcile;
  void readLocal;
  void writeLocal;
  void addPushed;
  void isSupabaseConfigured;
  void supabase;
  void warn;
  log("global table sync is disabled — data now flows through server-side RPCs");
}
