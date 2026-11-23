-- The suggested zones the specialist ignored (ADR 045), kept per factor: a factor that becomes
-- unacceptable later is suggested again on its own, while those already ignored stay hidden.

create table public.risk_zone_ignored_factors (
  factor_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint risk_zone_ignored_factors_factor_in_client
    foreign key (factor_id, client_id) references public.risk_factors (id, client_id) on delete cascade,
  constraint risk_zone_ignored_factors_client_in_organization
    foreign key (client_id, organization_id) references public.clients (id, organization_id) on delete restrict
);

create index risk_zone_ignored_factors_client_id_idx on public.risk_zone_ignored_factors (client_id);
create index risk_zone_ignored_factors_organization_id_idx on public.risk_zone_ignored_factors (organization_id);

comment on table public.risk_zone_ignored_factors is
  'The risk factors whose zone suggestion the specialist ignored, kept out of the suggestions until restored (ADR 045).';

create trigger risk_zone_ignored_factors_protect_archived_client
  before insert or update or delete on public.risk_zone_ignored_factors
  for each row execute function public.protect_rows_of_archived_client();

alter table public.risk_zone_ignored_factors enable row level security;
revoke all on table public.risk_zone_ignored_factors from anon;

create policy "members read their ignored risk zone factors"
  on public.risk_zone_ignored_factors for select to authenticated
  using (organization_id = (select public.current_organization_id()));

create policy "members ignore risk zone factors of their active clients"
  on public.risk_zone_ignored_factors for insert to authenticated
  with check (
    (organization_id = (select public.current_organization_id()))
    and (exists (select 1 from public.clients c where ((c.id = risk_zone_ignored_factors.client_id) and (c.organization_id = (select public.current_organization_id())) and (c.archived_at is null))))
  );

create policy "members restore their ignored risk zone factors"
  on public.risk_zone_ignored_factors for delete to authenticated
  using (organization_id = (select public.current_organization_id()));

revoke update on table public.risk_zone_ignored_factors from authenticated;
