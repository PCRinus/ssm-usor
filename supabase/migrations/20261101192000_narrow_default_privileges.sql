-- Supabase's default privileges hand anon and authenticated every privilege on each new table
-- in public. TRUNCATE ignores row-level security, MAINTAIN lets a caller lock a whole table, and
-- neither role needs REFERENCES or TRIGGER; anon reads and writes nothing in public. Select,
-- insert, update and delete stay granted to authenticated by default because every table's
-- policies are written against them. Function EXECUTE defaults are left as they are: each
-- function revokes what it must.

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
