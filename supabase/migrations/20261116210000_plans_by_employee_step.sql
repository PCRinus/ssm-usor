-- Plans are priced by a step of employees, with fixed users and no packs or extra member (ADR 029,
-- amendment of 2026-11-14). The steps are `billingPlans` in packages/contracts/src/billing.ts.

alter table public.subscriptions
  -- The employees the chosen plan's price covers; null until a plan is chosen, and on Enterprise.
  add column employee_step int;

-- A v1 subscription takes the smallest step of its plan that covers what it had: the plan's
-- included employees (250 on Start, 1,500 on Profesional) and its packs (of 50 and 500).
update public.subscriptions s
set employee_step = coalesce(
  (
    select min(step)
    from unnest(
      case s.plan
        when 'start' then array[250, 500, 750]
        else array[500, 1000, 1500, 2000, 3000, 4000, 5000]
      end
    ) as step
    where step >= case s.plan
      when 'start' then 250 + 50 * s.employee_packs
      else 1500 + 500 * s.employee_packs
    end
  ),
  case s.plan when 'start' then 750 else 5000 end
)
where s.stripe_subscription_id is not null and s.plan in ('start', 'profesional');

alter table public.subscriptions
  drop column employee_packs,
  drop column extra_members,
  add constraint subscriptions_employee_step_of_plan check (
    employee_step is null
    or (plan = 'start' and employee_step in (250, 500, 750))
    or (plan = 'profesional' and employee_step in (500, 1000, 1500, 2000, 3000, 4000, 5000))
  ),
  add constraint subscriptions_chosen_plan_has_step check (
    stripe_subscription_id is null or plan = 'enterprise' or employee_step is not null
  );

grant select (employee_step) on table public.subscriptions to authenticated;
