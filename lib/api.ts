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

/* --------------------------- registration gate -------------------------- */

/**
 * Are new registrations being accepted?
 *
 * Only for choosing what to render — the real gate is inside app_register, so
 * a paused drive can't be bypassed by calling the RPC directly. Defaults to
 * open if the server can't be reached, so a network blip never wrongly tells
 * applicants that registration has closed.
 */
export async function registrationsOpen(): Promise<boolean> {
  try {
    const v = await rpc<boolean>("app_registrations_open", {});
    return v !== false;
  } catch {
    return true;
  }
}

/* ------------------------------ applicant ------------------------------ */

// NOTE: there was a stats() helper here backing the "LIVE REGISTRATIONS"
// counter. The counter was removed from the UI, so the wrapper went with it
// rather than sitting unused. The app_stats() function still exists in the
// database — re-add a thin wrapper here if the counter ever comes back.

/**
 * Has this email already completed registration?
 *
 * Checked against the server before starting the form, because the old check
 * read localStorage — which is empty on any other device, so a returning
 * applicant was walked through the entire application again only to be
 * rejected at the very last step.
 *
 * Returns a bare boolean: no name, answers or hash.
 */
export async function isRegistered(email: string): Promise<boolean | null> {
  try {
    return !!(await rpc<boolean>("app_is_registered", { p_email: email }));
  } catch {
    // null = "couldn't find out", NOT "no". This used to return false on any
    // error, which the PIN-reset flow read as "no application exists" — so a
    // momentary network blip told a genuinely registered applicant that they
    // had never registered. Each caller now picks its own safe direction.
    return null;
  }
}

/** Verify a PIN. Returns the applicant's own row, or null if wrong. */
export async function login(email: string, pin: string): Promise<Json | null> {
  return rpc<Json | null>("app_login", { p_email: email, p_pin: pin });
}

/** First-time registration. Throws ALREADY_REGISTERED if the email is taken. */
export async function register(email: string, pin: string, payload: Json): Promise<Json> {
  return rpc<Json>("app_register", { p_email: email, p_pin: pin, p_payload: payload });
}

/**
 * Save applicant-editable fields. app_save permits `answers` only while
 * stage_idx <= 1, so this can complete an application that has none on file
 * but can never rewrite answers once someone has been shortlisted.
 */
export async function save(email: string, pin: string, payload: Json): Promise<Json> {
  return rpc<Json>("app_save", { p_email: email, p_pin: pin, p_payload: payload });
}

/* --------------------------- PIN reset via OTP -------------------------- */

/**
 * Step 1 — email a one-time code. `shouldCreateUser` is on so an applicant who
 * has never used Supabase Auth can still receive one; the reset itself checks
 * that a matching applicant row exists.
 */
export async function sendResetLink(email: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new ApiError("OFFLINE");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      // Where the link should land. Supabase falls back to the project's Site
      // URL when this is omitted — which ships as http://localhost:3000, so
      // production emails sent applicants to a page on their own machine.
      // NOTE: this origin must be listed under Authentication → URL
      // Configuration → Redirect URLs, or Supabase rejects the send outright.
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) {
    console.error("[api] signInWithOtp failed:", error);
    throw new ApiError(codeOf(error), error.message || String(error));
  }
}

/**
 * Step 2 — did the applicant arrive back here via a valid reset link?
 *
 * The Supabase client parses the tokens out of the URL on load, so a session
 * existing here means this browser proved it can read that mailbox. Returns the
 * verified address, or null when there's no session.
 */
export async function getVerifiedEmail(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.email?.toLowerCase() || null;
  } catch {
    return null;
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

/**
 * Drop any Supabase Auth session. One is created whenever an applicant uses
 * Forgot PIN, and it would otherwise outlive a logout.
 */
export async function signOut(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch {
    /* nothing useful to do — the local clear below is what matters */
  }
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

/** Open or pause new registrations. Admin-key gated in the database. */
export async function adminSetRegistrations(key: string, open: boolean): Promise<boolean> {
  return rpc<boolean>("app_set_registrations", { p_key: key, p_open: open });
}
