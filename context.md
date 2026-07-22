# context.md — Technovation Recruitment (Agent Handoff Doc)

> Single source of truth for anyone (human or AI agent) picking up this project.
> Read this before editing. Last updated: 2026-07-22.

---

## 1. What this project is

An **8-bit arcade–themed recruitment portal** for **TECHNOVATION**, the
Networking Club of ABES Engineering College. Candidates "insert a coin," pick
two guild domains, forge an RPG character (the application form), get an arcade
"Player ID" pass, and track their recruitment journey from a **Player HQ**
dashboard. A separate **Guild Council admin panel** lets recruiters review,
score, promote, and reject applicants.

The whole UI is a deliberate retro CRT/arcade aesthetic (scanlines, neon,
`Press Start 2P` + `VT323` fonts, joystick, pixel avatars). It was originally
ported 1:1 from a bundled design artifact.

**Two audiences / two surfaces:**
- **Candidates** → `/` (arcade SPA) and `/process` (info page).
- **Recruiters** → `/admin` (Guild Council Command Center).

---

## 2. Tech stack

- **Next.js 14.2.35** (App Router) + **React 18** + **TypeScript**.
- **Framer Motion** (animations, mainly on `/process` and small touches).
- **Tailwind** is installed but **barely used** — almost all styling is
  **inline styles** (CRT look needs precise per-element control). A few
  responsive helper classes live in `app/globals.css`
  (`.player-form-grid`, `.class-select-grid`, `.crt-domain-grid`, `.hook-form-inputs`).
- **Supabase** (Postgres) for optional cloud persistence + realtime.
- Data store today is **browser `localStorage`**, mirrored to Supabase by a
  sync layer (see §6). No traditional server/API routes.
