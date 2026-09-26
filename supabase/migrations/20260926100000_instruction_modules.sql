-- Instruction modules (ADR 012): the organization's own instructions, one Word file per work
-- activity, piece of work equipment or category of protective equipment, kept as the author
-- made them. A job position applies the ones that concern it, and the own instructions
-- document (3.2) annexes the union.

create type public.instruction_module_group as enum (
  'work_activity',
  'work_equipment',
  'protective_equipment'
);

create table public.instruction_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  title text not null constraint instruction_modules_title_length check (char_length(btrim(title)) between 2 and 200),
  module_group public.instruction_module_group not null,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets the tables below tie a module and its organization in one foreign key.
  constraint instruction_modules_id_organization unique (id, organization_id)
);

create index instruction_modules_organization_id_idx on public.instruction_modules (organization_id);

create unique index instruction_modules_title_key
  on public.instruction_modules (organization_id, lower(btrim(title)))
  where archived_at is null;

comment on table public.instruction_modules is
  'The organization''s own instructions, one per activity, work equipment or protective equipment category (ADR 012).';

create trigger instruction_modules_set_updated_at before update on public.instruction_modules
  for each row execute function public.set_updated_at();

-- A version is the file at one moment. Nothing changes in place: saving stores the next
-- number, and a document snapshot names the version it annexed.
create table public.instruction_module_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  module_id uuid not null,
  number integer not null constraint instruction_module_versions_number_positive check (number >= 1),
  docx_path text not null unique,
  sha256 text not null constraint instruction_module_versions_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null constraint instruction_module_versions_size_positive check (size_bytes > 0),
  -- The top-level numbered items of the file: what the training themes cite as "Art. 1–N".
  article_count integer not null default 0 constraint instruction_module_versions_article_count_range check (article_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint instruction_module_versions_module_in_organization
    foreign key (module_id, organization_id) references public.instruction_modules (id, organization_id) on delete cascade,
  constraint instruction_module_versions_number_key unique (module_id, number),
  -- The path the storage policy accepts is the one the row says.
  constraint instruction_module_versions_path_format
    check (docx_path = organization_id::text || '/' || module_id::text || '/' || number::text || '.docx')
);

create index instruction_module_versions_module_id_idx on public.instruction_module_versions (module_id, number desc);

comment on table public.instruction_module_versions is
  'The files of an instruction module, one row per save or upload, never changed in place (ADR 012).';

-- Null: undecided, which blocks generating the own instructions. False: the post needs none
-- beyond the common part. True: it applies modules; the triggers below keep the value in
-- step with the rows, so it is never set to true by hand.
alter table public.job_positions add column needs_instructions boolean;

comment on column public.job_positions.needs_instructions is
  'Null until decided; false when the post needs no module; true while it applies instruction modules (ADR 012).';

grant update (needs_instructions) on table public.job_positions to authenticated;

create table public.job_position_instructions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  job_position_id uuid not null,
  module_id uuid not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- The rows go with a position deleted as a mistake; one anyone held is archived, not
  -- deleted, and keeps them.
  constraint job_position_instructions_position_in_client
    foreign key (job_position_id, client_id) references public.job_positions (id, client_id) on delete cascade,
  constraint job_position_instructions_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict,
  constraint job_position_instructions_module_in_organization
    foreign key (module_id, organization_id) references public.instruction_modules (id, organization_id) on delete restrict,
  constraint job_position_instructions_module_once unique (job_position_id, module_id)
);

create index job_position_instructions_module_id_idx on public.job_position_instructions (module_id);
create index job_position_instructions_organization_id_idx on public.job_position_instructions (organization_id);

comment on table public.job_position_instructions is
  'Which instruction modules a job position applies (ADR 012).';

create trigger job_position_instructions_protect_archived_client
  before insert or update or delete on public.job_position_instructions
  for each row execute function public.protect_rows_of_archived_client();

-- The position's decision follows its rows: the first module applied decides "needs
-- instructions", removing the last one leaves the question open again. Runs as the person
-- changing the rows, so the policies on the position still decide.
create function public.follow_job_position_instructions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.job_positions set needs_instructions = true
    where id = new.job_position_id and needs_instructions is distinct from true;
    return new;
  end if;
  if not exists (
    select 1 from public.job_position_instructions where job_position_id = old.job_position_id
  ) then
    update public.job_positions set needs_instructions = null
    where id = old.job_position_id and needs_instructions is not null;
  end if;
  return old;
end;
$$;

create trigger job_position_instructions_follow after insert or delete on public.job_position_instructions
  for each row execute function public.follow_job_position_instructions();

