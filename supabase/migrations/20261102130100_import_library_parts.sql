-- Library proposals (ADR 034, "Where it sits in the import"): what a client import proposes for
-- the organization's own libraries, read by a request of its own after the client proposal is
-- ready, and confirmed after the client, each part on its own.

create type public.import_library_part as enum ('instructions_ssm', 'instructions_psi');

alter table public.import_files
  add column document_domain public.instruction_domain,
  add constraint import_files_document_domain_kind check (
    document_domain is null or document_kind in ('own_instructions', 'training_themes')
  );

comment on column public.import_files.document_domain is
  'For own instructions and training themes, whether the sorting found them about SSM or PSI: the library part they are read for.';

create type public.import_library_part_status as enum (
  'reading', 'to_review', 'nothing_new', 'failed', 'confirmed'
);

create table public.import_library_parts (
  import_id uuid not null,
  organization_id uuid not null,
  part public.import_library_part not null,
  status public.import_library_part_status not null default 'reading',
  -- Each "Citește din nou" reads, and is charged, again under the next number.
  attempt integer not null default 1 constraint import_library_parts_attempt_range check (attempt between 1 and 1000),
  -- In Romanian, for members.
  failure_reason text
    constraint import_library_parts_failure_reason_length check (char_length(btrim(failure_reason)) between 1 and 1000),
  proposal jsonb constraint import_library_parts_proposal_object check (jsonb_typeof(proposal) = 'object'),
  changes jsonb constraint import_library_parts_changes_object check (jsonb_typeof(changes) = 'object'),
  version integer not null default 0 constraint import_library_parts_version_range check (version >= 0),
  proposal_dropped_at timestamptz,
  input_tokens bigint not null default 0 constraint import_library_parts_input_tokens_range check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0
    constraint import_library_parts_cached_input_tokens_range check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0
    constraint import_library_parts_output_tokens_range check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 constraint import_library_parts_cost_usd_range check (cost_usd >= 0),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  failed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (import_id, part),
  constraint import_library_parts_import_in_organization
    foreign key (import_id, organization_id) references public.imports (id, organization_id) on delete cascade,
  constraint import_library_parts_read_with_proposal check (
    status not in ('to_review', 'nothing_new', 'confirmed')
    or (read_at is not null and (proposal is not null or proposal_dropped_at is not null))
  ),
  constraint import_library_parts_failed_with_reason check (
    (status = 'failed') = (failed_at is not null) and (status <> 'failed' or failure_reason is not null)
  ),
  constraint import_library_parts_confirmed_stamped check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint import_library_parts_proposal_dropped check (
    proposal_dropped_at is null or (proposal is null and changes is null)
  )
);

create index import_library_parts_organization_idx on public.import_library_parts (organization_id);
create index import_library_parts_reading_idx on public.import_library_parts (updated_at) where status = 'reading';

comment on table public.import_library_parts is
  'A library proposal of a client import (ADR 034): the own instructions of one domain read from the pack, for a member to confirm after the client.';
comment on column public.import_library_parts.status is
  'reading (se citește), to_review (de verificat), nothing_new (nimic nou), failed (nu s-a putut citi), confirmed (confirmat). Not confirmed 14 days after the client, it has expired.';
comment on column public.import_library_parts.proposal is
  'What the reading proposed (InstructionsProposal of packages/import). Null before read, and once the import''s proposal is dropped.';
comment on column public.import_library_parts.changes is
  'What the member changed: titles, categories, choices, posts, bodies and unticked instructions. Dropped with the proposal.';
comment on column public.import_library_parts.version is
  'Counts the saves of changes; a save and the confirmation name the version they were made on.';
comment on column public.import_library_parts.cost_usd is
  'What the part''s model requests cost, in US dollars; the import''s totals include it.';

create trigger import_library_parts_set_updated_at before update on public.import_library_parts
  for each row execute function public.set_updated_at();

