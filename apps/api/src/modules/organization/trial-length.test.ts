import { readdirSync, readFileSync } from 'node:fs';

import { readOnlyDays, trialDays } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

const migrations = new URL('../../../../../supabase/migrations/', import.meta.url);

const latestDefinition = (name: string) => {
  const file = readdirSync(migrations)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .reverse()
    .find((entry) =>
      new RegExp(`create (or replace )?function public\\.${name}\\(`).test(
        readFileSync(new URL(entry, migrations), 'utf8')
      )
    );
  if (!file) throw new Error(`No migration defines ${name}`);
  const sql = readFileSync(new URL(file, migrations), 'utf8');
  return sql.slice(sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`)));
};

describe('the trial length', () => {
  it('is the one the database gives a new organization', () => {
    const body = latestDefinition('create_organization');
    expect(body.match(/trial_end timestamptz := now\(\) \+ interval '(\d+) days'/)?.[1]).toBe(
      String(trialDays)
    );
  });

  it('is 14 days, and the read-only time after it stays 30', () => {
    expect(trialDays).toBe(14);
    expect(readOnlyDays).toBe(30);
  });
});
