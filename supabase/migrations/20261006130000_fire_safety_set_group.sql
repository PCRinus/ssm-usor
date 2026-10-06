-- ADR 016. On its own: a new enum value cannot be used in the transaction that adds it.
alter type public.document_group add value 'fire_safety_set';
