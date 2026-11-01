-- ADR 034: an instruction module's version holds a body of headings and numbered articles that
-- the document engine prints, instead of a Word file. The test modules are deleted, not
-- converted: no customer has one (ADR 034, decision 10).

delete from public.job_position_instructions;
delete from public.instruction_modules;

-- Postgres refuses a new enum value inside the transaction that adds it, so the check below
-- names the SSM categories only.
alter type public.instruction_module_group add value 'premises_activity';
alter type public.instruction_module_group add value 'installation_equipment';
alter type public.instruction_module_group add value 'hazardous_work';

alter table public.instruction_modules
  add constraint instruction_modules_group_in_domain check (
    (module_group in ('work_activity', 'work_equipment', 'protective_equipment')) = (domain = 'ssm')
  );

comment on column public.instruction_modules.module_group is
  'The category: work_activity, work_equipment or protective_equipment for ssm; premises_activity, installation_equipment or hazardous_work for psi (ADR 034).';

create function public.instruction_article_count(p_body jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select jsonb_array_length(jsonb_path_query_array(p_body, '$.blocks[*] ? (@.kind == "article")'));
$$;

-- Mirrors instructionBodySchema in packages/contracts, which the API applies first.
create function public.is_instruction_body(p_body jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_body) = 'object'
    and (p_body - 'blocks') = '{}'::jsonb
    and jsonb_typeof(p_body -> 'blocks') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_body -> 'blocks') block
      where not (
        jsonb_typeof(block) = 'object'
        and case block ->> 'kind'
          when 'heading' then
            (block - 'kind' - 'text') = '{}'::jsonb
            and jsonb_typeof(block -> 'text') = 'string'
            and char_length(btrim(block ->> 'text')) between 1 and 300
            and strpos(block ->> 'text', chr(10)) = 0
            and strpos(block ->> 'text', chr(13)) = 0
          when 'article' then
            (block - 'kind' - 'paragraphs') = '{}'::jsonb
            and jsonb_typeof(block -> 'paragraphs') = 'array'
            and jsonb_array_length(block -> 'paragraphs') >= 1
            and not exists (
              select 1 from jsonb_array_elements(block -> 'paragraphs') paragraph
              where jsonb_typeof(paragraph) <> 'string'
                or char_length(btrim(paragraph #>> '{}')) not between 1 and 20000
                or strpos(paragraph #>> '{}', chr(10)) > 0
                or strpos(paragraph #>> '{}', chr(13)) > 0
            )
          else false
        end
      )
    )
    and public.instruction_article_count(p_body) between 1 and 400
    and (
      select coalesce(sum(char_length(piece.text)), 0)
      from jsonb_array_elements(p_body -> 'blocks') block
      cross join lateral (
        select block ->> 'text' as text where block ->> 'kind' = 'heading'
        union all
        select paragraph from jsonb_array_elements_text(
          case when block ->> 'kind' = 'article' then block -> 'paragraphs' else '[]'::jsonb end
        ) paragraph
      ) piece
    ) <= 200000;
$$;

alter table public.instruction_module_versions
  drop constraint instruction_module_versions_path_format,
  drop column docx_path,
  drop column sha256,
  drop column size_bytes,
  drop column article_count,
  add column body jsonb not null
    constraint instruction_module_versions_body_shape check (public.is_instruction_body(body)),
  -- SHA-256 of the body folded as the import folds text (foldedBody in packages/contracts):
  -- the database cannot fold, so the API computes it.
  add column text_hash text not null
    constraint instruction_module_versions_text_hash_format check (text_hash ~ '^[0-9a-f]{64}$'),
  add column article_count integer not null
    generated always as (public.instruction_article_count(body)) stored;

comment on table public.instruction_module_versions is
  'The bodies of an instruction module, one row per save that changed its text, never changed in place (ADR 034).';
comment on column public.instruction_module_versions.body is
  'The text as data: {blocks: [{kind: heading, text} | {kind: article, paragraphs: [text]}]}, 1 to 400 articles and at most 200,000 characters.';
comment on column public.instruction_module_versions.article_count is
  'The article blocks of the body: what the training themes cite as "Art. 1–N".';

-- A save that changes no word would mark every client's own instructions behind for nothing.
create function public.refuse_unchanged_instruction_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.text_hash = (
    select v.text_hash from public.instruction_module_versions v
    where v.module_id = new.module_id
    order by v.number desc
    limit 1
  ) then
    raise exception 'The text is the current version''s.' using errcode = 'INS08';
  end if;
  return new;
end;
$$;

create trigger instruction_module_versions_refuse_unchanged before insert on public.instruction_module_versions
  for each row execute function public.refuse_unchanged_instruction_text();

revoke all on function public.refuse_unchanged_instruction_text() from public, anon;

drop policy "members read their instruction module files" on storage.objects;
drop policy "members upload the files of their instruction module versions" on storage.objects;
drop function public.is_instruction_module_path(text);

-- Storage refuses deleting its rows unless asked to. The stored bytes of the test files stay
-- behind in the storage backend unless the bucket is emptied from the dashboard first.
do $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'instruction-modules';
  delete from storage.buckets where id = 'instruction-modules';
end;
$$;
