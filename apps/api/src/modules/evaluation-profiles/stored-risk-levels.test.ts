import { readdirSync, readFileSync, statSync } from 'node:fs';

import { maxAcceptableRiskLevel, riskLevelGrid } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

const repository = new URL('../../../../../', import.meta.url);
const migrations = new URL('supabase/migrations/', repository);

const sqlFiles = () =>
  readdirSync(migrations)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => readFileSync(new URL(entry, migrations), 'utf8'));

function functionBodies() {
  const bodies = new Map<string, string>();
  const statement =
    /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(|drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)/gi;
  for (const sql of sqlFiles()) {
    for (const match of sql.matchAll(statement)) {
      const [, created, dropped] = match;
      if (dropped) {
        bodies.delete(dropped);
        continue;
      }
      const open = sql.indexOf('$$', match.index);
      const close = sql.indexOf('$$', open + 2);
      bodies.set(created!, sql.slice(open + 2, close));
    }
  }
  return bodies;
}

const writesFactors =
  /\b(?:insert\s+into|update|delete\s+from)\s+public\.evaluation_profile_factors\b/i;

function factorWriters() {
  const bodies = functionBodies();
  const writers = new Set(
    [...bodies].filter(([, body]) => writesFactors.test(body)).map(([n]) => n)
  );
  for (let grown = true; grown;) {
    grown = false;
    for (const [name, body] of bodies) {
      if (writers.has(name)) continue;
      if ([...writers].some((writer) => body.includes(`public.${writer}(`))) {
        writers.add(name);
        grown = true;
      }
    }
  }
  return { writers, bodies };
}

function sourceFiles(directory: URL): URL[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) return sourceFiles(new URL(`${entry}/`, directory));
    return entry.endsWith('.ts') && !entry.endsWith('.test.ts') && entry !== 'database.types.ts'
      ? [path]
      : [];
  });
}

const topLevel = /^(?:export\s+)?(?:async\s+)?(?:function|const|let)\b/;

function enclosingDeclaration(source: string, offset: number) {
  const lines = source.split('\n');
  let position = 0;
  let start = 0;
  let end = source.length;
  for (const line of lines) {
    if (topLevel.test(line)) {
      if (position <= offset) start = position;
      else {
        end = position;
        break;
      }
    }
    position += line.length + 1;
  }
  return source.slice(start, end);
}

type Site = { file: string; call: string; declaration: string };

function factorWriteSites(writers: Set<string>) {
  const directWrite =
    /\.from\(\s*['"]evaluation_profile_factors['"]\s*\)[^;]*?\.(?:insert|update|upsert|delete)\(/g;
  const rpc = /\.rpc\(\s*['"](\w+)['"]/g;
  const sites: Site[] = [];
  for (const directory of ['apps/api/src/', 'apps/api/scripts/', 'apps/app/e2e/']) {
    for (const file of sourceFiles(new URL(directory, repository))) {
      const source = readFileSync(file, 'utf8');
      const name = file.pathname.slice(repository.pathname.length);
      for (const match of source.matchAll(directWrite)) {
        sites.push({
          file: name,
          call: 'evaluation_profile_factors',
          declaration: enclosingDeclaration(source, match.index),
        });
      }
      for (const match of source.matchAll(rpc)) {
        if (!writers.has(match[1]!)) continue;
        sites.push({
          file: name,
          call: match[1]!,
          declaration: enclosingDeclaration(source, match.index),
        });
      }
    }
  }
  return sites;
}

describe('the risk levels stored on a library entry', () => {
  it('are kept in step by every write that changes an entry’s factors', () => {
    const { writers } = factorWriters();
    const sites = factorWriteSites(writers);
    const missed = sites
      .filter(
        ({ declaration }) =>
          !declaration.includes('storeRiskLevels(') && !declaration.includes('riskLevelTotals(')
      )
      .map(({ file, call }) => `${file}: ${call}`);
    expect(missed).toEqual([]);
  });

  it('finds the writes it guards, so an empty search cannot pass', () => {
    const { writers } = factorWriters();
    expect([...writers]).toEqual(
      expect.arrayContaining([
        'save_evaluation_profile_factor',
        'save_risk_evaluation_as_profile',
        'add_imported_profile_factor',
        'apply_risk_import',
      ])
    );
    const calls = factorWriteSites(writers).map(({ file, call }) => `${file}: ${call}`);
    expect(calls).toEqual(
      expect.arrayContaining([
        'apps/api/src/modules/evaluation-profiles/handlers.ts: save_evaluation_profile_factor',
        'apps/api/src/modules/evaluation-profiles/handlers.ts: evaluation_profile_factors',
        'apps/api/src/modules/evaluation-profiles/handlers.ts: save_risk_evaluation_as_profile',
        'apps/api/src/modules/imports/library-handlers.ts: apply_risk_import',
        'apps/api/scripts/lib/seed-evaluation-profiles.ts: evaluation_profile_factors',
        'apps/app/e2e/flows/support.ts: evaluation_profile_factors',
      ])
    );
  });

  it('come from no database function the API does not call', () => {
    const { writers, bodies } = factorWriters();
    const called = new Set(factorWriteSites(writers).map(({ call }) => call));
    const unreached = [...writers].filter(
      (writer) =>
        !called.has(writer) &&
        ![...writers].some(
          (caller) => caller !== writer && bodies.get(caller)!.includes(`public.${writer}(`)
        )
    );
    expect(unreached).toEqual([]);
  });

  it('were backfilled with the method’s own grid and limit', () => {
    const sql = readFileSync(
      new URL('20261119100000_evaluation_profile_risk_levels.sql', migrations),
      'utf8'
    );
    const grid = sql.match(/\(array\[([\s\S]*?)\]::integer\[\]\)/)?.[1];
    const rows = [...(grid ?? '').matchAll(/\[([\d,\s]+)\]/g)].map(([, row]) =>
      row!.split(',').map(Number)
    );
    expect(rows).toEqual(riskLevelGrid);
    expect(sql).toContain(`filter (where level > ${maxAcceptableRiskLevel})`);
  });
});
