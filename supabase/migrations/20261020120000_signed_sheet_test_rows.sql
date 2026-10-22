-- A test result fills a row of a signed sheet as a training record does (ADR 024): a `t` row of
-- the block "Rezultatele testărilor" on the occupational safety sheet, five a sheet as annex 11
-- prints them, or a periodic row of the fire-safety sheet, whose form has no such block. No slot
-- signs either: annex 11's block has no signature column, and the test sheet is what the trainee
-- and the examiner sign.

create unique index test_results_id_client_key on public.test_results (id, client_id);

alter table public.signed_sheet_rows
  alter column training_record_id drop not null,
  add column test_result_id uuid,
  add constraint signed_sheet_rows_result_of_client
    foreign key (test_result_id, client_id) references public.test_results (id, client_id)
    on delete restrict,
  add constraint signed_sheet_rows_record_or_result
    check (num_nonnulls(training_record_id, test_result_id) = 1),
  drop constraint signed_sheet_rows_row_key_format,
  add constraint signed_sheet_rows_row_key_format
    check (row_key ~ '^(h1|h2|adm|[ps][1-9][0-9]*|t[1-5])$'),
  add constraint signed_sheet_rows_test_block_holds_results
    check (row_key !~ '^t' or test_result_id is not null),
  add constraint signed_sheet_rows_result_in_a_table
    check (test_result_id is null or row_key ~ '^[pt][1-9]'),
  -- A result is never printed as text when the sheet is drawn up: its row is always fields.
  add constraint signed_sheet_rows_result_filled check (test_result_id is null or not printed_as_text);

create unique index signed_sheet_rows_live_result_key
  on public.signed_sheet_rows (test_result_id) where voided_at is null;
create index signed_sheet_rows_test_result_id_idx on public.signed_sheet_rows (test_result_id);

comment on table public.signed_sheet_rows is
  'Which training record or test result fills which row of a signed sheet (ADR 023, ADR 024). Secret key writes.';

-- A result goes in the test block of the occupational safety sheet and in the periodic table of
-- the fire-safety one.
create or replace function public.check_signed_sheet_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.training_record_id is not null then
    if not exists (
      select 1
      from public.signed_sheets s
      join public.training_records r on r.employee_id = s.employee_id
      join public.trainings t on t.id = r.training_id and t.domain = s.domain
      where s.id = new.signed_sheet_id and r.id = new.training_record_id
    ) then
      raise exception 'row_not_of_sheet' using errcode = '23514';
    end if;
  elsif not exists (
    select 1
    from public.signed_sheets s
    join public.test_results x on x.employee_id = s.employee_id and x.domain = s.domain
    where s.id = new.signed_sheet_id
      and x.id = new.test_result_id
      and (new.row_key ~ '^t') = (s.domain = 'ssm')
  ) then
    raise exception 'row_not_of_sheet' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger signed_sheet_rows_check on public.signed_sheet_rows;
create trigger signed_sheet_rows_check
  before insert or update of signed_sheet_id, training_record_id, test_result_id, client_id
  on public.signed_sheet_rows
  for each row execute function public.check_signed_sheet_row();