-- "Needs none" and applied modules contradict each other; "needs instructions" without any
-- is not a state either. The trigger above is the only path to true.
create function public.protect_job_position_instructions_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  has_modules boolean;
begin
  if new.needs_instructions is not distinct from old.needs_instructions then
    return new;
  end if;
  select exists (
    select 1 from public.job_position_instructions where job_position_id = new.id
  ) into has_modules;
  if new.needs_instructions = false and has_modules then
    raise exception 'The position applies instruction modules.' using errcode = 'INS01';
  end if;
  if new.needs_instructions = true and not has_modules then
    raise exception 'Apply an instruction module instead.' using errcode = 'INS02';
  end if;
  return new;
end;
$$;

create trigger job_positions_protect_instructions_decision before update on public.job_positions
  for each row execute function public.protect_job_position_instructions_decision();

-- An archived module leaves the pickers and takes no new file; one still applied cannot be
-- archived, so a document is never generated from a module nobody can see.
create function public.protect_archived_instruction_module()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'instruction_modules' then
    if new.archived_at is not null and old.archived_at is null and exists (
      select 1 from public.job_position_instructions i
      join public.job_positions p on p.id = i.job_position_id
      where i.module_id = new.id and p.archived_at is null
    ) then
      raise exception 'The module is applied by a job position.' using errcode = 'INS04';
    end if;
    return new;
  end if;
  if exists (
    select 1 from public.instruction_modules m where m.id = new.module_id and m.archived_at is not null
  ) then
    if tg_table_name = 'job_position_instructions' then
      raise exception 'The module is archived.' using errcode = 'INS03';
    end if;
    raise exception 'The module is archived and takes no new file.' using errcode = 'INS05';
  end if;
  return new;
end;
$$;

create trigger instruction_modules_protect_archiving before update on public.instruction_modules
  for each row execute function public.protect_archived_instruction_module();

create trigger job_position_instructions_refuse_archived before insert on public.job_position_instructions
  for each row execute function public.protect_archived_instruction_module();

create trigger instruction_module_versions_refuse_archived before insert on public.instruction_module_versions
  for each row execute function public.protect_archived_instruction_module();

revoke all on function public.follow_job_position_instructions() from public, anon;
revoke all on function public.protect_job_position_instructions_decision() from public, anon;
revoke all on function public.protect_archived_instruction_module() from public, anon;

-- Row-level security ------------------------------------------------------------------------

alter table public.instruction_modules enable row level security;
revoke all on table public.instruction_modules from anon;

create policy "members read their instruction modules"
  on public.instruction_modules for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members create instruction modules"
  on public.instruction_modules for insert to authenticated
  with check (organization_id = public.current_organization_id());

create policy "members update their instruction modules"
  on public.instruction_modules for update to authenticated
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

revoke update on table public.instruction_modules from authenticated;
grant update (title, module_group, archived_at) on table public.instruction_modules to authenticated;

alter table public.instruction_module_versions enable row level security;
revoke all on table public.instruction_module_versions from anon;

create policy "members read their instruction module versions"
  on public.instruction_module_versions for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members add instruction module versions"
  on public.instruction_module_versions for insert to authenticated
  with check (organization_id = public.current_organization_id());

revoke update, delete on table public.instruction_module_versions from authenticated;

alter table public.job_position_instructions enable row level security;
revoke all on table public.job_position_instructions from anon;

create policy "members read their applied instructions"
  on public.job_position_instructions for select to authenticated
  using (organization_id = public.current_organization_id());

create policy "members apply instructions for their active clients"
  on public.job_position_instructions for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and exists (
      select 1 from public.clients c
      where c.id = client_id
        and c.organization_id = public.current_organization_id()
        and c.archived_at is null
    )
  );

create policy "members remove their applied instructions"
  on public.job_position_instructions for delete to authenticated
  using (organization_id = public.current_organization_id());

revoke update on table public.job_position_instructions from authenticated;

-- Files ---------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instruction-modules', 'instruction-modules', false, 20971520,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- "<organization>/<module>/<number>.docx", the row first: the policy accepts only the path a
-- version of the caller's organization names.
create function public.is_instruction_module_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.instruction_module_versions v
    where v.docx_path = p_path
      and v.organization_id = public.current_organization_id()
  );
$$;

revoke all on function public.is_instruction_module_path(text) from public, anon;
grant execute on function public.is_instruction_module_path(text) to authenticated, service_role;

create policy "members read their instruction module files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'instruction-modules'
    and (storage.foldername(name))[1] = public.current_organization_id()::text
  );

create policy "members upload the files of their instruction module versions"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'instruction-modules' and public.is_instruction_module_path(name));
