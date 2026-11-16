-- No check on purpose: a value refused here would fail the write that records the issued invoice.
alter table public.billing_invoices
  -- The amount without VAT the Oblio document prints, in the currency's cents; negative for a
  -- storno. Null until Oblio has issued it, and for an invoice issued before it was kept, until
  -- the backfill script fills it.
  add column subtotal_cents int;
