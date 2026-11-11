-- ADR 042: reading a product's safety data sheet in the substance dialog is charged in credits
-- and given back when it fails or the file is refused. Postgres refuses a new enum value inside
-- the transaction that adds it, so the migration after this one uses them.

-- One reading of a safety data sheet: 3 credits, outside any import.
alter type public.credit_entry_kind add value 'safety_sheet';
-- What one reading of a safety data sheet was charged, given back when it failed.
alter type public.credit_entry_kind add value 'safety_sheet_refund';
