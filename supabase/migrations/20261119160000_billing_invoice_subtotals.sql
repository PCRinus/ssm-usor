-- No check on purpose: the row is written before Oblio issues the invoice, and a value refused
-- here would stop the invoice from being issued.
alter table public.billing_invoices
  -- Stripe's subtotal, without VAT, in the currency's cents; negative for a storno. Null for an
  -- invoice recorded before it was kept, until the backfill script fills it.
  add column subtotal_cents int;
