-- A periodic training lasts 30 minutes, 1 hour, 1 hour 30 minutes or 2 hours: the answer of the
-- SSM specialist asked in issue #81. Whole hours from 1 to 8 could not say the first and the
-- third, so the duration is kept in minutes.
alter table public.clients
  drop constraint clients_periodic_training_hours_range;

alter table public.clients
  rename column periodic_training_hours to periodic_training_minutes;

-- A duration over two hours is no longer a valid answer and none of the four stands for it, so
-- it is asked again: generating documents stops on a missing duration.
update public.clients
   set periodic_training_minutes = case
     when periodic_training_minutes <= 2 then periodic_training_minutes * 60
   end
 where periodic_training_minutes is not null;

alter table public.clients
  add constraint clients_periodic_training_minutes_allowed
  check (periodic_training_minutes in (30, 60, 90, 120));