--   ILP07  a confirmed part does not change step
create function public.protect_import_library_part()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'confirmed' and new.status <> old.status then
    raise exception 'A confirmed library part does not change step.' using errcode = 'ILP07';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_import_library_part() from public, anon, authenticated;

create trigger import_library_parts_protect before update on public.import_library_parts
  for each row execute function public.protect_import_library_part();

alter table public.import_library_parts enable row level security;

revoke all on table public.import_library_parts from anon;

-- Members read; the queue consumer writes with the secret key, and a member's decisions go
-- through the functions below.
revoke insert, update, delete, truncate on table public.import_library_parts from authenticated;

create policy "members read the library parts of their imports"
  on public.import_library_parts for select to authenticated
  using (exists (select 1 from public.imports i where i.id = import_library_parts.import_id));

create function public.import_library_part_domain(p_part public.import_library_part)
returns public.instruction_domain
language sql
immutable
set search_path = ''
as $$
  select case p_part when 'instructions_psi' then 'psi' else 'ssm' end::public.instruction_domain;
$$;

alter table public.credit_entries
  add column import_part public.import_library_part,
  drop constraint credit_entries_sign,
  add constraint credit_entries_sign check (
    case kind
      when 'import_start' then credits <= 0
      when 'scanned_page' then credits <= 0
      when 'library_part' then credits <= 0
      when 'import_pages' then credits <> 0
      else credits > 0
    end
  ),
  add constraint credit_entries_library_part check (
    (kind in ('library_part', 'library_part_refund')) = (import_part is not null)
  );

comment on column public.credit_entries.import_part is
  'The library part whose reading was charged or given back; null for every other entry.';

create or replace function public.credit_period_counts(
  p_organization_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (granted int, used int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(e.credits) filter (where e.kind = 'grant'), 0)::int,
    coalesce(-sum(e.credits - e.gift_credits) filter (where e.kind in (
      'import_start', 'import_pages', 'scanned_page', 'refund', 'library_part', 'library_part_refund'
    )), 0)::int
  from public.credit_entries e
  where e.organization_id = p_organization_id
    and e.created_at >= p_period_start
    and e.created_at < p_period_end;
$$;

drop function public.charge_credits(
  uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int,
  timestamptz, timestamptz, int
);

-- `p_import_part` names the library part a `library_part` charge is for.
create function public.charge_credits(
  p_organization_id uuid,
  p_kind public.credit_entry_kind,
  p_credits int,
  p_import_id uuid,
  p_import_file_id uuid,
  p_page int,
  p_key text,
  p_require boolean,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_allowance int,
  p_previous_start timestamptz,
  p_previous_end timestamptz,
  p_previous_allowance int,
  p_import_part public.import_library_part default null
)
returns table (charged int, refused boolean, balance int, gift_left int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current record;
  existing public.credit_entries;
  from_month int;
  from_gift int;
  below int;
begin
  if p_kind not in ('import_start', 'import_pages', 'scanned_page', 'library_part') or p_credits is null
    or p_credits < 0 or p_key is null
    or (p_kind = 'library_part') <> (p_import_part is not null) then
    raise exception 'not_a_charge' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || p_organization_id::text, 0));

  select * into current from public.credit_balance(
    p_organization_id, p_period_start, p_period_end, p_allowance,
    p_previous_start, p_previous_end, p_previous_allowance
  );

  select * into existing from public.credit_entries e where e.key = p_key;
  if found then
    return query select -existing.credits, false, current.balance, current.gift_left;
    return;
  end if;
  if p_import_id is not null and exists (
    select 1 from public.credit_entries e where e.import_id = p_import_id and e.kind = 'refund'
  ) then
    return query select 0, false, current.balance, current.gift_left;
    return;
  end if;

  if current.balance is null then
    insert into public.credit_entries (
      organization_id, kind, credits, import_id, import_file_id, page, key, import_part
    )
    values (
      p_organization_id, p_kind, -p_credits, p_import_id, p_import_file_id, p_page, p_key, p_import_part
    );
    return query select p_credits, false, null::int, current.gift_left;
    return;
  end if;

  if p_require and current.balance + current.gift_left < p_credits then
    return query select 0, true, current.balance, current.gift_left;
    return;
  end if;

  from_month := least(p_credits, greatest(current.balance, 0));
  from_gift := least(p_credits - from_month, current.gift_left);
  below := least(p_credits - from_month - from_gift, greatest(0, current.balance - from_month + 150));

  perform public.open_credit_period(
    p_organization_id, p_period_start, p_period_end, p_allowance, current.shortfall
  );
  insert into public.credit_entries (
    organization_id, kind, credits, gift_credits, import_id, import_file_id, page, key, import_part
  )
  values (
    p_organization_id, p_kind, -(from_month + from_gift + below), -from_gift,
    p_import_id, p_import_file_id, p_page, p_key, p_import_part
  );

  return query select
    from_month + from_gift + below, false,
    current.balance - from_month - below, current.gift_left - from_gift;
