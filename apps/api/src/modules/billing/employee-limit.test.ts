import { readdirSync, readFileSync } from 'node:fs';

import { billingPlans, selfServeLimits } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { usageLimits } from './rules';

const migrations = new URL('../../../../../supabase/migrations/', import.meta.url);

const latestDefinition = (name: string) => {
  const pattern = new RegExp(`create (or replace )?function public\\.${name}\\(`);
  const file = readdirSync(migrations)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .reverse()
    .find((entry) => pattern.test(readFileSync(new URL(entry, migrations), 'utf8')));
  if (!file) throw new Error(`No migration defines ${name}`);
  const sql = readFileSync(new URL(file, migrations), 'utf8');
  const start = sql.search(pattern);
  return sql.slice(start, sql.indexOf('$$;', start));
};

describe('the employee limit the database counts against', () => {
  const body = latestDefinition('employee_limit_of');
  const now = new Date('2026-11-14T10:00:00Z');
  const row = {
    trial_ends_at: null,
    employee_step: null,
  };

  it("is a trial's own limit until the trial ends", () => {
    expect(body).toContain(
      `when p_status = 'trialing' and p_trial_ends_at > now() then ${selfServeLimits.employees}`
    );
    expect(
      usageLimits(
        { ...row, plan: 'start', status: 'trialing', trial_ends_at: '2026-11-20T00:00:00Z' },
        now
      ).employees
    ).toBe(selfServeLimits.employees);
  });

  it("is a plan's first step where the row has no step", () => {
    expect(body).toContain(
      `case p_plan when 'start' then ${billingPlans.start.steps[0]!.employees} else ${billingPlans.profesional.steps[0]!.employees} end`
    );
    expect(usageLimits({ ...row, plan: 'start', status: 'active' }, now).employees).toBe(
      billingPlans.start.steps[0]!.employees
    );
    expect(usageLimits({ ...row, plan: 'profesional', status: 'active' }, now).employees).toBe(
      billingPlans.profesional.steps[0]!.employees
    );
  });

  it('is none on Enterprise', () => {
    expect(body).toContain("when p_plan = 'enterprise' then null");
    expect(usageLimits({ ...row, plan: 'enterprise', status: 'active' }, now).employees).toBeNull();
  });
});
