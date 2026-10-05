-- H.G. 1425/2006 art. 80¹ sets one hour as the shortest periodic training, and the SSM contact
-- confirmed 60, 90 and 120 minutes only (issue #307). A client set to 30 minutes is asked again:
-- generating documents stops on a missing duration.
update public.clients
   set periodic_training_minutes = null
 where periodic_training_minutes = 30;

alter table public.clients
  drop constraint clients_periodic_training_minutes_allowed;

alter table public.clients
  add constraint clients_periodic_training_minutes_allowed
  check (periodic_training_minutes in (60, 90, 120));
