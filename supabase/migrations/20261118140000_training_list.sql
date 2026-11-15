-- The client's Instruiri ținute tab searches, filters, sorts and pages over a client's trainings,
-- so what it filters on is computed here, once per query. Each aggregate is a join grouped by the
-- training and its client, so the list's client predicate reaches it through the join and only
-- that client's records and signatures are read.
create view public.training_list
with (security_invoker = true)
as
select
  t.id,
  t.organization_id,
  t.client_id,
  t.domain,
  t.phase,
  t.held_on,
  t.duration_minutes,
  t.material,
  t.trainer_name,
  t.trainer_job_title,
  t.verifier_name,
  t.verifier_job_title,
  t.supplementary_reason,
  t.source,
  t.themes_revision_id,
  t.notes,
  t.created_at,
  t.updated_at,
  coalesce(attendees.attendee_count, 0) as attendee_count,
  coalesce(attendees.search_names, '') as search_names,
  case when t.source = 'app' then coalesce(attendees.unsigned_trainees, 0) else 0 end
    as pending_trainee_count,
  case when t.source = 'app' then
    coalesce(attendees.trainer_unsigned, false)::integer
    + (t.verifier_name is not null and coalesce(attendees.verifier_unsigned, false))::integer
    + coalesce(attendees.admitter_unsigned, false)::integer
  else 0 end as pending_signer_count,
  coalesce(signatures.signed, false) as signed,
  coalesce(signatures.any_signature, false) or coalesce(sheet_rows.any_row, false) as has_signatures,
  t.source = 'paper' and coalesce(sheet_rows.printed, false) as printed,
  case
    when t.source = 'paper' then 'paper'
    when coalesce(attendees.unsigned_trainees, 0) > 0
      or coalesce(attendees.trainer_unsigned, false)
      or (t.verifier_name is not null and coalesce(attendees.verifier_unsigned, false))
      or coalesce(attendees.admitter_unsigned, false)
      then 'pending'
    when coalesce(signatures.signed, false) then 'electronic'
    else 'paper'
  end as signature_state
from public.trainings t
-- In the app a slot is signed only by a live signature, electronic or marked on paper: one still
-- requested, voided or never addressed is to sign. Every record has its own trainer, verifier
-- and admitter slot, so those count once per training while each trainee counts on their own.
left join (
  select
    r.training_id,
    r.client_id,
    count(*)::integer as attendee_count,
    (count(*) filter (where live.trainee is not true))::integer as unsigned_trainees,
    bool_or(live.trainer is not true) as trainer_unsigned,
    bool_or(live.verifier is not true) as verifier_unsigned,
    bool_or(r.admitted_on is not null and live.admitter is not true) as admitter_unsigned,
    string_agg(lower(public.unaccent_immutable(e.last_name || ' ' || e.first_name)), ' | '
      order by e.last_name, e.first_name) as search_names
  from public.training_records r
  join public.employees e on e.id = r.employee_id
  left join (
    select
      g.training_record_id,
      g.client_id,
      bool_or(g.slot = 'trainee') as trainee,
      bool_or(g.slot = 'trainer') as trainer,
      bool_or(g.slot = 'verifier') as verifier,
      bool_or(g.slot = 'admitter') as admitter
    from public.training_signatures g
    where g.voided_at is null
    group by g.training_record_id, g.client_id
  ) live on live.training_record_id = r.id and live.client_id = r.client_id
  group by r.training_id, r.client_id
) attendees on attendees.training_id = t.id and attendees.client_id = t.client_id
left join (
  select
    r.training_id,
    r.client_id,
    bool_or(g.method = 'electronic' and g.voided_at is null) as signed,
    true as any_signature
  from public.training_signatures g
  join public.training_records r on r.id = g.training_record_id and r.client_id = g.client_id
  group by r.training_id, r.client_id
) signatures on signatures.training_id = t.id and signatures.client_id = t.client_id
left join (
  select
    r.training_id,
    r.client_id,
    true as any_row,
    bool_or(w.voided_at is null and s.certified_at is not null) as printed
  from public.signed_sheet_rows w
  join public.signed_sheets s on s.id = w.signed_sheet_id
  join public.training_records r on r.id = w.training_record_id and r.client_id = w.client_id
  group by r.training_id, r.client_id
) sheet_rows on sheet_rows.training_id = t.id and sheet_rows.client_id = t.client_id;

comment on view public.training_list is
  'Every training held with what the client''s Instruiri ținute tab shows, searches, filters and sorts on (ADR 021, ADR 023).';
comment on column public.training_list.search_names is
  'Each attendee''s last and first name, lowercase and without diacritics, joined by " | " so that a search can ask for every term in one name; the CNP is never searched.';
comment on column public.training_list.pending_trainee_count is
  'On a training held in the app, the attendees without a live signature of their own.';
comment on column public.training_list.pending_signer_count is
  'On a training held in the app, the trainer, verifier and admitter slots without a live signature on any record, each counted once.';
comment on column public.training_list.signed is
  'Any record carries a live electronic signature, which freezes the training.';
comment on column public.training_list.has_signatures is
  'Any record carries a signature, voided and paper ones included, or a row on a stored sheet, which keeps the training from deletion.';
comment on column public.training_list.printed is
  'A training from paper printed as text on a live row of a certified sheet, which freezes it.';
comment on column public.training_list.signature_state is
  '`paper` for a training transcribed from paper; for one held in the app, `pending` while any slot lacks a live signature, else `electronic` when any is electronic, else `paper`, every slot marked signed by hand.';

revoke all on table public.training_list from anon, authenticated;
grant select on table public.training_list to authenticated, service_role;
