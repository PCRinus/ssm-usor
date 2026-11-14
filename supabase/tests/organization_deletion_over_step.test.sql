begin;
select plan(3);

insert into public.organizations (id, name) values
  ('11111111-0000-4000-8000-000000000001', 'Org A');

insert into public.clients (id, organization_id, legal_name, cui, stage) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Tâmplăria Stejar SRL', '1590082', 'client');

insert into public.employees (organization_id, client_id, last_name, first_name, job_title, hired_at)
select '11111111-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Pas', 'Lucrător ' || n, 'Tâmplar', '2024-01-01'
from generate_series(1, 251) n;

insert into public.subscriptions (organization_id, plan, status, access_until)
values ('11111111-0000-4000-8000-000000000001', 'start', 'active', null);

select isnt(
  (select employees_over_step_since from public.subscriptions),
  null,
  'the organization runs a clock'
);

-- As the flows' clean-up and a deletion job do: the rows that restrict it first, then the
-- organization, whose cascade takes the subscription; the deferred refresh runs after all of it.
select lives_ok(
  $$ delete from public.employees where organization_id = '11111111-0000-4000-8000-000000000001';
     delete from public.job_positions where organization_id = '11111111-0000-4000-8000-000000000001';
     delete from public.clients where organization_id = '11111111-0000-4000-8000-000000000001';
     delete from public.organizations where id = '11111111-0000-4000-8000-000000000001';
     set constraints all immediate $$,
  'an organization with a running clock is deleted'
);

select is(
  (select count(*)::int from public.subscription_changes where organization_id = '11111111-0000-4000-8000-000000000001'),
  0,
  'and nothing of it is left in the change log'
);

select * from finish();
rollback;
