-- Two posts of the same staff category can be trained at different intervals: a welder every
-- 2 months and a sales agent every 3, both execution staff. The client's two intervals stay
-- the defaults; a post that differs says so here. Null follows the category.
alter table public.job_positions
  add column training_interval_months smallint,
  -- The ceilings of H.G. 1425/2006 art. 96, as on the client's own intervals.
  add constraint job_positions_training_interval_range check (
    training_interval_months between 1 and
      case staff_category when 'execution' then 6 else 12 end
  );

-- Updates are granted by column on this table; inserts are not.
grant update (training_interval_months) on table public.job_positions to authenticated;
