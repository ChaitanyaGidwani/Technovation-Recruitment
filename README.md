# 🕹️ Technovation Recruitment

The recruitment portal for **TECHNOVATION**, the Networking Club of ABES
Engineering College — an 8-bit arcade experience for applicants, with a plain
admin dashboard behind it.

Built with **Next.js 14 (App Router)** + **TypeScript**, backed by **Supabase**.

---

## The flow

**Applicant** — `ARCADE FLOOR` → `/process` briefing → `CHARACTER CREATION`
→ `ARCADE PASS` (set PIN) → `PLAYER HQ`

**Reviewer** — `/admin` → applicant table → dossier → promote / stop / score

Stages: `FORM SUBMITTED` → `SCREENING` → `TASK ROUND` → `INTERVIEW` →
`RECRUITED` (plus `BENCH / ON HOLD` for stopped applications).

Screening is judged on the 7-question questionnaire. The domain task only
exists *after* screening — applicants are promoted into it, not through it.

---

## Routes

| Route | What it is |
|---|---|
| `/` | The arcade: floor, registration, pass, and Player HQ (one state-driven page) |
| `/process` | "The Recruitment Quest" briefing — timeline, rounds, steps |
| `/admin` | Reviewer dashboard — key-gated, verified server-side |

---

## Features

**Arcade floor** — scroll-driven CRT reveal of the 6 guild cabinets, terminal
boot sequence, cursor-following joystick, live registration counter (read from
the server, so every device shows the same number), quick-hook form.

**Character creation** — player file, 2-of-6 domain selection, 7 quest
questions. Locks itself read-only once submitted; applicants can re-read it any
time via **MY APPLICATION** in HQ, but never edit it.

**Arcade pass** — canvas-rendered Player ID ticket with a per-user pixel avatar
(download / WhatsApp / Instagram share), plus the PIN gate that creates the
account.

**Player HQ** — stage tracker, quest log with per-domain submission (final once
sent), and a comms channel derived from the applicant's real stage, so it can
never contradict the progress bar.

**Admin** — search and filter, stage counts, dossier with the full questionnaire
text alongside each answer, confirm-gated promote / stop / delete, task and
interview scores, Excel + CSV export (29 columns including all 7 answers), and
optional Google Sheets live sync.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
node scripts/audit.mjs   # see "Guardrails" below
```

**Setup is not optional** — the app needs Supabase credentials, the schema, an
admin key, and SMTP for PIN resets. Follow **[SETUP.md](SETUP.md)** end to end.

---

## Security model

The `candidates` table is **not** readable or writable with the public anon key.
RLS denies all direct access; every operation goes through a `SECURITY DEFINER`
function so credential checks happen in Postgres where the browser can't skip
them.

- PINs are **bcrypt**, verified server-side. Legacy hashes upgrade on first login.
- PIN reset requires a **one-time code emailed** to the college address — the
  database reads the account from the verified token, not from the request.
- The admin key is compared to a bcrypt hash in the database. **No secret ships
  in the JavaScript bundle.**
- 5 failed attempts → 15-minute lockout, enforced in the database.
- Applicants can only ever write their own task links and unlocked answers —
  never stage, scores, or notes.

Details and the reasoning behind each change: **[SECURITY_SETUP.md](SECURITY_SETUP.md)**.

> Never add a `.from("candidates")` call back into client code, and never put
> the `service_role` key in this project. Both would undo the above.

---

## Guardrails

```bash
node scripts/audit.mjs
```

Checks that every exported API function is actually called, that every local
write to the candidate store has a server counterpart, and that no direct table
access has crept back in.

This exists because a refactor once removed the localStorage→Supabase mirror
without replacing the write path: registrations silently stopped reaching the
server and applicants couldn't log in. `npm run build` passed the whole time —
TypeScript has no opinion about a function nobody calls. **Run it after any
refactor that touches data flow.**

---

## Config

Constants at the top of `app/page.tsx`:

```ts
const CLUB_NAME = "TECHNOVATION";
const SCANLINES = 0.35;          // scanline opacity
const FLICKER = true;            // CRT flicker (auto-disabled on mobile)
const SCREEN_TINT = "blue";      // "blue" | "green" | "amber"
```

Palette is 3 accents on near-black: cyan `#00f0ff`, magenta `#ff2bd1`, amber
`#ffb800`, with ice-blue `#7de8ff` text. Domain cards alternate cyan/magenta.

Fonts (`Press Start 2P`, `VT323`) load from Google Fonts in `app/layout.tsx`.

---

## Structure

```
app/
  page.tsx           the whole arcade (floor / create / pass / hq)
  process/page.tsx   recruitment briefing
  admin/page.tsx     reviewer dashboard
  layout.tsx         fonts + metadata
  globals.css        base styles, keyframes, mobile viewport fixes
lib/
  api.ts             ALL server calls (RPC wrappers) — the only data path
  supabase.ts        client (reads NEXT_PUBLIC_SUPABASE_* env vars)
  cloud-sync.ts      row mappers; the old global sync is disabled by design
supabase/
  schema_live.sql    the only SQL you need — table, view, security layer
scripts/
  audit.mjs          post-refactor guardrails
```

---

## Docs

| File | Covers |
|---|---|
| [SETUP.md](SETUP.md) | Full setup, smoke tests, resetting users, troubleshooting |
| [SECURITY_SETUP.md](SECURITY_SETUP.md) | What was hardened and why |
| [SHEET_SYNC.md](SHEET_SYNC.md) | Google Sheets live sync (optional) |
| [context.md](context.md) | Handoff notes |
