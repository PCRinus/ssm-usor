-- A function's result columns cannot change in place, so it is dropped and made again.

drop function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer);

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
  copy_completed_at timestamptz,
  part_copies integer,
  incomplete_part_copies integer,
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
    own.written_at, own.expires_at, own.removed_at, own.completed_at,
    (select count(*)::integer from public.import_copies p
     where p.import_id = l.import_id and p.part is not null and p.removed_at is null),
    (select count(*)::integer from public.import_copies p
     where p.import_id = l.import_id and p.part is not null and p.removed_at is null
       and p.completed_at is null),
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
  'Every import across organizations, newest first, for the admin area (ADR 037): its row, or only its copies once the row is gone (row_deleted, listed by when the copy was written), with the import''s own copy and when it completed, the count of its parts'' kept copies and of those not completed, and the total of the filtered list. p_status is an import_status or row_deleted; reported_at is the latest of the import''s and its parts''.';

revoke all on function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_imports(public.import_kind, text, boolean, boolean, integer, integer) to service_role;
