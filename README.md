# 🕹️ Club Recruitment Arcade

An 8-bit arcade-themed recruitment app built with **Next.js (App Router)**,
**TypeScript**, **Tailwind CSS**, **Framer Motion**, and **Supabase**.

Candidates insert a coin, pick one of six domain cabinets, create an RPG-style
character, download a retro Player ID ticket, set a passcode, and track their
recruitment quest from a Player HQ dashboard.

## Pages

| Route                  | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `/`                    | CRT hero + scroll to control panel, cursor-following joystick, 6 cabinets, quick `Name`/`Email` form → Press Start |
| `/character-creation`  | Full RPG character form (branch, section, phone, college email, domain, 3 scenario answers) → saves to Supabase |
| `/confirmation`        | `LEVEL CLEAR! / 1UP` flash, downloadable/shareable 8-bit Player ID ticket, passcode setup → auto-login |
| `/dashboard`           | Protected Player HQ: stage tracker, Quest Log (task + proof URL), Comms Feed |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure Supabase
cp .env.local.example .env.local
#   then edit .env.local with your project URL + anon key

# 3. Create the database
#   Open Supabase -> SQL Editor -> paste supabase/schema.sql -> Run

# 4. Run it
npm run dev        # http://localhost:3000
```

## Environment variables

Create `.env.local` (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

## Database & security model

`supabase/schema.sql` creates the `candidates` table and enables **Row Level
Security**. Because candidates authenticate with an email + passcode (not a full
auth provider), access is handled with `SECURITY DEFINER` RPC functions instead
of raw table reads:

- **Public INSERT** — anyone may submit an application (the entrance form).
- **No direct SELECT/UPDATE** for the anon key — the table is not readable
  directly.
- `set_passcode(email, passcode)` — sets a bcrypt-hashed passcode once, on the
  confirmation screen.
- `candidate_login(email, passcode)` — verifies credentials, returns the row.
- `submit_task_link(email, passcode, link)` — saves the candidate's proof URL.

Passcodes are stored as **bcrypt hashes** (`pgcrypto`), never plaintext, and the
hash is stripped from every RPC response.

> Recruiters advance a candidate by editing their row in the Supabase table
> editor: set `stage` (`Form Submitted → Screening → Task Round → Interview →
> Recruited`) and fill `assigned_task_title` / `assigned_task_desc`. Those show
> up in the candidate's dashboard on their next refresh.

## Tech notes

- Fonts `Press Start 2P` + `VT323` load via `next/font/google`.
- The Player ID ticket is a self-contained SVG rendered to PNG in-browser for
  download (no external libraries).
- Avatars are deterministic 8×8 pixel faces seeded from the candidate's email.
- Temp state between the entrance form and character creation, plus the logged-in
  session, live in `sessionStorage` via a small React context.

## Project structure

```
app/
  layout.tsx                 root layout, fonts, context provider
  globals.css                CRT / scanline / pixel styling
  page.tsx                   arcade entrance
  character-creation/page.tsx
  confirmation/page.tsx
  dashboard/page.tsx
components/
  CRTFrame, Joystick, DomainCabinet, PixelButton,
  PixelAvatar, PlayerTicket, ProgressTracker
lib/
  supabase.ts   types.ts   avatar.ts   candidate-context.tsx
supabase/
  schema.sql
```
