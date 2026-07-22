-- =============================================================
--  TECHNOVATION RECRUITMENT — live cloud-sync table
--  Run this in your Supabase project: SQL Editor → New query → Run
--  This is the table the app's cloud-sync layer reads/writes.
-- =============================================================

create table if not exists candidates (
  email             text primary key,          -- natural key (one row per applicant)
  app_id            text,
  player_no         integer,
  name              text,
  branch            text,
  section           text,
  phone             text,
  college_id        text,
  domains           text[]       default '{}',  -- the two guilds they enlisted in
  answers           jsonb        default '{}',  -- q1..q7
  pin_hash          text,                        -- login PIN (hashed by the app)
  stage_idx         integer      default 1,      -- 0 Form · 1 Screening · 2 Task · 3 Interview · 4 Recruited · 5 Stopped
  sub_link_1        text,                         -- 1st-domain task submission link
  sub_link_2        text,                         -- 2nd-domain task submission link
  task_score        integer,                     -- /100
  interview_score   integer,                     -- /100
  rejected          boolean      default false,
  rejected_at_stage integer,
  rejection_feedback text,
  notes             text,                         -- admin reviewer notes
  client_updated_at bigint,                       -- epoch ms, last-write-wins hint
  updated_at        timestamptz  default now()
);

-- Keep updated_at fresh on every write.
create or replace function touch_candidates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_candidates on candidates;
create trigger trg_touch_candidates
  before update on candidates
  for each row execute function touch_candidates_updated_at();

-- -------------------------------------------------------------
--  Realtime — stream row changes to every connected browser.
-- -------------------------------------------------------------
alter publication supabase_realtime add table candidates;

-- -------------------------------------------------------------
--  Row Level Security
--  NOTE: this open policy lets the public anon key read & write the table,
--  which is what makes the client-only app work across devices. It matches
--  the app's current (localStorage-exposed) trust model — fine for an internal
--  club tool, but the data is NOT private from someone who inspects the site.
--  To harden later, move reads/writes behind SECURITY DEFINER RPCs (see
--  schema.sql) and restrict these policies.
-- -------------------------------------------------------------
alter table candidates enable row level security;

drop policy if exists "app can read"   on candidates;
drop policy if exists "app can insert" on candidates;
drop policy if exists "app can update" on candidates;

create policy "app can read"   on candidates for select using (true);
create policy "app can insert" on candidates for insert with check (true);
create policy "app can update" on candidates for update using (true) with check (true);