- Fonts loaded via a `<link>` in `app/layout.tsx` (not `next/font`, so builds
  don't depend on network).

Run: `npm install` → `npm run dev` (usually `http://localhost:3000/3001`).
Build check: `npm run build` (runs typecheck + lint).

---

## 3. File map

```
app/
  layout.tsx          Root layout: fonts, metadata, mounts <CloudSync/>, <template>
  template.tsx        Route-change fade transition (opacity only)
  cloud-sync.tsx      Client component that calls initCloudSync() once
  globals.css         Base + ALL keyframes + responsive utility classes
  page.tsx            ★ The candidate SPA (floor → create → pass → HQ). ~2180 lines
  process/page.tsx    "The Recruitment Quest" briefing page (Framer Motion)
  admin/page.tsx      ★ Guild Council admin panel. ~1080 lines
lib/
  supabase.ts         Supabase client (env-based) + isSupabaseConfigured flag
  cloud-sync.ts       Two-way localStorage <-> Supabase mirror + realtime
  (note: types/avatar/context helpers are inlined inside page.tsx, not here)
supabase/
  schema.sql          RPC/bcrypt schema (NOT what the app uses today; future hardening)
  schema_live.sql     ★ The table the app actually syncs to (run THIS one)
README.md             Project readme
SHEET_SYNC.md         Google Sheets live-sync (Apps Script) setup guide
.env.local.example    Supabase env var template
context.md            This file
```

`app/page.tsx` and `app/admin/page.tsx` are the two big files. They are large,
mostly-inline-styled single components. Most feature work happens in them.

---

## 4. The candidate SPA (`app/page.tsx`)

It's a **single state-driven page** — no sub-routes. A `page` state switches
between four "screens":

| `page` value | Screen |
| --- | --- |
| `"floor"` | Arcade floor: CRT boot, scroll-reveal, joystick, 6 domain cabinets, quick-hook form, PRESS START, PLAYER LOGIN / RESUME |
| `"create"` | Character creation form (6 fields + dual-domain pick + 7 questions) |
| `"pass"`  | `LEVEL CLEAR!` ticket (canvas), share buttons, set PIN → enter HQ |
| `"hq"`    | Player HQ: stage tracker, quest log (per-domain tasks), comms feed |

There is also a **rejection outcome screen** (`renderRejected()`) shown inside
`renderHQ()` when the candidate has been stopped, and several **modals/overlays**
(login, forgot-PIN reset, domain detail).

### Navigation flow
```
LANDING (floor)
  └─ PRESS START (needs name+email)  ─► router.push('/process')
        └─ /process CTA "SELECT YOUR DOMAIN" ─► router.push('/?step=create')
              └─ page.tsx mount effect reads ?step=create + tech_hook ─► page='create'
create ─ onSaveData ─► page='pass' ─ onEnterHQ (set PIN) ─► page='hq'
```
- The landing **"▶ INSERT COIN · VIEW QUEST"** button (in the CRT boot screen)
  also routes to `/process`. Scroll still reveals the domain cabinets as flavor.
- **Returning users:** a remembered session (`tech_session` in localStorage)
  shows a **"▶ RESUME AS <NAME>"** button on the floor (top-left, next to
  PLAYER LOGIN). It does NOT auto-navigate — clicking it goes to HQ. (Auto-jump
  was removed on purpose; see §9.)

### Key config constants (top of page.tsx)
```ts
const CLUB_NAME = "TECHNOVATION";
const SCANLINES = 0.35; const FLICKER = true; const SCREEN_TINT = "blue";
const DOMAINS = [ tech, graphics, prod, events, pr, content ];  // key/name/stage/glyph/color/cls
const STAGES  = [ submitted, screening, task, interview, recruited ]; // index 0..4
```
`DOMAINS` entries: `{ key, name, stage (codename), glyph, color, cls (RPG class) }`.
e.g. tech = TECHNICAL / CODE CITADEL / Ψ / #00f0ff / MAGE.

### Important functions in page.tsx
- `toggleClass(key)` — pick up to **2** domains (replaces oldest when a 3rd picked).
- `onPressStart()` — validates name+email, stashes `tech_hook`, routes to `/process`.
- `onSaveData()` — validates all fields + 2 domains + 7 answers, then writes the
  candidate to `tech_candidates_admin`. **Blocks duplicates:** if the email is
  already applied AND activated (has `pinHash`), it opens the login modal instead
  of overwriting (prevents progress loss). If applied-but-not-activated, it
  updates the existing record.
- `onEnterHQ()` — validates PIN, writes `pinHash` (via `hashPin`), `saveSession()`, go HQ.
- `handleCandidateLogin()` — verifies email + `hashPin(pin)` against the store.
- `submitTaskFor(domainKey)` — saves a per-domain submission link. **One-shot:**
  once submitted it locks (no resubmit).
- `loadCandidateByEmail(email)` — hydrates all React state from a stored candidate.
- **Live-sync effect** (runs while `page==='hq'`) — polls localStorage every 2.5s +
  listens for `storage`/`focus`, so admin promotions/rejections/task unlocks
  appear on the candidate dashboard automatically. Pushes a comms message on
  stage advance.

### Quest Log gating (candidate HQ)
- Task plates are **locked until the admin clears Screening** (`stageIdx >= 2`).
  Before that, a "🔒 TASK GUILD LOCKED" plate shows.
- Once unlocked, there is **one task plate per selected domain** (both guilds),
  each with its own submission input, and an interview-prep "upcoming" plate.

---

## 5. The admin panel (`app/admin/page.tsx`)

- **Auth gate:** a client-side master key. Default `MASTER_KEY = "TECH2026"`
  (top of file). Brute-force lockout (5 tries → 60s), 30-min session expiry.
  This is NOT real auth — it's a light gate for an internal tool.
- **Roster table:** ID, applicant (name/email/branch/section/id), domains,
  TASK (submission status), current stage, actions. Sorted so applicants who
  submitted a task but aren't promoted float to the top.
- **Stat cards:** totals per stage.
- **Search + filters** by name/email/branch/id, domain, stage.
- **Actions per row:**
  - **DOSSIER** → modal with full applicant detail, a **read-only** stage
    pipeline (admin CANNOT change stage from the dossier — deliberate), the
    task submission link, the 7 quest answers, **EVALUATION SCORES** (Task /100
    unlocks at Task Round, Interview /100 unlocks at Interview), and reviewer notes.
  - **PROMOTE ▶** → opens a **confirmation dialog** (required) before advancing
    one stage. Only path to advance a candidate.
  - **✕ STOP** → **confirmation dialog + optional feedback**; marks the candidate
    rejected (`stageIdx = 5`, `rejected = true`, `rejectedAtStage`, `rejectionFeedback`).
    The candidate's HQ then shows a respectful "GAME OVER" outcome screen with
    the stage reached, the feedback, and an encouraging message.
- **Exports:** **EXPORT EXCEL** (`.xls`), **EXPORT CSV** — both include
  submission links + scores. **⚙ SHEET SYNC** pushes the roster to a Google
  Sheet on every change (see SHEET_SYNC.md).
- **Live reload:** admin reflects new applicants / task submissions via
  `storage`/`focus`/4s poll (equality-guarded so it never clobbers its own edits).

Admin `STAGES` array has 6 entries (adds `bench/rejected` at index 5) — note the
candidate `STAGES` array has only 5. Guard `STAGES[stageIdx]` when `stageIdx===5`.

---

## 6. Data model & storage

**There is no separate DB layer in the app code.** The source of truth in the
browser is a single `localStorage` array under key **`tech_candidates_admin`**.
Both the candidate SPA and the admin read/write it, and the live-sync effects +
`storage` events keep the two surfaces in sync within one browser.

### The candidate object (the shape everything uses)
```ts
{
  id: string,                 // "cand-<timestamp>"
  playerNo: number,           // e.g. 1003
  name, email, branch, section, phone, collegeId: string,
  domains: string[],          // exactly 2 domain keys, [primary, secondary]
  answers: { q1..q7: string },
  pinHash: string,            // hashPin() output (simple client-side hash, NOT bcrypt)
  stageIdx: number,           // 0 Form · 1 Screening · 2 Task · 3 Interview · 4 Recruited · 5 Stopped
  submissions: { [domainKey]: link },
  submissionLink?: string,    // legacy single link (first submission)
  taskScore?: number,         // /100 (admin)
  interviewScore?: number,    // /100 (admin)
  rejected?: boolean,
  rejectedAtStage?: number,
  rejectionFeedback?: string,
  notes?: string,             // admin reviewer notes
  updatedAt: string,          // "JUST NOW" display string (NOT a real timestamp)
}
```

### localStorage keys
| key | purpose |
| --- | --- |
| `tech_candidates_admin` | the full roster (array of candidate objects) — the store |
| `tech_session` | logged-in candidate's email (persists across restarts → Resume) |
| `tech_hook` | temp name/email handoff from floor → `/process` → create |
| `tech_sheet_webhook` | admin's Google Apps Script Web App URL (per browser) |

---

## 7. Supabase / cloud sync

Optional. If `NEXT_PUBLIC_SUPABASE_URL` + a key are set in `.env.local`, the app
gains **cross-device storage + realtime**; otherwise it runs purely local.

- **`lib/supabase.ts`** — creates the client. Reads the key from EITHER
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` OR `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (supports old anon keys and new `sb_publishable_` keys). Exposes
  `isSupabaseConfigured`.
- **`lib/cloud-sync.ts`** — the integration strategy (IMPORTANT to understand):
  it does **NOT** rewrite the app. It **mirrors** the `tech_candidates_admin`
  localStorage array to a Supabase `candidates` table and back:
  - on load → pull cloud rows, merge into localStorage (migrates local data up),
  - on change → debounced upsert to Supabase (poll 2.5s + `storage` events),
  - realtime → cloud changes flow back into localStorage; the app's existing
    `storage`/poll listeners then re-render. It also **dispatches a synthetic
    `StorageEvent`** after writing localStorage so same-tab listeners fire.
  - It maps the camelCase candidate object ↔ snake_case table columns
    (`rowFromCand` / `candFromRow`). Logs everything to console as `[cloud-sync]`.
- **`app/cloud-sync.tsx`** — a `"use client"` component mounted in `layout.tsx`
  that calls `initCloudSync()` once.
- **`supabase/schema_live.sql`** — the table the sync layer targets: `candidates`
  keyed by `email`, readable columns, Realtime enabled, **open RLS** (anon can
  read/write). **Run this file** in Supabase SQL Editor.
  - ⚠ Security tradeoff: open RLS means the public key can read/write the table
    (needed for a keyless client-only app). Fine for an internal club tool but
    the data is not private from someone inspecting the site. Hardening path =
    move to the RPC/bcrypt model in `supabase/schema.sql`.
- **`supabase/schema.sql`** — an ALTERNATE, more secure RPC/bcrypt design
  (set_passcode / candidate_login / submit_task_link, no anon reads). **The app
  does NOT use this today.** Kept for future hardening.

Live Supabase project in use: ref `eggcjyszoyhxllwqtgjy`. Keys live only in the
user's `.env.local` (git-ignored) — never commit them.

---

## 8. Styling / theme conventions

- Palette (match this exactly): bg `#04040a`, panels `rgba(10,14,26,.72)`/`#12141f`,
  borders `#1c2540`/`#2a1a4a`, cyan `#00f0ff`, magenta `#ff2bd1`, yellow `#ffe600`,
  green `#39ff14`, red `#ff3b30`, ice text `#7de8ff`/`#a9c3d6`.
- Fonts: `'Press Start 2P'` (`PS`) for headings/labels, `'VT323'` (`VT`) for body.
- All keyframes live in `globals.css` (`crtflicker`, `marqueeglow`, `gameon`,
  `spin1up`, `floaty`, `pressstart`, `scrollpulse`, `scandrift`, `blink`, `sweep`,
  `fadeSlideUp`). Reuse these; don't invent parallel ones.
- Reusable inline helpers inside page.tsx: `ArcadeButton` (3D press),
  `panelBox`, `panelBoxTight`, `sectionHdr`, `fieldStyle`, `scanOverlay()`.
- `/process` uses a slightly different, Framer-heavy structure but the SAME palette.

---

## 9. Gotchas / decisions a new agent MUST know

1. **Two big files, mostly inline styles.** Don't try to "Tailwind-ify" them.
2. **`page.tsx` was edited by multiple agents.** It's dense. Read the function
   you're touching fully before editing; prefer targeted edits.
3. **Session does NOT auto-navigate to HQ.** Clicking the site must show the
   landing page. Returning users get the **Resume** button. (An earlier
   auto-redirect was removed because it hijacked the landing page.)
4. **Stage is admin-driven.** Candidates never self-advance. Submitting a task
   does not change stage. Only admin PROMOTE (with confirm) advances.
5. **Submissions are final** (no resubmit). Task plates lock after submit.
6. **Duplicate applications are blocked** — resubmitting an activated email opens
   login instead of overwriting the record (which would wipe progress).
7. **`stageIdx === 5` = rejected/stopped.** `page.tsx STAGES` has only indices
   0–4, so guard array access for 5.
8. **`updatedAt` is a display string** ("JUST NOW"), not a timestamp. The
   Supabase table has real `updated_at` / `client_updated_at`.
9. **Never add git co-author trailers, and don't put the word "Claude" in files.**
   (User preference.) Keep commits clean.
10. **Verify builds after edits:** the repo builds with `npm run build`
    (typecheck + lint). Keep it green.

---

## 10. Known limitations / good next steps

- **Security:** master key is client-side; RLS is open; PIN uses a simple hash.
  Real hardening = Supabase Auth or the RPC/bcrypt schema + proper admin auth.
- **Sync conflict resolution** is last-write-wins per row (fine for one admin;
  concurrent same-row edits across devices could clobber).
- **Cross-device login race:** on a brand-new device, cloud-sync needs ~1–2s to
  pull the roster before PIN login can find the user. Could add a direct
  Supabase lookup in `handleCandidateLogin` as a fallback.
- Scores are admin-only (not shown to candidates) by design.
- Consider extracting the candidate object type + constants into `lib/` to slim
  down `page.tsx`.

---

## 11. How to run / test quickly

```bash
npm install
cp .env.local.example .env.local     # optional: add Supabase URL + key for cloud
npm run dev                          # http://localhost:3000
```
- New user: `/` → PRESS START (name+email) → /process → SELECT DOMAIN → fill form
  → SAVE → set PIN → HQ.
- Returning user: `/` → RESUME (if same browser) or PLAYER LOGIN (email + PIN).
- Admin: `/admin` → master key `TECH2026` → review / promote / reject / score.
- Cloud check: open DevTools console, look for `[cloud-sync]` logs; check
  Supabase **Table Editor → candidates** for rows.
```
```
