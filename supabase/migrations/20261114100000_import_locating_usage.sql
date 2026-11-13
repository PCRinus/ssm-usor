-- Where an employee import's pages write what was read from them (ADR 043) is a step of its own,
-- its usage counted beside the others' and never charged in credits.

comment on column public.imports.usage_by_step is
  'The usage of each step, sorting, reading, scanning and locating, as {"<step>": {"input_tokens", "cached_input_tokens", "output_tokens", "cost_usd"}}, and of the library parts, as instructions and risks; the totals beside it are their sums.';

create or replace function public.record_import_usage(
  p_import_id uuid,
  p_import_file_id uuid,
  p_step text,
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
  if p_step is null or p_step not in ('sorting', 'reading', 'scanning', 'locating') then
    raise exception 'No such step of an import.' using errcode = '22023';
  end if;
  update public.imports
  set input_tokens = input_tokens + p_input_tokens,
      cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
      output_tokens = output_tokens + p_output_tokens,
      cost_usd = cost_usd + p_cost_usd,
      usage_by_step = usage_by_step || jsonb_build_object(p_step, jsonb_build_object(
        'input_tokens', coalesce((usage_by_step #>> array[p_step, 'input_tokens'])::bigint, 0) + p_input_tokens,
        'cached_input_tokens',
          coalesce((usage_by_step #>> array[p_step, 'cached_input_tokens'])::bigint, 0) + p_cached_input_tokens,
        'output_tokens', coalesce((usage_by_step #>> array[p_step, 'output_tokens'])::bigint, 0) + p_output_tokens,
        'cost_usd', coalesce((usage_by_step #>> array[p_step, 'cost_usd'])::numeric, 0) + p_cost_usd
      ))
  where id = p_import_id;
  if not found then
    raise exception 'No such import.' using errcode = 'P0002';
  end if;
  if p_import_file_id is not null then
    update public.import_files
    set input_tokens = input_tokens + p_input_tokens,
        cached_input_tokens = cached_input_tokens + p_cached_input_tokens,
        output_tokens = output_tokens + p_output_tokens,
        cost_usd = cost_usd + p_cost_usd
    where id = p_import_file_id and import_id = p_import_id;
    if not found then
      raise exception 'No such file of the import.' using errcode = 'P0002';
    end if;
  end if;
end;
$$;
