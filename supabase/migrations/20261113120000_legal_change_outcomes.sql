-- What a legal change means for the templates, decided by the legislation Worker without a model
-- (ADR 017, amended 2026-11-12): the form the templates were verified against is compared with
-- the new one, for the units the citation index cites.

alter table public.legal_changes
  -- Null until the change is assessed; a run that cannot assess it leaves it null and retries.
  add column outcome text
    constraint legal_changes_outcome_value check (outcome in ('no_impact', 'quote_differs', 'needs_review')),
  -- The consolidated form the new one was compared with; null for the act as published, the
  -- form an act with no verified one is compared with.
  add column compared_with date,
  -- [{ "name": "Legea 207/2026", "kind", "number", "date", "portalId", "gazette" }], from the
  -- portal's notes in the new form's text.
  add column amending_acts jsonb
    constraint legal_changes_amending_acts_array check (amending_acts is null or jsonb_typeof(amending_acts) = 'array'),
  -- [{ "unit": "Art. 36 alin. (2)", "subject", "operation", "date", "amendingAct" }].
  add column amended_units jsonb
    constraint legal_changes_amended_units_array check (amended_units is null or jsonb_typeof(amended_units) = 'array'),
  -- Why a person should read the change, in English for the platform admin.
  add column review jsonb
    constraint legal_changes_review_array check (review is null or jsonb_typeof(review) = 'array'),
  add column assessed_at timestamptz,
  add constraint legal_changes_assessed_at_matches check ((outcome is null) = (assessed_at is null)),
  add constraint legal_changes_compared_before check (compared_with is null or compared_with < consolidated_on);

-- The review is the platform admin's, in English; members read every other column.
revoke select on table public.legal_changes from authenticated;
grant select (
  id, act_id, seen_at, consolidated_on, amending_act, resolution, resolved_at, resolved_by_note,
  outcome, compared_with, amending_acts, amended_units, assessed_at
) on table public.legal_changes to authenticated;

create index legal_changes_unassessed_idx on public.legal_changes (act_id, consolidated_on)
  where resolution = 'open' and outcome is null;

-- One row per cited unit a change touched, per citation: the law's text before and after, which
-- the fix workflow applies to the template's passage and the Legislație page shows.
create table public.legal_change_passages (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references public.legal_changes (id) on delete cascade,
  manifest text not null constraint legal_change_passages_manifest_length check (char_length(manifest) between 1 and 40),
  template_file text not null constraint legal_change_passages_template_file_length check (char_length(template_file) between 1 and 200),
  -- Index among every <w:p> of the template's word/document.xml, as the citation index counts.
  paragraph integer not null constraint legal_change_passages_paragraph_not_negative check (paragraph >= 0),
  citation_form text not null constraint legal_change_passages_citation_form_value check (citation_form in ('quote', 'reference')),
  locator text,
  article text,
  unit_label text not null constraint legal_change_passages_unit_label_length check (char_length(unit_label) between 1 and 200),
  status text not null constraint legal_change_passages_status_value check (status in ('changed', 'added', 'repealed', 'missing', 'uncompared')),
  old_text text,
  new_text text,
  -- [{ "old", "new", "before", "after" }]: the law's words that changed, with a few around them.
  hunks jsonb not null default '[]'
    constraint legal_change_passages_hunks_array check (jsonb_typeof(hunks) = 'array'),
  constraint legal_change_passages_texts_match_status check (
    case status
      when 'changed' then old_text is not null and new_text is not null
      when 'uncompared' then old_text is not null and new_text is not null
      when 'added' then old_text is null and new_text is not null
      when 'repealed' then old_text is not null and new_text is null
      else old_text is null and new_text is null
    end
  ),
  constraint legal_change_passages_citation_unit_key
    unique (change_id, manifest, template_file, paragraph, citation_form, unit_label)
);

comment on table public.legal_change_passages is 'Cited units a legal change touched, with the law''s text before and after.';

alter table public.legal_change_passages enable row level security;

revoke all on table public.legal_change_passages from anon;
revoke insert, update, delete, truncate on table public.legal_change_passages from authenticated;

create policy "members read the passages of legal changes"
  on public.legal_change_passages for select to authenticated
  using ((select public.current_organization_id()) is not null);

