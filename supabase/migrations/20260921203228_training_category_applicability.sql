-- A missing interval means the specialist has not decided yet. Excluding a category is an
-- explicit choice, kept separately so old incomplete schedules never become ready by accident.
alter table public.clients
  add column administrative_training_not_applicable boolean not null default false,
  add column worker_training_not_applicable boolean not null default false,
  add constraint clients_administrative_training_choice
    check (not administrative_training_not_applicable or administrative_training_interval_months is null),
  add constraint clients_worker_training_choice
    check (not worker_training_not_applicable or worker_training_interval_months is null);
