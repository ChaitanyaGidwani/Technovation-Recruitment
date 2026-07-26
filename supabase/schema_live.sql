-- =============================================================
--  TECHNOVATION RECRUITMENT — Supabase table (the ONLY SQL you need)
--  Safe to run AND re-run any time. Handles a fresh install and also
--  upgrades an older table. Supabase → SQL Editor → New query → Run.
-- =============================================================

-- 1. Table (created only if it doesn't exist yet).
create table if not exists candidates (
  email             text primary key,          -- one row per applicant
  app_id            text,
  player_no         integer,
  name              text,
  branch            text,
  section           text,
  phone             text,
  college_id        text,                        -- admission number
  domains           text[]       default '{}',  -- the two guilds enlisted in
  answers           jsonb        default '{}',  -- q1..q7
  pin_hash          text,                        -- login PIN (hashed by the app)
  stage_idx         integer      default 1,      -- 0 Form 1 Screening 2 Task 3 Interview 4 Recruited 5 Stopped
  sub_link_1        text,                         -- 1st-domain task submission link
  sub_link_2        text,                         -- 2nd-domain task submission link
  task_score        integer,                      -- /100
  interview_score   integer,                      -- /100
  rejected          boolean      default false,
  rejected_at_stage integer,
  rejection_feedback text,
  notes             text,                         -- admin reviewer notes
  client_updated_at bigint,
  updated_at        timestamptz  default now()
);

-- 2. Make sure the split submission columns exist on older tables.
alter table candidates add column if not exists sub_link_1 text;
alter table candidates add column if not exists sub_link_2 text;

-- 3. One-time upgrade from the old submissions/submission_link columns.
--    Copies their data into sub_link_1 / sub_link_2, then drops them.
--    Automatically skipped once those columns are gone.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'candidates' and column_name = 'submissions') then
    update candidates
      set sub_link_1 = coalesce(sub_link_1, nullif(submissions ->> (domains[1]), '')),
          sub_link_2 = coalesce(sub_link_2, nullif(submissions ->> (domains[2]), ''))
      where domains is not null;
    alter table candidates drop column submissions;
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'candidates' and column_name = 'submission_link') then
    update candidates set sub_link_1 = coalesce(sub_link_1, submission_link);
    alter table candidates drop column submission_link;
  end if;
end $$;

-- 4. Keep updated_at fresh on every write.
create or replace function touch_candidates_updated_at()
returns trigger language plpgsql set search_path = public, extensions as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_touch_candidates on candidates;
create trigger trg_touch_candidates
  before update on candidates
  for each row execute function touch_candidates_updated_at();

-- 5. Realtime — stream row changes to every connected browser (guarded).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'candidates') then
    alter publication supabase_realtime add table candidates;
  end if;
end $$;

-- 6. Row Level Security. Section 8 below locks this down completely —
--    the anon key gets NO direct table access and must go through the
--    SECURITY DEFINER functions. This section just clears old policies.
alter table candidates enable row level security;

-- Drop EVERY existing policy on the table by name, whatever it's called.
-- (Dropping by hardcoded name breaks the moment a policy was created with
--  different spacing/casing, which aborts the whole script.)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'candidates'
  loop
    execute format('drop policy %I on public.candidates', pol.policyname);
  end loop;
end $$;

-- (No permissive policies are created here on purpose — see section 8k.)

