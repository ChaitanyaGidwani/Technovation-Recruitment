/**
 * Supabase — STUBBED for now.
 *
 * The frontend currently runs fully client-side with no backend, so there are
 * no live database calls. When you're ready to wire persistence back in:
 *   1. npm install @supabase/supabase-js
 *   2. add NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local
 *   3. run supabase/schema.sql in your project
 *   4. replace the stub below with the real client:
 *
 *      import { createClient } from "@supabase/supabase-js";
 *      export const supabase = createClient(
 *        process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 *      );
 */

const ok = (data: unknown = null) =>
  Promise.resolve({ data, error: null as null });

export const supabase = {
  from() {
    return {
      insert: () => ok(null),
      select: () => ok([]),
      update: () => ok(null),
    };
  },
  rpc: () => ok(null),
};
