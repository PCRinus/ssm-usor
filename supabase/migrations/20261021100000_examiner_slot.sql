-- The test sheet's second signer (ADR 024). Its own migration: a value added to an enum cannot be
-- used in the transaction that adds it, and 20261021100100_test_sheets.sql uses it.
alter type public.signer_slot add value 'examiner';
