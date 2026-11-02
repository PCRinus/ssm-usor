-- ADR 034: a save stores a new version unless its body is the current one's. Not the folded
-- text_hash, which would refuse a save that only puts back diacritics or turns a symbol ("> 50 V"
-- to "< 50 V"). The API collapses whitespace before it compares and stores.
create or replace function public.refuse_unchanged_instruction_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body = (
    select v.body from public.instruction_module_versions v
    where v.module_id = new.module_id
    order by v.number desc
    limit 1
  ) then
    raise exception 'The text is the current version''s.' using errcode = 'INS08';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_unchanged_instruction_text() from public, anon;
