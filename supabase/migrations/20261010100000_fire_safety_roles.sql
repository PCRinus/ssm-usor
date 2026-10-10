-- ADR 018. Its own file: a new enum value cannot be used in the transaction that adds it.
alter type public.responsible_person_role add value 'fire_safety_coordinator';
alter type public.responsible_person_role add value 'fire_intervention_leader';
