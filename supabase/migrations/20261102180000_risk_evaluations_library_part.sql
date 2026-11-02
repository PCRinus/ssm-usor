-- ADR 036, "The evaluations read from the pack": the client import's third library part. Postgres
-- refuses a new enum value inside the transaction that adds it, so the migration after this one
-- uses it.

alter type public.import_library_part add value 'risk_evaluations';
