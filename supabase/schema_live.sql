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
returns trigger language plpgsql as $$
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

-- 6. Row Level Security — open policy so the public anon key may read/write.
--    Fine for an internal club tool, but the data is NOT private from someone
--    who inspects the site. Harden later via SECURITY DEFINER RPCs if needed.
alter table candidates enable row level security;
drop policy if exists "app can read"   on candidates;
drop policy if exists "app can insert" on candidates;
drop policy if exists "app can update" on candidates;
drop policy if exists "app can delete" on candidates;
create policy "app can read"   on candidates for select using (true);
create policy "app can insert" on candidates for insert with check (true);
create policy "app can update" on candidates for update using (true) with check (true);
create policy "app can delete" on candidates for delete using (true);