-- The forms the templates were verified against: each act's newest form on the portal on
-- 2026-11-13, a republication included (H.G. 1048/2006's of 2022-04-06). An act never
-- consolidated has none to name and stays null. The rows are inserted for a fresh database, where
-- the Worker has not created them yet; its own upsert writes only the name and the portal id, so
-- it never clears these dates.
--
-- O.U.G. 195/2002 is the exception: it is verified against its form of 2026-08-25, not its
-- newest of 2026-11-06. That form's change (Legea 207/2026, art. 36 alin. (2), quoted in the
-- general training material) stays open, so the template fix workflow answers it as its first run.
insert into public.legal_acts (id, name, portal_id, verified_consolidated_on) values
  ('lege-126-1995', 'Legea 126/1995', 6350, '2026-03-27'),
  ('lege-16-1996', 'Legea 16/1996', 7937, '2024-07-25'),
  ('lege-202-2002', 'Legea 202/2002', 35778, '2022-05-03'),
  ('lege-346-2002', 'Legea 346/2002', 36905, '2024-11-11'),
  ('lege-349-2002', 'Legea 349/2002', 36778, '2024-11-11'),
  ('lege-46-2003', 'Legea 46/2003', 41483, '2026-03-14'),
  ('lege-53-2003', 'Legea 53/2003', 41625, '2026-04-27'),
  ('lege-481-2004', 'Legea 481/2004', 56923, '2026-07-06'),
  ('lege-95-2006', 'Legea 95/2006', 71139, '2026-08-08'),
  ('lege-307-2006', 'Legea 307/2006', 73657, '2026-05-08'),
  ('lege-319-2006', 'Legea 319/2006', 73772, '2021-07-25'),
  ('lege-135-2007', 'Legea 135/2007', 82217, '2024-10-08'),
  ('lege-286-2009', 'Legea 286/2009', 109854, '2026-10-18'),
  ('lege-187-2012', 'Legea 187/2012', 142722, '2023-07-09'),
  ('lege-227-2015', 'Legea 227/2015', 171280, '2026-10-25'),
  ('oug-195-2002', 'O.U.G. 195/2002', 41006, '2026-08-25'),
  ('oug-96-2003', 'O.U.G. 96/2003', 47216, '2015-06-25'),
  ('oug-21-2004', 'O.U.G. 21/2004', 51410, '2025-10-25'),
  ('oug-158-2005', 'O.U.G. 158/2005', 66305, '2026-07-01'),
  ('og-1-2000', 'O.G. 1/2000', 20639, '2014-02-01'),
  ('og-88-2001', 'O.G. 88/2001', 30372, '2021-06-30'),
  ('hg-1875-2005', 'H.G. 1875/2005', 68178, '2025-12-21'),
  ('hg-1876-2005', 'H.G. 1876/2005', 68307, '2007-07-12'),
  ('hg-300-2006', 'H.G. 300/2006', 69995, '2007-07-12'),
  ('hg-493-2006', 'H.G. 493/2006', 71198, '2007-07-12'),
  ('hg-971-2006', 'H.G. 971/2006', 74127, '2015-06-01'),
  ('hg-1048-2006', 'H.G. 1048/2006', 74559, '2022-04-06'),
  ('hg-1092-2006', 'H.G. 1092/2006', 74917, '2020-12-28'),
  ('hg-1093-2006', 'H.G. 1093/2006', 74889, '2026-02-03'),
  ('hg-1218-2006', 'H.G. 1218/2006', 75978, '2026-02-03'),
  ('hg-1425-2006', 'H.G. 1425/2006', 76337, '2022-03-07'),
  ('hg-355-2007', 'H.G. 355/2007', 82130, '2012-01-19'),
  ('hg-600-2007', 'H.G. 600/2007', 83571, '2015-06-01'),
  ('hg-955-2010', 'H.G. 955/2010', 122404, '2011-12-27'),
  ('ordin-450-825-2006', 'Ordinul 450/825/2006', 74362, '2009-04-17'),
  ('omai-712-2005', 'OMAI 712/2005', 63056, '2005-09-19'),
  ('omai-1259-2006', 'OMAI 1259/2006', 70912, '2020-01-14')
on conflict (id) do update set verified_consolidated_on = excluded.verified_consolidated_on;

-- Non-production recorded the Fiscal Code's form of 2026-10-25 against its form of 2026-10-18.
-- Compared the same way the Worker compares: Legea 204/2026 supplemented art. 342, which no
-- template cites. Where the change was never recorded, nothing is updated.
update public.legal_changes
set
  outcome = 'no_impact',
  compared_with = '2026-10-18',
  amending_acts = '[{"kind": "LEGEA", "number": "204", "date": "2026-10-22", "name": "Legea 204/2026", "portalId": null, "gazette": {"number": "886", "date": "2026-10-22"}}]',
  amended_units = '[{"unit": "Art. 342", "subject": "Articolul 342, Sectiunea a 2-a, Capitolul I, Titlul VIII", "operation": "supplemented", "date": "2026-10-25", "amendingAct": "Legea 204/2026"}]',
  review = '[]',
  assessed_at = now(),
  resolution = 'no_impact',
  resolved_at = now(),
  resolved_by_note = 'Modificarea adusă de Legea 204/2026 atinge art. 342; niciun text citat în documente nu s-a schimbat.'
where act_id = 'lege-227-2015'
  and consolidated_on = '2026-10-25'
  and resolution = 'open'
  and outcome is null;
