-- What a client's document was refused for when its data is missing (the codes of the
-- readiness list), so the Legislație page can lead to where each one is filled in.

alter table public.regeneration_job_items
  add column missing text[]
    constraint regeneration_job_items_missing_when_failed
      check (missing is null or (status = 'failed' and cardinality(missing) >= 1));

comment on column public.regeneration_job_items.missing is
  'The codes of the data the document prints that was missing, for an item failed for that reason; null otherwise, and for items recorded before the codes were kept.';

-- A parameter cannot be added in place: the old signature would stay beside the new one, and a
-- call with four arguments would match both.
drop function public.record_regeneration_item(uuid, uuid, text, text);

-- An item that is no longer waiting is left as it is and false comes back, so a message the
-- queue delivers twice is counted once.
create function public.record_regeneration_item(
  p_job_id uuid,
  p_client_id uuid,
  p_status text,
  p_detail text,
  p_missing text[] default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_status not in ('done', 'skipped', 'failed') then
    raise exception 'An item ends done, skipped or failed.' using errcode = '22023';
  end if;

  update public.regeneration_job_items
  set status = p_status, detail = p_detail, missing = p_missing, updated_at = now()
  where job_id = p_job_id and client_id = p_client_id and status = 'queued';
  if not found then
    return false;
  end if;

  update public.regeneration_jobs
  set done_count = done_count + (p_status = 'done')::integer,
      skipped_count = skipped_count + (p_status = 'skipped')::integer,
      failed_count = failed_count + (p_status = 'failed')::integer,
      finished_at = case
        when done_count + skipped_count + failed_count + 1 = total_count then now()
      end
  where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.record_regeneration_item(uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_regeneration_item(uuid, uuid, text, text, text[]) to service_role;
