-- ADR 042: the sheet template's form 2 carries a field for the line on transcribed rows and two
-- lines of note in each table row. A stored sheet never changes what it printed, so rows filled
-- on it later follow the form it was drawn from; every sheet stored before is form 1.
alter table public.signed_sheets
  add column form_version smallint not null default 1
    constraint signed_sheets_form_version_positive check (form_version >= 1);

comment on column public.signed_sheets.form_version is
  'The template form the sheet was drawn from, which rows filled on it later follow (ADR 042).';
