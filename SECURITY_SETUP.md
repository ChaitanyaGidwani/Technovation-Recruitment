# Security setup — do these before recruitment opens

Four steps. The first two are required for the site to work at all; steps 3–4
are required for PIN reset to work.

---

## 1. Run the schema

Supabase → SQL Editor → paste all of `supabase/schema_live.sql` → Run.

Safe to re-run. It creates the table, the readable `candidates_full` view, and
the security layer (section 8).

**Deploy the app code at the same time.** The SQL revokes direct table access
from the browser, so old code that reads the table directly will break.

---

## 2. Rotate the admin key

The old key `techno21` was compiled into the public JavaScript bundle — anyone
who viewed source could read it. Treat it as burned.

The schema seeds it so nothing breaks on first run. Change it immediately:

```sql
select app_set_admin_key('pick-something-long-and-random');
```

The key is stored only as a bcrypt hash. It is never sent to the browser, and
`/admin` now verifies it inside Postgres.

---

## 3. Connect SMTP (required for PIN reset)

Supabase's built-in email sender **cannot** be used here — it caps at a few
messages an hour and it locks the email templates, which we need to edit.

Any provider works. Resend is the quickest (3,000 emails/month free):

1. Sign up at resend.com, verify a domain (or use their test sender to trial it).
2. Create an API key.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable, then:

   | Field       | Value                          |
   |-------------|--------------------------------|
   | Host        | `smtp.resend.com`              |
   | Port        | `465`                          |
   | Username    | `resend`                       |
   | Password    | your API key                   |
   | Sender email| e.g. `noreply@yourdomain.com`  |
   | Sender name | `Technovation Recruitment`     |

4. Raise the cap under **Authentication → Rate Limits** once SMTP is live.

---

## 4. Put the code in the email templates

Templates only become editable after step 3.

Supabase → **Authentication → Emails**. Edit **both** of these:

- **Magic Link** — used for applicants who have requested a code before
- **Confirm signup** — used the *first* time an applicant requests one

Most applicants will hit **Confirm signup**, since none of them have used
Supabase Auth before. Missing it is the usual cause of "the email has a link,
not a code".

Each template's body must contain the token. A minimal version:

```html
<h2>Your Technovation verification code</h2>
<p>Enter this code to reset your PIN. It expires shortly.</p>
<p style="font-size:28px;letter-spacing:6px;"><strong>{{ .Token }}</strong></p>
<p>If you didn't request this, you can ignore this email.</p>
```

> **Reauthentication** is a different template for a different flow
> (`auth.reauthenticate()`). It already shows `{{ .Token }}` by default, but it
> is never used by the PIN reset — editing it has no effect here.

---

## Smoke test before going live

Run these against the real project once:

1. **Login** — existing applicant, existing PIN. Old PINs still work; they are
   silently re-hashed to bcrypt on first successful login.
2. **Wrong PIN ×5** — should lock that account for 15 minutes.
3. **Forgot PIN** — full cycle: request code → receive email → enter code →
   set new PIN → log in with it.
4. **Admin** — log in with the new key, promote someone, confirm it persists
   after a refresh.
5. **Exposure check** — open devtools on the public site and run:

   ```js
   await supabase.from('candidates').select('*')
   ```

   It must return a permission error. If it returns rows, section 8 of the
   schema did not run.

---

## What changed, and why

| Before | After |
|---|---|
| Anyone could read the whole table with the public anon key | All direct table access revoked; only fixed RPCs are callable |
| Admin key `techno21` shipped in the JS bundle | Key compared to a bcrypt hash inside Postgres |
| PIN hashed with unsalted 32-bit FNV-1a (instant to brute-force) | bcrypt, verified server-side, auto-upgraded on login |
| Reset needed only email + last 4 phone digits — both publicly readable | Reset requires a code delivered to the college inbox |
| No limit on login attempts | 5 failures → 15-minute lockout, enforced in the database |
| Every visitor's browser cached the full roster in localStorage | Applicants cache only their own row; admin holds data in memory |
