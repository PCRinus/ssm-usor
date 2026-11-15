import { readdirSync, readFileSync } from 'node:fs';

import { type DocumentSet, documentSetTypeKeys } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { documentApplies } from '../documents/context';

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

const groups: Record<string, DocumentSet> = {
  documentation_set: 'occupational_safety',
  fire_safety_set: 'fire_safety',
};

const rows = [
  ...latestDefinition('built_in_document_types').matchAll(
    /\('(\w+)'(?:::public\.document_group)?, '(\w+)', '(\w+)'\)/g
  ),
].map(([, group, typeKey, appliesWhen]) => ({
  set: groups[group!]!,
  typeKey: typeKey!,
  appliesWhen: appliesWhen!,
}));

const sqlApplies = (
  appliesWhen: string,
  facts: { currentEmployeeCount: number; hasParticipants: boolean }
) =>
  appliesWhen === 'from_ten_employees'
    ? facts.currentEmployeeCount >= 10
    : appliesWhen === 'with_participants'
      ? facts.hasParticipants
      : appliesWhen === 'always';

describe('the built-in documents the clients list counts', () => {
  it.each(Object.entries(documentSetTypeKeys))(
    'are those of the %s set, in its order',
    (set, typeKeys) => {
      expect(rows.filter((row) => row.set === set).map((row) => row.typeKey)).toEqual(typeKeys);
    }
  );

  it('apply when the documents tab says they do', () => {
    for (const currentEmployeeCount of [0, 1, 9, 10, 49, 50, 200]) {
      for (const hasParticipants of [false, true]) {
        const facts = { currentEmployeeCount, hasParticipants };
        for (const row of rows) {
          expect({ ...row, ...facts, applies: sqlApplies(row.appliesWhen, facts) }).toEqual({
            ...row,
            ...facts,
            applies: documentApplies(facts, row.typeKey),
          });
        }
      }
    }
  });
});
