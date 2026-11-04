-- The admin area's Imports page (ADR 037, ADR 038): every import across organizations for the
-- secret key, and the named events that record an admin opening an improvement copy or a file
-- of one.
--   AUD02  an admin event without a platform admin named by the API

alter table audit.events drop constraint events_action_known;
alter table audit.events add constraint events_action_known check (
  action in (
    'insert', 'update', 'delete', 'impersonation_started', 'impersonation_ended', 'client_deleted',
    'import_copy_opened', 'import_copy_file_opened'
  )
);

-- No API role can write audit.events (ADR 033), so the API records an admin's act through this.
-- The actor is the account in the API's x-audit-actor header, believed only on a service-role
-- request, and must hold the admin claim.
create function public.record_admin_event(
  p_action text,
  p_table_name text,
  p_row_id uuid,
  p_organization_id uuid,
  p_details jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor record;
  v_id bigint;
begin
  if p_action is null or p_action not in ('import_copy_opened', 'import_copy_file_opened') then
    raise exception 'Not an admin event.' using errcode = '22023';
  end if;
  select * into v_actor from audit.current_actor();
  if v_actor.source is distinct from 'api' or not exists (
    select 1 from auth.users u
    where u.id = v_actor.actor_id and u.raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception 'An admin event names a platform admin.' using errcode = 'AUD02';
  end if;
  -- The admin acts as himself here, even during an impersonation he has open.
  insert into audit.events (action, table_name, row_id, organization_id, details, actor_id, impersonating_user_id, source)
  values (p_action, p_table_name, p_row_id, p_organization_id, p_details, v_actor.actor_id, null, 'api')
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.record_admin_event(text, text, uuid, uuid, jsonb) is
  'Records a named admin event in audit.events (ADR 033, ADR 038) for the platform admin the API names in x-audit-actor, and returns its id: import_copy_opened, import_copy_file_opened. AUD02 without such an admin.';

-- An abandoned or failed import's row goes 14 days after it ends and its copy stays 12 months
-- (ADR 037), so the list also holds the imports known only by their copies, kind and status
-- unknown, ended when their copy's 12 months began.
create function public.admin_list_imports(
  p_kind public.import_kind default null,
  p_status text default null,
  p_reported boolean default false,
  p_has_copy boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  import_id uuid,
  organization_id uuid,
  organization_name text,
  row_deleted boolean,
  kind public.import_kind,
  status public.import_status,
  created_at timestamptz,
  ended_at timestamptz,
  reading_version jsonb,
  reading_flags jsonb,
  quality jsonb,
  cost_usd numeric,
  reported_at timestamptz,
  copy_written_at timestamptz,
  copy_expires_at timestamptz,
  copy_removed_at timestamptz,
  part_copies integer,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  with listed as (
    select i.id as import_id, i.organization_id, false as row_deleted, i.kind, i.status,
      i.created_at, coalesce(i.confirmed_at, i.abandoned_at, i.failed_at) as ended_at,
      i.reading_version, i.reading_flags, i.quality, i.cost_usd,
      greatest(i.reported_at, (
        select max(p.reported_at) from public.import_library_parts p where p.import_id = i.id
      )) as reported_at,
      i.created_at as listed_at
    from public.imports i
    union all
    (
      select distinct on (c.import_id) c.import_id, c.organization_id, true,
        null::public.import_kind, null::public.import_status, null::timestamptz,
        c.expires_at - interval '12 months', null::jsonb, null::jsonb, null::jsonb,
        null::numeric, null::timestamptz, c.written_at
      from public.import_copies c
      where not exists (select 1 from public.imports i where i.id = c.import_id)
      order by c.import_id, c.part nulls first
    )
  )
  select l.import_id, l.organization_id, o.name, l.row_deleted, l.kind, l.status, l.created_at,
    l.ended_at, l.reading_version, l.reading_flags, l.quality, l.cost_usd, l.reported_at,
    own.written_at, own.expires_at, own.removed_at,
    (select count(*)::integer from public.import_copies p
     where p.import_id = l.import_id and p.part is not null and p.removed_at is null),
    count(*) over ()
  from listed l
  left join public.organizations o on o.id = l.organization_id
  left join public.import_copies own on own.import_id = l.import_id and own.part is null
  where (p_kind is null or l.kind = p_kind)
    and (
      p_status is null
      or (p_status = 'row_deleted' and l.row_deleted)
      or l.status::text = p_status
    )
    and (not coalesce(p_reported, false) or l.reported_at is not null)
    and (not coalesce(p_has_copy, false) or exists (
      select 1 from public.import_copies k where k.import_id = l.import_id and k.removed_at is null
    ))
  order by l.listed_at desc, l.import_id desc
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

comment on function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer) is
  'Every import across organizations, newest first, for the admin area (ADR 037): its row, or only its copies once the row is gone (row_deleted, listed by when the copy was written), with the import''s own copy, the count of its parts'' kept copies and the total of the filtered list. p_status is an import_status or row_deleted; reported_at is the latest of the import''s and its parts''.';

revoke all on function public.record_admin_event(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.record_admin_event(text, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer) to service_role;
