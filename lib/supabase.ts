import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client.
 *
 * Reads its credentials from environment variables. If they aren't set, the
 * app runs exactly as before (local-only) — `isSupabaseConfigured` stays false
 * and the cloud-sync layer stays inert. Add the two vars to .env.local to turn
 * on cross-device storage + real-time sync:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Accept either the classic anon key or the new publishable key, under either
// common env-var name.
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, key as string, {
      auth: {
        // Applicants authenticate with a PIN, not a Supabase session. The only
        // Supabase Auth session that ever exists is the short-lived one created
        // by a PIN-reset magic link, and it's discarded immediately after.
        persistSession: false,

        // The reset link lands back on the site carrying its tokens in the URL.
        // detectSessionInUrl picks them up so the app knows the mailbox was
        // verified.
        detectSessionInUrl: true,

        // Implicit, NOT the default PKCE. PKCE stores a code verifier in
        // localStorage and reads it back after the redirect — but with
        // persistSession off there's nothing to read it from, so the callback
        // would fail. Implicit puts the tokens straight in the URL fragment,
        // which works without any stored state.
        flowType: "implicit",
      },
    })
  : null;
