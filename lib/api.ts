/**
 * Server-side data access.
 *
 * The `candidates` table is no longer readable or writable with the anon key —
 * RLS denies all direct access (see section 8 of supabase/schema_live.sql).
 * Every operation goes through a SECURITY DEFINER function so that PIN and
 * admin-key checks happen in the database, where the browser can't skip them.
 *
 * Two consequences worth remembering when editing this file:
 *   - Never add a `.from("candidates")` call back into client code.
 *   - An applicant can only ever receive their own row; the admin listing is
 *     gated on a key that is verified server-side and never shipped in the JS.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

export type Json = Record<string, any>;

/** Turns a Postgres error into a short, user-facing code. */
function codeOf(err: unknown): string {
  const msg = String((err as any)?.message || err || "");
  const m = msg.match(/RATE_LIMITED_(\d+)/);
  if (m) return `RATE_LIMITED:${m[1]}`;
  for (const c of [
    "ALREADY_REGISTERED",
    "BAD_EMAIL_DOMAIN",
    "BAD_PIN_FORMAT",
    "AUTH_FAILED",
    "NOT_VERIFIED",
    "NO_SUCH_APPLICANT",
    "ADMIN_KEY_NOT_SET",
  ]) {
    if (msg.includes(c)) return c;
  }
  return "ERROR";
}

export class ApiError extends Error {
  code: string;
  /** Seconds remaining, when code is RATE_LIMITED. */
  retryIn: number;
  /** The raw provider message. Mapping everything to a generic code made real
   *  failures (bad SMTP, un-allow-listed redirect URL, provider limits) look
   *  identical in the UI and impossible to diagnose. */
  detail: string;
  constructor(code: string, detail = "") {
    super(detail || code);
    this.code = code.split(":")[0];
    this.retryIn = Number(code.split(":")[1] || 0);
    this.detail = detail;
  }
}

async function rpc<T>(fn: string, args: Json): Promise<T> {
  if (!isSupabaseConfigured || !supabase) throw new ApiError("OFFLINE");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[api] ${fn} failed:`, error);
    throw new ApiError(codeOf(error), error.message || String(error));
  }
  return data as T;
}

/* ------------------------------- counters ------------------------------ */

/**
 * Aggregate counts only — safe to call without any credentials. This is the
 * single source of truth for the "LIVE REGISTRATIONS" figure, so every device
 * shows the same number.
 */
export async function stats(): Promise<{ registrations: number; recruited: number }> {
  try {
    const d = await rpc<{ registrations: number; recruited: number }>("app_stats", {});
    return { registrations: d?.registrations ?? 0, recruited: d?.recruited ?? 0 };
  } catch {
    return { registrations: 0, recruited: 0 };
  }
}

/* ------------------------------ applicant ------------------------------ */

/** Verify a PIN. Returns the applicant's own row, or null if wrong. */
export async function login(email: string, pin: string): Promise<Json | null> {
  return rpc<Json | null>("app_login", { p_email: email, p_pin: pin });
}

/** First-time registration. Throws ALREADY_REGISTERED if the email is taken. */
export async function register(email: string, pin: string, payload: Json): Promise<Json> {
  return rpc<Json>("app_register", { p_email: email, p_pin: pin, p_payload: payload });
}

/** Save applicant-editable fields only (task links, and answers while unlocked). */
export async function save(email: string, pin: string, payload: Json): Promise<Json> {
  return rpc<Json>("app_save", { p_email: email, p_pin: pin, p_payload: payload });
}

/* --------------------------- PIN reset via OTP -------------------------- */

/**
 * Step 1 — email a one-time code. `shouldCreateUser` is on so an applicant who
 * has never used Supabase Auth can still receive one; the reset itself checks
 * that a matching applicant row exists.
 */
export async function sendResetCode(email: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new ApiError("OFFLINE");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    // Deliberately NO emailRedirectTo. Supabase rejects the whole request if the
    // URL isn't in the project's Redirect URLs allow-list, and this flow never
    // follows a link — the applicant types the 6-digit code. Passing it only
    // created a way for sending to fail. Fix the emailed link, if any, via
    // Authentication -> URL Configuration -> Site URL instead.
    options: { shouldCreateUser: true },
  });
  if (error) {
    console.error("[api] signInWithOtp failed:", error);
    throw new ApiError(codeOf(error), error.message || String(error));
  }
}

/** Step 2 — exchange the emailed code for a verified session. */
export async function verifyResetCode(email: string, token: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new ApiError("OFFLINE");
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) {
    console.error("[api] verifyOtp failed:", error);
    throw new ApiError(codeOf(error), error.message || String(error));
  }
}

/**
 * Step 3 — set the new PIN. The database reads the address out of the verified
 * JWT rather than trusting anything the browser sends, so this only ever
 * changes the PIN of the mailbox that received the code.
 */
export async function resetPin(newPin: string): Promise<void> {
  await rpc<boolean>("app_reset_pin", { p_new_pin: newPin });
  if (supabase) await supabase.auth.signOut(); // recovery session isn't needed after this
}

/* -------------------------------- admin -------------------------------- */

export async function adminAll(key: string): Promise<Json[]> {
  return (await rpc<Json[]>("app_admin_all", { p_key: key })) || [];
}

export async function adminWrite(key: string, email: string, patch: Json): Promise<Json> {
  return rpc<Json>("app_admin_write", { p_key: key, p_email: email, p_patch: patch });
}

export async function adminDelete(key: string, email: string): Promise<void> {
  await rpc<boolean>("app_admin_delete", { p_key: key, p_email: email });
}
