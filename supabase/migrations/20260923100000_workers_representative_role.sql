-- Its own file: a new enum value cannot be used in the transaction that adds it.
alter type public.responsible_person_role add value 'workers_representative';
