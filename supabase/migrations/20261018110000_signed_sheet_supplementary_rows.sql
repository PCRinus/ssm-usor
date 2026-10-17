-- The occupational safety sheet prints its supplementary trainings in a table of their own, so its
-- signed sheet has rows s1 and onward beside p1 (ADR 023, packages/contracts signed-sheet.ts).
alter table public.signed_sheet_rows drop constraint signed_sheet_rows_row_key_format;
alter table public.signed_sheet_rows add constraint signed_sheet_rows_row_key_format
  check (row_key ~ '^(h1|h2|adm|[ps][1-9][0-9]*)$');
