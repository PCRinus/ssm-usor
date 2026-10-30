-- ADR 032. Alone in its migration: a value added to an enum cannot be used in the transaction
-- that adds it, and the next migration uses it.
alter type public.test_state add value 'unverified' after 'pending';