end;
$$;

revoke all on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int, public.import_library_part) from public, anon, authenticated;
grant execute on function public.charge_credits(uuid, public.credit_entry_kind, int, uuid, uuid, int, text, boolean, timestamptz, timestamptz, int, timestamptz, timestamptz, int, public.import_library_part) to service_role;

create function public.library_part_charge_key(
  p_import_id uuid,
  p_part public.import_library_part,
  p_attempt int
)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'library:' || p_import_id::text || ':' || p_part::text || ':' || p_attempt::text;
$$;

grant execute on function public.library_part_charge_key(uuid, public.import_library_part, int) to service_role;

-- A reading that failed gives back what it was charged, the gift's part to the gift; the other
-- part and the client's reading keep theirs.
create function public.refund_library_part_credits(
  p_import_id uuid,
  p_part public.import_library_part,
  p_attempt int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.credit_entries;
  refund_key text := 'refund:' || public.library_part_charge_key(p_import_id, p_part, p_attempt);
begin
  select * into charge from public.credit_entries e
  where e.key = public.library_part_charge_key(p_import_id, p_part, p_attempt);
  if not found or charge.credits = 0 then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credits:' || charge.organization_id::text, 0));
  if exists (select 1 from public.credit_entries e where e.key = refund_key) then
    return 0;
  end if;
  insert into public.credit_entries (
    organization_id, kind, credits, gift_credits, import_id, key, import_part
  )
  values (
    charge.organization_id, 'library_part_refund', -charge.credits, -charge.gift_credits,
    p_import_id, refund_key, p_part
  );
  return -charge.credits;
end;
$$;

revoke all on function public.refund_library_part_credits(uuid, public.import_library_part, int) from public, anon, authenticated;
grant execute on function public.refund_library_part_credits(uuid, public.import_library_part, int) to service_role;

-- Every way a part fails runs through this: the consumer, the dead letters and the stall rule.
-- A part fails before its request is sent (its files too large) or on our side, so it gets its
-- reading back either way.
create function public.refund_credits_of_failed_library_part()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refund_library_part_credits(new.import_id, new.part, new.attempt);
  return null;
end;
$$;

revoke all on function public.refund_credits_of_failed_library_part() from public, anon, authenticated;

create trigger import_library_parts_refund_credits
  after update of status on public.import_library_parts
  for each row
  when (new.status = 'failed' and old.status = 'reading')
  execute function public.refund_credits_of_failed_library_part();

create function public.record_library_part_usage(
  p_import_id uuid,
  p_part public.import_library_part,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_usd numeric
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.import_library_parts
  set input_tokens = input_tokens + p_input_tokens,
      cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
      output_tokens = output_tokens + p_output_tokens,
      cost_usd = cost_usd + p_cost_usd
  where import_id = p_import_id and part = p_part;
  if not found then
    raise exception 'No such library part of the import.' using errcode = 'P0002';
  end if;
  update public.imports
  set input_tokens = input_tokens + p_input_tokens,
      cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
      output_tokens = output_tokens + p_output_tokens,
      cost_usd = cost_usd + p_cost_usd,
      usage_by_step = usage_by_step || jsonb_build_object('instructions', jsonb_build_object(
        'input_tokens', coalesce((usage_by_step #>> '{instructions,input_tokens}')::bigint, 0) + p_input_tokens,
        'cached_input_tokens',
          coalesce((usage_by_step #>> '{instructions,cached_input_tokens}')::bigint, 0) + p_cached_input_tokens,
        'output_tokens', coalesce((usage_by_step #>> '{instructions,output_tokens}')::bigint, 0) + p_output_tokens,
        'cost_usd', coalesce((usage_by_step #>> '{instructions,cost_usd}')::numeric, 0) + p_cost_usd
      ))
  where id = p_import_id;
end;
$$;

revoke all on function public.record_library_part_usage(uuid, public.import_library_part, bigint, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.record_library_part_usage(uuid, public.import_library_part, bigint, bigint, bigint, numeric)
  to service_role;

-- Called after lock_visible_import, which checks the caller sees the import.
--   P0002  no such part
create function public.lock_library_part(p_import_id uuid, p_part public.import_library_part)
returns public.import_library_parts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part public.import_library_parts;
begin
  select p.* into v_part
  from public.import_library_parts p
  where p.import_id = p_import_id and p.part = p_part
  for update;
  if not found then
    raise exception 'No such library part of the import.' using errcode = 'P0002';
  end if;
  return v_part;
end;
$$;

revoke all on function public.lock_library_part(uuid, public.import_library_part) from public, anon, authenticated;

-- Reviewed before the client is confirmed too; only confirming waits for it.
--   ILP01  the part is not ready for review
--   ILP02  the part was saved since the caller read it
create function public.save_import_library_part_changes(
  p_import_id uuid,
  p_part public.import_library_part,
  p_expected_version integer,
  p_changes jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part public.import_library_parts;
begin
  perform public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_part.status not in ('to_review', 'nothing_new') or v_part.proposal is null then
    raise exception 'The library part is not ready for review.' using errcode = 'ILP01';
  end if;
  if v_part.version <> p_expected_version then
    raise exception 'The library part was saved since it was read.' using errcode = 'ILP02';
  end if;
  update public.import_library_parts
  set changes = p_changes, version = version + 1
  where import_id = p_import_id and part = p_part;
  return v_part.version + 1;
end;
$$;

-- Answers the attempt the API sends the part's message for.
--   ILP06  the part has not failed, or its import is no longer open
create function public.retry_import_library_part(p_import_id uuid, p_part public.import_library_part)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_part.status <> 'failed' or v_import.status not in ('ready', 'confirmed') then
    raise exception 'Only a failed library part of an open import is read again.' using errcode = 'ILP06';
  end if;
  update public.import_library_parts
  set status = 'reading', attempt = attempt + 1, failure_reason = null, failed_at = null
  where import_id = p_import_id and part = p_part;
  return v_part.attempt + 1;
end;
$$;

-- Runs as its owner so that the part, which members do not write, is confirmed in the same
-- transaction as the modules and the posts' links. The API builds the payload from the proposal
-- and the member's changes, with each new body's text_hash, which the database cannot fold.
-- Every row passes its constraints and triggers: the body's shape, a module's category in its
-- domain, an archived module or client refused, and the posts' decisions following their links.
--   P0002  no such import for the caller, or no such part
--   ILP01  the part is not ready to confirm
--   ILP02  the part was saved since the caller read it
--   ILP03  the client is not confirmed yet
--   ILP04  the part expired, 14 days after the client was confirmed
--   ILP05  a new module's title is taken by another active module
--   22023  a payload that breaks its contract
create function public.apply_instruction_import(
  p_import_id uuid,
  p_part public.import_library_part,
  p_expected_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_part public.import_library_parts;
  v_domain public.instruction_domain := public.import_library_part_domain(p_part);
  v_user uuid := auth.uid();
  v_item jsonb;
  v_module_id uuid;
  v_created uuid[] := '{}';
  v_used uuid[] := '{}';
  v_links integer := 0;
begin
  v_import := public.lock_visible_import(p_import_id);
  v_part := public.lock_library_part(p_import_id, p_part);
  if v_import.kind <> 'client' then
    raise exception 'Only a client import proposes for the library.' using errcode = '22023';
  end if;
  if v_import.status <> 'confirmed' then
    raise exception 'Confirm the client first.' using errcode = 'ILP03';
  end if;
  if v_part.status not in ('to_review', 'nothing_new') then
    raise exception 'The library part is not ready to confirm.' using errcode = 'ILP01';
  end if;
  if v_part.version <> p_expected_version then
    raise exception 'The library part was saved since it was read.' using errcode = 'ILP02';
  end if;
  if v_import.confirmed_at < now() - interval '14 days' then
    raise exception 'The library part expired 14 days after the client was confirmed.' using errcode = 'ILP04';
  end if;

  perform public.import_payload_keys(p_payload, array['create', 'use'], 'library part');
  if jsonb_typeof(coalesce(p_payload -> 'create', '[]')) <> 'array'
    or jsonb_typeof(coalesce(p_payload -> 'use', '[]')) <> 'array' then
    raise exception 'The create and use of a library part payload are lists.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'create', '[]')) loop
    perform public.import_payload_keys(
      v_item, array['title', 'category', 'body', 'text_hash', 'job_position_ids'], 'new module'
    );
    if exists (
      select 1 from public.instruction_modules m
      where m.organization_id = v_import.organization_id
        and m.archived_at is null
        and lower(btrim(m.title)) = lower(btrim(v_item ->> 'title'))
    ) then
      raise exception 'The library already has a module titled %.', btrim(v_item ->> 'title')
        using errcode = 'ILP05';
    end if;
    insert into public.instruction_modules (organization_id, title, module_group, domain, created_by)
    values (
      v_import.organization_id,
      btrim(v_item ->> 'title'),
      (v_item ->> 'category')::public.instruction_module_group,
      v_domain,
      v_user
    )
    returning id into v_module_id;
    insert into public.instruction_module_versions (organization_id, module_id, number, body, text_hash, created_by)
    values (v_import.organization_id, v_module_id, 1, v_item -> 'body', v_item ->> 'text_hash', v_user);
    v_created := v_created || v_module_id;
    v_item := v_item || jsonb_build_object('module_id', v_module_id);
    v_links := v_links + public.link_imported_instruction(v_import, v_domain, v_item, v_user);
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'use', '[]')) loop
    perform public.import_payload_keys(v_item, array['module_id', 'job_position_ids'], 'library module');
    if not exists (
      select 1 from public.instruction_modules m
      where m.id = (v_item ->> 'module_id')::uuid
        and m.organization_id = v_import.organization_id
        and m.domain = v_domain
        and m.archived_at is null
    ) then
      raise exception 'The library has no active module % of the domain.', v_item ->> 'module_id'
        using errcode = '22023';
    end if;
    v_used := v_used || (v_item ->> 'module_id')::uuid;
    v_links := v_links + public.link_imported_instruction(v_import, v_domain, v_item, v_user);
  end loop;

  update public.import_library_parts
  set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user
  where import_id = p_import_id and part = p_part;

  return jsonb_build_object('created', to_jsonb(v_created), 'used', to_jsonb(v_used), 'links', v_links);
end;
$$;

-- A pair the post already has is skipped: the member may have applied the module by hand
-- between the client's confirm and the part's.
create function public.link_imported_instruction(
  p_import public.imports,
  p_domain public.instruction_domain,
  p_item jsonb,
  p_user uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_position_id uuid;
  v_added integer := 0;
begin
  if jsonb_typeof(coalesce(p_item -> 'job_position_ids', '[]')) <> 'array' then
    raise exception 'The job_position_ids of a library part item are a list.' using errcode = '22023';
  end if;
  for v_position_id in
    select distinct value::uuid from jsonb_array_elements_text(coalesce(p_item -> 'job_position_ids', '[]'))
  loop
    if not exists (
      select 1 from public.job_positions jp
      where jp.id = v_position_id and jp.client_id = p_import.client_id and jp.archived_at is null
    ) then
      raise exception 'The client has no active job position %.', v_position_id using errcode = '22023';
    end if;
    insert into public.job_position_instructions (
      organization_id, client_id, job_position_id, module_id, domain, created_by
    )
    values (
      p_import.organization_id, p_import.client_id, v_position_id, (p_item ->> 'module_id')::uuid,
      p_domain, p_user
    )
    on conflict (job_position_id, module_id) do nothing;
    if found then
      v_added := v_added + 1;
    end if;
  end loop;
  return v_added;
end;
$$;

revoke all on function public.link_imported_instruction(public.imports, public.instruction_domain, jsonb, uuid) from public, anon, authenticated;

comment on function public.apply_instruction_import(uuid, public.import_library_part, integer, jsonb) is $comment$
Confirms a library part of a confirmed client import in one transaction. The payload:

{
  "create": [{ "title", "category", "body", "text_hash", "job_position_ids": [uuid] }],
  "use": [{ "module_id", "job_position_ids": [uuid] }]
}

"create" adds a module of the part's domain with its first version; "use" takes an active module
of the library as it is, an identical one or a similar one the member chose. Each applies to the
client's active posts named, skipping a post that applies it already. Answers
{"created": [module ids], "used": [module ids], "links": the posts' links added}.
$comment$;

revoke all on function public.save_import_library_part_changes(uuid, public.import_library_part, integer, jsonb) from public, anon;
revoke all on function public.retry_import_library_part(uuid, public.import_library_part) from public, anon;
revoke all on function public.apply_instruction_import(uuid, public.import_library_part, integer, jsonb) from public, anon;
grant execute on function public.save_import_library_part_changes(uuid, public.import_library_part, integer, jsonb) to authenticated;
grant execute on function public.retry_import_library_part(uuid, public.import_library_part) to authenticated;
grant execute on function public.apply_instruction_import(uuid, public.import_library_part, integer, jsonb) to authenticated;

-- A part the queue stopped reading without recording a failure. Parts of an abandoned or failed
-- import are left as they are, and go with it.
create function public.fail_stalled_library_parts(p_reason text)
returns table (import_id uuid, part public.import_library_part)
language sql
set search_path = ''
as $$
  update public.import_library_parts p
  set status = 'failed', failure_reason = p_reason, failed_at = now()
  from public.imports i
  where i.id = p.import_id
    and i.status in ('ready', 'confirmed')
    and p.status = 'reading'
    and p.updated_at < now() - interval '6 hours'
  returning p.import_id, p.part;
$$;

comment on function public.fail_stalled_library_parts(text) is
  'Fails, with p_reason, the library parts of open or confirmed imports still reading 6 hours after their last change. Returns them.';

revoke all on function public.fail_stalled_library_parts(text) from public, anon, authenticated;
grant execute on function public.fail_stalled_library_parts(text) to service_role;

create or replace function public.drop_import_proposals()
returns integer
language sql
set search_path = ''
as $$
  with dropped as (
    update public.imports
    set proposal = null, changes = null, proposal_dropped_at = now()
    where status = 'confirmed' and proposal_dropped_at is null and confirmed_at < now() - interval '30 days'
    returning id
  ),
  parts as (
    update public.import_library_parts p
    set proposal = null, changes = null, proposal_dropped_at = now()
    from dropped d
    where p.import_id = d.id
  )
  select count(*)::integer from dropped;
$$;

comment on function public.drop_import_proposals() is
  'Drops the proposal and the changes of imports confirmed more than 30 days ago, with those of their library parts, and returns how many imports. The import, its files'' rows, its counts and its cost stay.';
