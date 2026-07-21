-- =============================================================
--  CLUB RECRUITMENT ARCADE — Supabase schema
--  Run this in your Supabase project: SQL Editor -> New query -> Run
-- =============================================================

-- pgcrypto gives us gen_random_uuid() and bcrypt (crypt / gen_salt)
create extension if not exists pgcrypto;

-- -------------------------------------------------------------
--  Table
-- -------------------------------------------------------------
create table if not exists candidates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text unique not null,
  college_email text not null,
  branch text,
  section text,
  phone text,
  domain text not null,
  answers jsonb,
  passcode text,                 -- stored as a bcrypt hash, never plaintext
  stage text default 'Form Submitted',
  assigned_task_title text,
  assigned_task_desc text,
  submission_link text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- -------------------------------------------------------------
--  Row Level Security
--  Strategy: the anon key may INSERT applications publicly, but
--  may NOT read or update rows directly. All authenticated reads
--  and writes go through SECURITY DEFINER functions below that
--  verify the candidate's passcode. This keeps every candidate
--  scoped to their own row without a full auth provider.
-- -------------------------------------------------------------
alter table candidates enable row level security;

-- Public application submissions.
drop policy if exists "public can submit application" on candidates;
create policy "public can submit application"
  on candidates
  for insert
  to anon, authenticated
  with check (true);

-- NOTE: intentionally NO select/update policies for anon.
-- Direct reads/updates are blocked; use the RPC functions instead.

-- -------------------------------------------------------------
--  RPC: set_passcode
--  Called on the confirmation screen to finish account creation.
--  Only works while the row has no passcode yet (first-time set).
-- -------------------------------------------------------------
create or replace function set_passcode(p_email text, p_passcode text)
returns candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  result candidates;
begin
  update candidates
     set passcode = crypt(p_passcode, gen_salt('bf'))
   where lower(email) = lower(p_email)
     and passcode is null
  returning * into result;

  if result.id is null then
    raise exception 'No pending application for that email (or passcode already set).';
  end if;

  result.passcode := null; -- never return the hash
  return result;
end;
$$;

-- -------------------------------------------------------------
--  RPC: candidate_login
--  Verifies email + passcode and returns the candidate row.
-- -------------------------------------------------------------
create or replace function candidate_login(p_email text, p_passcode text)
returns candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  result candidates;
begin
  select * into result
    from candidates
   where lower(email) = lower(p_email)
     and passcode = crypt(p_passcode, passcode);

  if result.id is null then
    raise exception 'Invalid email or passcode.';
  end if;

  result.passcode := null; -- never return the hash
  return result;
end;
$$;

-- -------------------------------------------------------------
--  RPC: submit_task_link
--  Lets an authenticated candidate save their proof URL.
-- -------------------------------------------------------------
create or replace function submit_task_link(
  p_email text,
  p_passcode text,
  p_link text
)
returns candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  result candidates;
begin
  update candidates
     set submission_link = p_link
   where lower(email) = lower(p_email)
     and passcode = crypt(p_passcode, passcode)
  returning * into result;

  if result.id is null then
    raise exception 'Invalid email or passcode.';
  end if;

  result.passcode := null;
  return result;
end;
$$;

-- Allow the anon (and authenticated) roles to call these functions.
grant execute on function set_passcode(text, text) to anon, authenticated;
grant execute on function candidate_login(text, text) to anon, authenticated;
grant execute on function submit_task_link(text, text, text) to anon, authenticated;

-- -------------------------------------------------------------
--  Optional: seed a demo task so new candidates see a quest.
--  (Recruiters normally set assigned_task_* per candidate.)
-- -------------------------------------------------------------
-- update candidates
--   set assigned_task_title = 'Build a mini arcade game',
--       assigned_task_desc  = 'Ship a small playable demo and share the link.'
--   where assigned_task_title is null;