-- 7. Readable view — every applicant field with the 7 questionnaire answers
--    flattened out of the `answers` JSON into real columns. The table itself
--    still stores them as jsonb (that's what the app reads/writes); this view
--    is purely for browsing and exporting from the Supabase dashboard.
--    Open it under Table Editor → candidates_full, or "Export to CSV" there.
-- Dropped first: "create or replace view" refuses to run if any column name
-- changed since last time, which would abort the script.
drop view if exists candidates_full;
create view candidates_full as
select
  c.player_no                          as "PlayerNo",
  c.app_id                             as "AppID",
  c.name                               as "Name",
  c.email                              as "Email",
  c.phone                              as "Phone",
  c.branch                             as "Branch",
  c.section                            as "Section",
  c.college_id                         as "AdmissionNo",
  c.domains[1]                         as "Domain1",
  c.domains[2]                         as "Domain2",
  case
    when c.rejected then 'REJECTED / STOPPED'
    when c.stage_idx = 0 then 'FORM SUBMITTED'
    when c.stage_idx = 1 then 'SCREENING'
    when c.stage_idx = 2 then 'TASK ROUND'
    when c.stage_idx = 3 then 'INTERVIEW'
    when c.stage_idx = 4 then 'RECRUITED'
    when c.stage_idx = 5 then 'BENCH / ON HOLD'
    else 'UNKNOWN'
  end                                  as "Stage",
  c.stage_idx                          as "StageIdx",
  c.task_score                         as "TaskScore",
  c.interview_score                    as "InterviewScore",
  (c.task_score + c.interview_score)   as "TotalScore",
  c.sub_link_1                         as "SubLink1",
  c.sub_link_2                         as "SubLink2",
  c.rejected                           as "Rejected",
  c.rejected_at_stage                  as "RejectedAtStage",
  c.rejection_feedback                 as "RejectionFeedback",
  c.notes                              as "ReviewerNotes",
  c.updated_at                         as "Updated",
  c.answers ->> 'q1'                   as "Q1 Biggest strength & skill improving",
  c.answers ->> 'q2'                   as "Q2 Why this club / what excites you",
  c.answers ->> 'q3'                   as "Q3 Skills & talents you bring",
  c.answers ->> 'q4'                   as "Q4 Goals to achieve this year",
  c.answers ->> 'q5'                   as "Q5 Handling challenges in a group",
  c.answers ->> 'q6'                   as "Q6 Owning a task start to finish",
  c.answers ->> 'q7'                   as "Q7 One project you would launch"
from candidates c
order by c.player_no;


-- =============================================================
--  8. SECURITY LAYER
--  Before this section the anon key could read the whole table —
--  every email, phone, admission number, answer and pin_hash. That made
--  the PIN meaningless and the "last 4 digits of phone" reset trivially
--  bypassable. Everything below moves credential checks server-side and
--  closes direct table access.
-- =============================================================

create extension if not exists pgcrypto;

-- 8a. Private config (admin key hash lives here, never in the browser).
create table if not exists app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;   -- no policies = no anon access

-- 8b. Failed-attempt throttling, keyed by login identity.
create table if not exists auth_throttle (
  id           text primary key,
  fails        integer     not null default 0,
  locked_until timestamptz
);
alter table auth_throttle enable row level security; -- no policies = no anon access

create or replace function _throttle_guard(p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r auth_throttle%rowtype;
begin
  select * into r from auth_throttle where id = p_id;
  if found and r.locked_until is not null and r.locked_until > now() then
    raise exception 'RATE_LIMITED_%',
      ceil(extract(epoch from (r.locked_until - now())))::int;
  end if;
end $$;

create or replace function _throttle_fail(p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare n integer;
begin
  insert into auth_throttle(id, fails) values (p_id, 1)
    on conflict (id) do update set fails = auth_throttle.fails + 1
    returning fails into n;
  if n >= 5 then
    update auth_throttle
      set locked_until = now() + interval '15 minutes', fails = 0
      where id = p_id;
  end if;
end $$;

create or replace function _throttle_clear(p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from auth_throttle where id = p_id;
end $$;

-- 8c. Legacy PIN support.
--     Old PINs were stored as unsalted 32-bit FNV-1a in base36 — brute-forcible
--     in milliseconds. These helpers recognise an old hash so a returning
--     applicant can still log in once, and are then silently upgraded to bcrypt.
create or replace function _to_base36(n bigint)
returns text language plpgsql immutable set search_path = public, extensions as $$
declare d text := '0123456789abcdefghijklmnopqrstuvwxyz'; r text := ''; v bigint := n;
begin
  if v = 0 then return '0'; end if;
  while v > 0 loop
    r := substr(d, (v % 36)::int + 1, 1) || r;
    v := v / 36;
  end loop;
  return r;
end $$;

create or replace function _legacy_pin_hash(p_pin text)
returns text language plpgsql immutable set search_path = public, extensions as $$
declare h bigint := 2166136261; i integer;
begin
  for i in 1..coalesce(length(p_pin), 0) loop
    h := h # ascii(substr(p_pin, i, 1));
    h := (h * 16777619) % 4294967296;
  end loop;
  return _to_base36(h);
end $$;

-- Verify a PIN against either a bcrypt hash or a legacy hash.
create or replace function _pin_matches(p_pin text, p_hash text)
returns boolean language plpgsql immutable set search_path = public, extensions as $$
begin
  if p_hash is null or p_hash = '' then return false; end if;
  if left(p_hash, 1) = '$' then                 -- bcrypt
    return p_hash = crypt(p_pin, p_hash);
  end if;
  return p_hash = _legacy_pin_hash(p_pin);      -- legacy, upgraded on success
end $$;

-- 8d. Row shape returned to the applicant — pin_hash is never exposed.
--     `has_pin` says only WHETHER a PIN is set (never its value), which the UI
--     needs to know the account is activated so it can lock the answers.
create or replace function _cand_public(c candidates)
returns jsonb language sql immutable set search_path = public, extensions as $$
  select (to_jsonb(c) - 'pin_hash')
      || jsonb_build_object('has_pin', (c.pin_hash is not null and c.pin_hash <> ''));
$$;

-- 8e. Applicant login. Returns the row on success, null on failure.
--     Locks the account for 15 min after 5 consecutive failures.
create or replace function app_login(p_email text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c candidates%rowtype; k text; em text;
begin
  em := lower(trim(p_email));
  k  := 'login:' || em;
  perform _throttle_guard(k);

  select * into c from candidates where email = em;
  if not found or not _pin_matches(p_pin, c.pin_hash) then
    perform _throttle_fail(k);
    return null;
  end if;

  -- Transparently upgrade a legacy hash to bcrypt on first successful login.
  if left(c.pin_hash, 1) <> '$' then
    update candidates set pin_hash = crypt(p_pin, gen_salt('bf', 10))
      where email = em;
  end if;

  perform _throttle_clear(k);
  return _cand_public(c);
end $$;

-- 8f. Registration. Refuses to overwrite an already-registered email.
create or replace function app_register(p_email text, p_pin text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c candidates%rowtype; em text;
begin
  em := lower(trim(p_email));
  if em !~* '^[^@\s]+@abes\.ac\.in$' then
    raise exception 'BAD_EMAIL_DOMAIN';
  end if;
  if coalesce(length(p_pin), 0) < 4 or length(p_pin) > 6 or p_pin !~ '^[0-9]+$' then
    raise exception 'BAD_PIN_FORMAT';
  end if;

  select * into c from candidates where email = em;
  if found and c.pin_hash is not null and c.pin_hash <> '' then
    raise exception 'ALREADY_REGISTERED';
  end if;

  insert into candidates (
    email, app_id, player_no, name, branch, section, phone, college_id,
    domains, answers, pin_hash, stage_idx, client_updated_at
  ) values (
    em,
    p_payload ->> 'app_id',
    -- Assigned by the server, not the browser. It used to be
    -- 1000 + localStorage.length, so two devices handed out the same
    -- player number and every phone showed a different registration count.
    coalesce((select max(player_no) from candidates), 1000) + 1,
    coalesce(p_payload ->> 'name', ''),
    coalesce(p_payload ->> 'branch', ''),
    coalesce(p_payload ->> 'section', ''),
    coalesce(p_payload ->> 'phone', ''),
    coalesce(p_payload ->> 'college_id', ''),
    coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_payload -> 'domains')), '{}'),
    coalesce(p_payload -> 'answers', '{}'::jsonb),
    crypt(p_pin, gen_salt('bf', 10)),
    1,
    (extract(epoch from now()) * 1000)::bigint
  )
  on conflict (email) do update set
    name    = excluded.name,
    branch  = excluded.branch,
    section = excluded.section,
    phone   = excluded.phone,
    college_id = excluded.college_id,
    domains = excluded.domains,
    answers = excluded.answers,
    pin_hash = excluded.pin_hash
  returning * into c;

  return _cand_public(c);
end $$;

-- 8g. Applicant-initiated save. PIN-gated, and deliberately narrow: an
--     applicant can never write stage_idx, scores, rejection or notes.
create or replace function app_save(p_email text, p_pin text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c candidates%rowtype; em text;
begin
  em := lower(trim(p_email));
  select * into c from candidates where email = em;
  if not found or not _pin_matches(p_pin, c.pin_hash) then
    raise exception 'AUTH_FAILED';
  end if;

  update candidates set
    sub_link_1 = coalesce(p_payload ->> 'sub_link_1', sub_link_1),
    sub_link_2 = coalesce(p_payload ->> 'sub_link_2', sub_link_2),
    answers    = case when stage_idx <= 1 and p_payload ? 'answers'
                      then p_payload -> 'answers' else answers end,
    client_updated_at = (extract(epoch from now()) * 1000)::bigint
  where email = em
  returning * into c;

  return _cand_public(c);
end $$;

-- 8h. PIN reset — requires a verified Supabase Auth session for that same
--     address, i.e. the applicant proved they can read the inbox. This is
--     what replaces the old "last 4 digits of phone" check.
create or replace function app_reset_pin(p_new_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare em text; n integer;
begin
  em := lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''));
  if em is null then
    raise exception 'NOT_VERIFIED';
  end if;
  if coalesce(length(p_new_pin), 0) < 4 or length(p_new_pin) > 6 or p_new_pin !~ '^[0-9]+$' then
    raise exception 'BAD_PIN_FORMAT';
  end if;

  update candidates set pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
    where email = em;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NO_SUCH_APPLICANT'; end if;

  perform _throttle_clear('login:' || em);
  return true;
end $$;

-- 8h-bis. Public counters. Returns only aggregate numbers — no personal data —
--     so every visitor sees the SAME live registration count regardless of
--     device. Previously the count was localStorage.length, which meant a phone
--     and a laptop showed different numbers.
create or replace function app_stats()
returns jsonb language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'registrations', (select count(*) from candidates),
    'recruited',     (select count(*) from candidates where stage_idx = 4 and not coalesce(rejected, false))
  );
$$;

-- 8h-ter. "Has this email already applied?" — asked BEFORE the form starts, so
--     a returning applicant is sent to the PIN prompt instead of retyping their
--     whole application only to be rejected at the last step. Returns a bare
--     boolean: no name, answers or hash.
create or replace function app_is_registered(p_email text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from candidates
    where email = lower(trim(p_email))
      and pin_hash is not null
      and pin_hash <> ''
  );
$$;

-- 8i. Admin access. The key is compared against a bcrypt hash stored here,
--     so no admin secret is shipped in the JavaScript bundle.
create or replace function _admin_ok(p_key text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  perform _throttle_guard('admin');
  select value into h from app_config where key = 'admin_key_hash';
  if h is null then raise exception 'ADMIN_KEY_NOT_SET'; end if;
  if h = crypt(p_key, h) then
    perform _throttle_clear('admin');
    return true;
  end if;
  perform _throttle_fail('admin');
  return false;
end $$;

create or replace function app_admin_all(p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _admin_ok(p_key) then raise exception 'AUTH_FAILED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) - 'pin_hash' order by c.player_no)
                   from candidates c), '[]'::jsonb);
end $$;

create or replace function app_admin_write(p_key text, p_email text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare c candidates%rowtype;
begin
  if not _admin_ok(p_key) then raise exception 'AUTH_FAILED'; end if;
  update candidates set
    stage_idx          = coalesce((p_patch ->> 'stage_idx')::int, stage_idx),
    task_score         = case when p_patch ? 'task_score'
                              then nullif(p_patch ->> 'task_score','')::int else task_score end,
    interview_score    = case when p_patch ? 'interview_score'
                              then nullif(p_patch ->> 'interview_score','')::int else interview_score end,
    rejected           = coalesce((p_patch ->> 'rejected')::boolean, rejected),
    rejected_at_stage  = case when p_patch ? 'rejected_at_stage'
                              then nullif(p_patch ->> 'rejected_at_stage','')::int else rejected_at_stage end,
    rejection_feedback = coalesce(p_patch ->> 'rejection_feedback', rejection_feedback),
    notes              = coalesce(p_patch ->> 'notes', notes)
  where email = lower(trim(p_email))
  returning * into c;
  return _cand_public(c);
end $$;

create or replace function app_admin_delete(p_key text, p_email text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _admin_ok(p_key) then raise exception 'AUTH_FAILED'; end if;
  delete from candidates where email = lower(trim(p_email));
  return true;
end $$;

-- 8j. Set / rotate the admin key. Run this once with your own key, then
--     delete the line from your copy so it isn't left lying around:
--        select app_set_admin_key('your-new-strong-key');
--     Seeds the previous hardcoded key on first run so admin keeps working.
create or replace function app_set_admin_key(p_key text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into app_config(key, value)
    values ('admin_key_hash', crypt(p_key, gen_salt('bf', 10)))
    on conflict (key) do update set value = excluded.value;
  return true;
end $$;

do $$
begin
  if not exists (select 1 from app_config where key = 'admin_key_hash') then
    perform app_set_admin_key('techno21');
  end if;
end $$;

-- 8k. CLOSE DIRECT TABLE ACCESS.
--     The anon key may now only call the functions above — it can no longer
--     select, insert, update or delete rows directly.
drop policy if exists "app can read"   on candidates;
drop policy if exists "app can insert" on candidates;
drop policy if exists "app can update" on candidates;
drop policy if exists "app can delete" on candidates;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'candidates'
  loop
    execute format('drop policy %I on public.candidates', pol.policyname);
  end loop;
end $$;

revoke all on candidates   from anon, authenticated;
revoke all on app_config   from anon, authenticated;
revoke all on auth_throttle from anon, authenticated;

-- The flattened view inherits the same lockdown (admin reads it in the
-- dashboard as the postgres role, which bypasses RLS).
revoke all on candidates_full from anon, authenticated;

-- Internal helpers are not callable from the browser.
--
-- Revoke from public AND from the roles by name. Two separate defaults conspire
-- here: Postgres grants EXECUTE to PUBLIC on every new function, and Supabase
-- additionally grants it to anon/authenticated explicitly. Revoking only from
-- `anon` left app_set_admin_key callable by any visitor (admin takeover) and
-- _throttle_clear callable too (wipe your own lockout, then brute-force a
-- 4-digit PIN freely). Both defaults re-apply on every CREATE OR REPLACE, so
-- these revokes must stay at the END of this file.
revoke all on function _throttle_guard(text), _throttle_fail(text), _throttle_clear(text),
                       _legacy_pin_hash(text), _to_base36(bigint), _pin_matches(text, text),
                       _cand_public(candidates), _admin_ok(text), app_set_admin_key(text)
  from public, anon, authenticated;

-- Only these entry points are exposed.
grant execute on function app_stats()                           to anon, authenticated;
grant execute on function app_is_registered(text)                to anon, authenticated;
grant execute on function app_login(text, text)                 to anon, authenticated;
grant execute on function app_register(text, text, jsonb)       to anon, authenticated;
grant execute on function app_save(text, text, jsonb)           to anon, authenticated;
grant execute on function app_reset_pin(text)                   to authenticated;
grant execute on function app_admin_all(text)                   to anon, authenticated;
grant execute on function app_admin_write(text, text, jsonb)    to anon, authenticated;
grant execute on function app_admin_delete(text, text)          to anon, authenticated;
