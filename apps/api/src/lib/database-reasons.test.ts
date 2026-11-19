import { readdirSync, readFileSync } from 'node:fs';

import { apiErrorReasons } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

const migrations = new URL('../../../../supabase/migrations/', import.meta.url);

const sql = readdirSync(migrations)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrations), 'utf8'))
  .join('\n');

const latestFunctions = new Map<string, string>();
for (const match of sql.matchAll(
  /create (?:or replace )?function public\.(\w+)\(([\s\S]*?)\n\$\$;/g
)) {
  latestFunctions.set(match[1]!, match[2]!);
}

const raised = (body: string, errcode: RegExp) =>
  [...body.matchAll(/raise exception '([a-z0-9_]+)' using errcode = '(\w+)'/g)]
    .filter(([, , code]) => errcode.test(code!))
    .map(([, reason]) => reason!);

const unknown = (reasons: string[]) =>
  [...new Set(reasons)].filter(
    (reason) => !(apiErrorReasons as readonly string[]).includes(reason)
  );

describe('reasons the database raises as its message', () => {
  it('lists every SIG and TST message among the API error reasons', () => {
    const reasons = raised(sql, /^(SIG|TST)\d+$/);
    expect(reasons.length).toBeGreaterThan(0);
    expect(unknown(reasons)).toEqual([]);
  });

  it('lists every P0002 message of the portal test functions among the API error reasons', () => {
    const handlers = readFileSync(
      new URL('../modules/portal/test-handlers.ts', import.meta.url),
      'utf8'
    );
    const pending = [...handlers.matchAll(/rpc\('(\w+)'/g)].map(([, name]) => name!);
    expect(pending.length).toBeGreaterThan(0);
    const reached = new Set<string>();
    while (pending.length > 0) {
      const name = pending.pop()!;
      const body = latestFunctions.get(name);
      if (reached.has(name) || body === undefined) continue;
      reached.add(name);
      pending.push(...[...body.matchAll(/public\.(\w+)\(/g)].map(([, called]) => called!));
    }
    const reasons = [...reached].flatMap((name) => raised(latestFunctions.get(name)!, /^P0002$/));
    expect(reasons.length).toBeGreaterThan(0);
    expect(unknown(reasons)).toEqual([]);
  });
});
