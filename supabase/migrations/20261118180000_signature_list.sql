-- The Semnături place lists a member's own pending signatures one row per training, or per test
-- sheet, with every slot the member holds on it folded into the row. Every level groups by the
-- signer and the organization, so the list's predicates on both reach the pending signer index
-- and only that member's requests are read. The trainee's slot is signed in the portal and the
-- admitter's on paper, so neither is listed.
create view public.signature_list
with (security_invoker = true)
as
select
  w.training_id as id,
  'training'::text as kind,
  w.organization_id,
  w.signer_account_id,
  w.client_id,
  c.legal_name as client_name,
  t.domain,
  t.phase,
  null::public.knowledge_test as test,
  t.held_on as day,
  t.phase::text as subject,
  array_remove(
    array[
      case when bool_or(w.as_trainer) then 'trainer' end,
      case when bool_or(w.as_verifier) then 'verifier' end
    ],
    null
  ) as slots,
  min(w.issued_at) as issued_at,
  sum(w.request_count)::integer as signature_count,
  count(*)::integer as worker_count,
  string_agg(lower(public.unaccent_immutable(e.last_name || ' ' || e.first_name)), ' | '
    order by e.last_name, e.first_name) as search_names,
  jsonb_agg(
    jsonb_build_object(
      'employeeId', e.id,
      'lastName', e.last_name,
      'firstName', e.first_name,
      'agreement', case when a.employee_id is not null then jsonb_build_object(
        'state', a.state,
        'employeeSignedAt', a.employee_signed_at,
        'employerSignedAt', a.employer_signed_at
      ) end,
      'requests', w.requests
    )
    order by e.last_name, e.first_name
  ) as workers
from (
  select
    r.organization_id,
    r.signer_account_id,
    r.client_id,
    rec.training_id,
    rec.employee_id,
    bool_or(r.slot = 'trainer') as as_trainer,
    bool_or(r.slot = 'verifier') as as_verifier,
    min(r.issued_at) as issued_at,
    count(*) as request_count,
    jsonb_agg(jsonb_build_object('id', r.id, 'slot', r.slot) order by r.slot) as requests
  from public.signature_requests r
  join public.training_records rec on rec.id = r.training_record_id and rec.client_id = r.client_id
  where r.state = 'pending' and r.slot in ('trainer', 'verifier')
  group by r.organization_id, r.signer_account_id, r.client_id, rec.training_id, rec.id
) w
join public.trainings t on t.id = w.training_id and t.client_id = w.client_id
join public.clients c on c.id = w.client_id
join public.employees e on e.id = w.employee_id and e.client_id = w.client_id
left join public.employee_signing_agreements a on a.employee_id = e.id
group by
  w.organization_id, w.signer_account_id, w.client_id, w.training_id,
  c.legal_name, t.domain, t.phase, t.held_on
union all
select
  s.id,
  'test_sheet'::text,
  r.organization_id,
  r.signer_account_id,
  r.client_id,
  c.legal_name,
  tr.domain,
  null::public.training_phase,
  tr.test,
  tr.taken_on,
  'test'::text,
  array['examiner'],
  min(r.issued_at),
  count(*)::integer,
  1,
  lower(public.unaccent_immutable(e.last_name || ' ' || e.first_name)),
  jsonb_build_array(
    jsonb_build_object(
      'employeeId', e.id,
      'lastName', e.last_name,
      'firstName', e.first_name,
      'agreement', case when a.employee_id is not null then jsonb_build_object(
        'state', a.state,
        'employeeSignedAt', a.employee_signed_at,
        'employerSignedAt', a.employer_signed_at
      ) end,
      'requests', jsonb_agg(jsonb_build_object('id', r.id, 'slot', r.slot) order by r.slot)
    )
  )
from public.signature_requests r
join public.test_sheets s on s.id = r.test_sheet_id and s.client_id = r.client_id
join public.test_results tr on tr.id = s.test_result_id and tr.client_id = s.client_id
join public.clients c on c.id = r.client_id
join public.employees e on e.id = s.employee_id and e.client_id = s.client_id
left join public.employee_signing_agreements a on a.employee_id = e.id
where r.state = 'pending' and r.slot = 'examiner'
group by
  r.organization_id, r.signer_account_id, r.client_id, s.id,
  c.legal_name, tr.domain, tr.test, tr.taken_on, e.id, a.employee_id;

comment on view public.signature_list is
  'Each signer''s pending signatures as trainer, verifier or examiner, one row per training or test sheet, for the Semnături place (ADR 021, ADR 023, ADR 024).';
comment on column public.signature_list.id is
  'The training''s id, or the test sheet''s; unique for one signer, not across signers.';
comment on column public.signature_list.subject is
  'What the Ce semnezi filter matches: the training''s phase, or `test`.';
comment on column public.signature_list.issued_at is
  'The oldest pending request on the row, which the list''s default order and its waiting days count from.';
comment on column public.signature_list.signature_count is
  'The pending requests on the row: a worker counts once for each slot the signer holds on their record.';
comment on column public.signature_list.search_names is
  'Each worker''s last and first name, lowercase and without diacritics, joined by " | " so that a search can ask for every term in one name; the CNP is never searched.';
comment on column public.signature_list.workers is
  'The workers whose record or sheet awaits the signer: the employee, their signing agreement or null, and the pending requests, `{id, slot}`.';

revoke all on table public.signature_list from anon, authenticated;
grant select on table public.signature_list to authenticated, service_role;
