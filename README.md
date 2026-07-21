# 🕹️ Club Recruitment Arcade

An 8-bit arcade-themed recruitment experience — a faithful port of the design
artifact. Built with **Next.js (App Router)** + **TypeScript**.

Right now it's a **single-page, frontend-only** experience (Supabase is
stubbed) so the UI can be refined first. It's one state-driven flow:

`ARCADE FLOOR` → `CHARACTER CREATION` → `ARCADE PASS` → `PLAYER HQ`

## Features (all in `app/page.tsx`)

- **Arcade floor** — scroll-driven CRT that reveals the domain grid and control
  panel, terminal boot sequence, a cursor-following joystick (rAF physics), the
  6 guild cabinets, live "high score" ticker, quick-hook form + PRESS START.
- **Character creation** — player file, class selection (6 domains), 3 quest
  questions.
- **Arcade pass** — `LEVEL CLEAR! / 1UP`, a canvas-rendered Player ID ticket
  (download / WhatsApp / Instagram share) with a deterministic pixel avatar,
  and a PIN gate to enter HQ.
- **Player HQ** — stage-progress tracker, quest log with submission input, and a
  live comms channel.

All animations are ported verbatim (`crtflicker`, `marqueeglow`, `gameon`,
`spin1up`, `floaty`, `pressstart`, `scrollpulse`, `scandrift`, `blink`) — see
`app/globals.css`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Fonts (`Press Start 2P`, `VT323`) load from Google Fonts via a `<link>` in
`app/layout.tsx`.

## Config

Edit the constants at the top of `app/page.tsx`:

```ts
const CLUB_NAME = "TECHNOVATION";
const SCANLINES = 0.35;          // scanline opacity
const FLICKER = true;            // CRT flicker
const SCREEN_TINT = "blue";      // "blue" | "green" | "amber"
```

## Supabase (stubbed)

`lib/supabase.ts` is a no-op stub — no live database calls. The original
`supabase/schema.sql` (candidates table, RLS, passcode RPCs) is kept for when
you wire persistence back in; the file header lists the exact re-enable steps.

## Structure

```
app/
  layout.tsx     fonts + metadata
  globals.css    base styles + all keyframe animations
  page.tsx       the entire arcade experience (floor/create/pass/hq)
lib/
  supabase.ts    stub (frontend-only for now)
supabase/
  schema.sql     kept for later
```
