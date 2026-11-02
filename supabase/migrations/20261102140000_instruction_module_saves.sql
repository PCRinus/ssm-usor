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

-- A module and its first version in one transaction: a module left without a version is hidden
-- from the library yet still holds its title against every retry.
create function public.create_instruction_module(
  p_title text,
  p_group public.instruction_module_group,
  p_domain public.instruction_domain,
  p_body jsonb,
  p_text_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := public.current_organization_id();
  v_module_id uuid;
begin
  insert into public.instruction_modules (organization_id, title, module_group, domain, created_by)
  values (v_organization_id, p_title, p_group, p_domain, auth.uid())
  returning id into v_module_id;
  insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash, created_by)
  values (v_organization_id, v_module_id, 1, p_body, p_text_hash, auth.uid());
  return v_module_id;
end;
$$;

revoke all on function public.create_instruction_module(text, public.instruction_module_group, public.instruction_domain, jsonb, text) from public, anon;
grant execute on function public.create_instruction_module(text, public.instruction_module_group, public.instruction_domain, jsonb, text) to authenticated;
