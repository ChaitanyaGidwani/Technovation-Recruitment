-- =============================================================
--  MIGRATION: split submission links into sub_link_1 / sub_link_2
--  Run once in Supabase → SQL Editor if your `candidates` table was
--  created with the old `submissions` (jsonb) + `submission_link` columns.
--  (New projects running schema_live.sql already have the two columns.)
-- =============================================================

-- 1. Add the two readable columns.
alter table candidates add column if not exists sub_link_1 text;
alter table candidates add column if not exists sub_link_2 text;

-- 2. Backfill from the old columns (domains is 1-indexed in Postgres).
update candidates
set sub_link_1 = coalesce(nullif(submissions ->> (domains[1]), ''), submission_link),
    sub_link_2 = nullif(submissions ->> (domains[2]), '')
where domains is not null;

-- 3. Drop the old columns.
alter table candidates drop column if exists submissions;
alter table candidates drop column if exists submission_link;
