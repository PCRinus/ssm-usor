-- Stripe's side of a subscription, the webhook log and the issued invoices (ADR 029, phase 2).

create type public.billing_interval as enum ('month', 'year');
create type public.billing_document_kind as enum ('invoice', 'proforma');

-- Every Stripe column stays null until the organization picks a plan: the trial lives here alone.
alter table public.subscriptions
  -- The Stripe account the customer and subscription live in; a move from the PFA to an SRL
  -- may change it (ADR 029).
  add column stripe_account text
    constraint subscriptions_stripe_account_format check (stripe_account ~ '^acct_[A-Za-z0-9]+$'),
  add column stripe_customer_id text
    constraint subscriptions_stripe_customer_format check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  add column stripe_subscription_id text
    constraint subscriptions_stripe_subscription_unique unique
    constraint subscriptions_stripe_subscription_format
      check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  add column billing_interval public.billing_interval,
  -- The catalogue version of the subscription's prices, such as v1; a price change moves it at
  -- the renewal (ADR 029).
  add column price_version text
    constraint subscriptions_price_version_format check (price_version ~ '^v[0-9]+$'),
  add column employee_packs int not null default 0
    constraint subscriptions_employee_packs_non_negative check (employee_packs >= 0),
  add column extra_members int not null default 0
    constraint subscriptions_extra_members_non_negative check (extra_members >= 0),
  -- Where Oblio sends the invoices instead of the owner's email; null for the owner's.
  add column invoice_email text
    constraint subscriptions_invoice_email_format
      check (char_length(invoice_email) <= 254 and invoice_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column current_period_end timestamptz,
  add constraint subscriptions_stripe_customer_has_account
    check (stripe_customer_id is null or stripe_account is not null),
  add constraint subscriptions_stripe_subscription_complete
    check (
      stripe_subscription_id is null
      or (
        stripe_customer_id is not null
        and billing_interval is not null
        and price_version is not null
      )
    );

create index subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

-- Stripe delivers an event at least once, sometimes twice; a row makes the second a no-op.
create table public.stripe_events (
  id text primary key
    constraint stripe_events_id_format check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null
    constraint stripe_events_type_length check (char_length(type) between 1 and 100),
  received_at timestamptz not null default now(),
  -- Null while it has not been handled, or its handling failed and Stripe will retry.
  processed_at timestamptz,
  error text
    constraint stripe_events_error_length check (char_length(error) <= 2000)
);

comment on table public.stripe_events is 'Stripe webhook events received, for idempotent handling (ADR 029). Service role only.';

create index stripe_events_unprocessed_idx on public.stripe_events (received_at)
  where processed_at is null;

create table public.billing_invoices (
  -- The paid Stripe invoice; for a storno, the Stripe refund it reverses.
  stripe_invoice_id text primary key
    constraint billing_invoices_stripe_id_format check (stripe_invoice_id ~ '^[a-z]+_[A-Za-z0-9]+$'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- The issuer: the Stripe account the payment went to (ADR 029, the move to an SRL).
  stripe_account text not null
    constraint billing_invoices_stripe_account_format check (stripe_account ~ '^acct_[A-Za-z0-9]+$'),
  kind public.billing_document_kind not null,
  -- The total with VAT in the currency's cents, negative for a storno.
  amount_cents int not null,
  currency text not null
    constraint billing_invoices_currency_format check (currency ~ '^[a-z]{3}$'),
  -- Null until Oblio has issued it.
  issued_at timestamptz,
  oblio_series text
    constraint billing_invoices_oblio_series_length check (char_length(oblio_series) between 1 and 20),
  oblio_number text
    constraint billing_invoices_oblio_number_length check (char_length(oblio_number) between 1 and 20),
  oblio_link text
    constraint billing_invoices_oblio_link_https check (oblio_link ~ '^https://'),
  storno_of text references public.billing_invoices (stripe_invoice_id) on delete restrict,
  -- Our copy of Oblio's PDF in the billing-invoices bucket: access stays behind our own checks and
  -- outlives a change of Oblio account or link format.
  pdf_path text
    constraint billing_invoices_pdf_path_format
      check (pdf_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+\.pdf$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_oblio_issued
    check (
      (issued_at is null) = (oblio_series is null)
      and (issued_at is null) = (oblio_number is null)
      and (issued_at is null) = (oblio_link is null)
    ),
  constraint billing_invoices_storno_amount
    check (case when storno_of is null then amount_cents >= 0 else amount_cents < 0 end),
  constraint billing_invoices_storno_not_itself check (storno_of <> stripe_invoice_id),
  constraint billing_invoices_pdf_after_issue check (pdf_path is null or issued_at is not null)
);

comment on table public.billing_invoices is 'The invoices and proformas Oblio issued for Stripe payments, and their stornos (ADR 029). Owners read their own; only the service role writes.';

create trigger billing_invoices_set_updated_at before update on public.billing_invoices
  for each row execute function public.set_updated_at();

create index billing_invoices_organization_idx
  on public.billing_invoices (organization_id, issued_at desc);

create index billing_invoices_storno_idx on public.billing_invoices (storno_of)
  where storno_of is not null;

alter table public.stripe_events enable row level security;
alter table public.billing_invoices enable row level security;

revoke all on table public.stripe_events from anon, authenticated;
revoke all on table public.billing_invoices from anon;
revoke insert, update, delete, truncate on table public.billing_invoices from authenticated;

create policy "owners read their organization's invoices"
  on public.billing_invoices for select to authenticated
  using (
    organization_id = (select public.current_organization_id())
    and (select public.is_organization_owner())
  );

-- No policies on purpose: members never read the bucket directly; the API checks the member and
-- hands out a short-lived signed link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing-invoices', 'billing-invoices', false, 5242880, array['application/pdf']);
