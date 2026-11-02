-- ADR 034, "Credits": reading an import's own instructions for the library is charged when its
-- request is sent, and given back when that reading fails on our side. Postgres refuses a new
-- enum value inside the transaction that adds it, so the migration after this one uses them.

-- One reading of a library part: 25 credits for the SSM instructions, 10 for the PSI ones.
alter type public.credit_entry_kind add value 'library_part';
-- What one reading of a library part was charged, given back when it failed.
alter type public.credit_entry_kind add value 'library_part_refund';
