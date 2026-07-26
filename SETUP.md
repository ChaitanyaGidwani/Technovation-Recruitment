# Setup — everything, in order

Work top to bottom. Steps 1–5 are **required** or the site won't work.
Steps 6–7 are optional extras.

---

## 1. Install and run locally

Needs Node 18 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

---

## 2. Create the Supabase project

1. supabase.com → **New project**. Pick a region close to your college.
2. Save the database password somewhere safe (you won't need it for the app,
   but you can't view it again).
3. Go to **Project Settings → API** and copy two values:
   - **Project URL** → `https://xxxxx.supabase.co`
   - **anon / public key** → a long `eyJ...` string

> The anon key is *meant* to be public — it ships in the browser. It is safe
> **only because** section 8 of the schema blocks it from touching the tables
> directly. Never paste the `service_role` key into this project.

---

## 3. Add the environment variables

### Local — `.env.local` in the project root

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

This file is git-ignored. Restart `npm run dev` after editing it — Next.js
only reads env vars at startup.

### Production — Vercel

Vercel does **not** read `.env.local`. Add the same two variables in
**Project → Settings → Environment Variables**, tick all three environments
(Production / Preview / Development), then **redeploy**. Env var changes only
take effect on a new deployment.

If the site loads but nothing saves, this step is almost always why.

---

## 4. Run the database schema

Supabase → **SQL Editor** → **New query** → paste *all* of
`supabase/schema_live.sql` → **Run**.

Safe to run and re-run. It creates:

- the `candidates` table
- `candidates_full` — a readable view with the 7 answers as real columns
- the security layer: bcrypt PINs, rate limiting, and the RPCs the app calls

**Deploy the app code at the same time.** The schema revokes direct table
access from the browser, so older code that queried the table will break.

---

## 5. Set your admin key

The schema seeds the old key `techno21` so the panel keeps working — but that
key was compiled into the public JavaScript bundle and anyone could read it.
Change it immediately:

```sql
select app_set_admin_key('pick-something-long-and-random');
```

Only the bcrypt hash is stored. The key never reaches the browser; `/admin`
verifies it inside Postgres. Five wrong attempts locks admin for 15 minutes.

---

## 6. Email setup — required for "Forgot PIN"

Login works without this. **PIN reset does not.**

Supabase's built-in email sender can't be used: it caps at a few messages an
hour and it locks the templates you need to edit.

### 6a. Connect SMTP

Any provider works; Resend is quickest (3,000/month free).

1. resend.com → sign up → verify a domain (or use their test sender to trial).
2. Create an API key.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable:

   | Field        | Value                         |
   |--------------|-------------------------------|
   | Host         | `smtp.resend.com`             |
   | Port         | `465`                         |
   | Username     | `resend`                      |
   | Password     | your API key                  |
   | Sender email | `noreply@yourdomain.com`      |
   | Sender name  | `Technovation Recruitment`    |

4. Raise the cap under **Authentication → Rate Limits**.

### 6b. Put the code in the templates

Templates only become editable after 6a.

Supabase → **Authentication → Emails**. Edit **both**:

- **Confirm signup** — used the *first* time each applicant requests a code
- **Magic Link** — used on later requests

Most applicants hit **Confirm signup**, since none have used Supabase Auth
before. Editing only Magic Link is the usual cause of *"the first email had a
link, not a code."*

Body for each:

```html
<h2>Your Technovation verification code</h2>
<p>Enter this code to reset your PIN. It expires shortly.</p>
<p style="font-size:28px;letter-spacing:6px;"><strong>{{ .Token }}</strong></p>
<p>If you didn't request this, ignore this email.</p>
```

> **Reauthentication** already shows `{{ .Token }}` by default, but it belongs
> to a different flow and is never used here. Editing it does nothing.

### 6c. Set the site URL

**Authentication → URL Configuration → Site URL** →
`https://technovation-recruitment.vercel.app`

---

## 7. Optional — Google Sheets live sync

See **SHEET_SYNC.md**. Paste the Apps Script web-app URL into the admin panel
under **Sheet sync**. The roster then auto-pushes on every change, with all 29
columns including the 7 answers.

Not required — **Excel** and **CSV** buttons in the admin panel work with no
setup at all.

---

## Smoke test before opening registration

Run all six against the real deployed site:

1. **Register** a test applicant end to end.
2. **Log in** with that PIN, then log out and back in.
3. **Wrong PIN ×5** → account locks for 15 minutes.
4. **Forgot PIN** → request code → email arrives with a *code, not a link* →
   enter it → set new PIN → log in with it.
5. **Admin** → log in with your new key → promote the test applicant →
   refresh → the change persisted.
6. **Exposure check** — on the public site, open devtools console:

   ```js
   await supabase.from('candidates').select('*')
   ```

   This **must** return a permission error. If it returns rows, section 8 of
   the schema didn't run and applicant data is still public.

Delete the test applicant from the admin panel when done.

---

## Where things live

| Thing | Where |
|---|---|
| Applicant data | Supabase `candidates` table |
| Readable answers | Supabase → Table Editor → `candidates_full` |
| Admin panel | `/admin` on your deployed site |
| Excel / CSV export | Admin panel header |
| Security details | `SECURITY_SETUP.md` |
| Sheets sync | `SHEET_SYNC.md` |

---

## If something breaks

| Symptom | Cause |
|---|---|
| Nothing saves; console shows permission errors | Env vars missing on Vercel, or schema not run |
| `gen_salt does not exist` when running SQL | Old copy of the schema — re-copy the current file |
| Reset email has a link, not a code | `{{ .Token }}` missing from **Confirm signup** |
| No reset email at all | SMTP not connected, or hourly cap hit |
| Admin key rejected | Run `app_set_admin_key(...)` again |
| Locked out of admin | Wait 15 min, or `delete from auth_throttle where id = 'admin';` |
| Live count shows 0 | `app_stats()` missing — re-run the schema |
