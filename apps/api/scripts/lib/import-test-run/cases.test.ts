import { describe, expect, it } from 'vitest';

import { gatewayOf, parseRunArgs, supabaseOf } from './args';
import { caseLabel, selectCases, type Selection } from './cases';
import { importRecord, memoryBucket, organizationId, partRecord } from './test/fixtures';

const id = (n: number) => `d1000000-0000-4000-8000-00000000000${n}`;

const all: Selection = {
  imports: [],
  organization: null,
  kind: null,
  parts: [],
  confirmedOnly: true,
  limit: null,
};

function bucketOfCopies() {
  const bucket = memoryBucket();
  bucket.keepImport(importRecord({ import: id(1), kind: 'client' }), {});
  bucket.keepPart(partRecord({ import: id(1), part: 'risk_evaluations' }));
  bucket.keepPart(partRecord({ import: id(1), part: 'instructions_ssm', status: 'failed' }));
  bucket.keepImport(importRecord({ import: id(2), kind: 'employees' }), {});
  bucket.keepImport(importRecord({ import: id(3), kind: 'client', status: 'abandoned' }), {});
  bucket.keepPart(partRecord({ import: id(4), part: 'instructions_su' }));
  return bucket;
}

const labels = async (selection: Partial<Selection>, warnings: string[] = []) =>
  (
    await selectCases(bucketOfCopies().source, { ...all, ...selection }, (line) =>
      warnings.push(line)
    )
  ).map(caseLabel);

describe('selectCases', () => {
  it('picks the confirmed imports and parts, and leaves out a part whose import has no copy', async () => {
    const warnings: string[] = [];

    expect(await labels({}, warnings)).toEqual([
      `client import ${id(1)}`,
      `risk_evaluations of import ${id(1)}`,
      `employees import ${id(2)}`,
    ]);
    expect(warnings).toEqual([
      `instructions_su of import ${id(4)}: its import's copy is gone, so it is left out.`,
    ]);
  });

  it('takes the copies that did not end confirmed too when asked', async () => {
    expect(await labels({ confirmedOnly: false, kind: 'client' })).toEqual([
      `client import ${id(1)}`,
      `client import ${id(3)}`,
    ]);
  });

  it('picks only imports with --kind and only parts with --part', async () => {
    expect(await labels({ kind: 'employees' })).toEqual([`employees import ${id(2)}`]);
    expect(await labels({ parts: ['risk_evaluations'] })).toEqual([
      `risk_evaluations of import ${id(1)}`,
    ]);
    expect(await labels({ kind: 'client', parts: ['risk_evaluations'] })).toEqual([
      `client import ${id(1)}`,
      `risk_evaluations of import ${id(1)}`,
    ]);
  });

  it('leaves out a copy whose record Storage could not give, and says so', async () => {
    const bucket = bucketOfCopies();
    bucket.unavailable.add(`${organizationId}/${id(2)}/record.json`);
    bucket.unavailable.add(`${organizationId}/${id(1)}/parts/risk_evaluations/record.json`);
    const warnings: string[] = [];

    const cases = await selectCases(bucket.source, all, (line) => warnings.push(line));

    expect(cases.map(caseLabel)).toEqual([`client import ${id(1)}`]);
    expect(warnings).toEqual([
      `risk_evaluations of import ${id(1)}: its record could not be read, so it is left out.`,
      `import ${id(2)}: its record could not be read, so it is left out.`,
      `instructions_su of import ${id(4)}: its import's copy is gone, so it is left out.`,
    ]);
  });

  it('stops at the limit and keeps to the imports named', async () => {
    expect(await labels({ limit: 1 })).toEqual([`client import ${id(1)}`]);
    expect(await labels({ imports: [id(2)] })).toEqual([`employees import ${id(2)}`]);
  });
});

describe('parseRunArgs', () => {
  it('reads the selection and keeps the report in the temporary folder by default', () => {
    const options = parseRunArgs(
      ['--env', 'production', '--import', id(1), '--import', id(2), '--part', 'instructions_ssm'],
      new Date('2026-11-05T10:00:00Z')
    );

    expect(options).toMatchObject({
      environment: 'production',
      imports: [id(1), id(2)],
      parts: ['instructions_ssm'],
      confirmedOnly: true,
      yes: false,
      trial: false,
      rescan: false,
    });
    expect(options.out).toMatch(/import-test-run-production-2026-11-05T10-00-00-000Z\.json$/);
    expect(parseRunArgs(['--env', 'non-prod', '--no-confirmed-only']).confirmedOnly).toBe(false);
  });

  it('refuses a run that names no environment, or a selection it cannot read', () => {
    expect(() => parseRunArgs([])).toThrow(/--env/);
    expect(() => parseRunArgs(['--env', 'staging'])).toThrow(/--env/);
    expect(() => parseRunArgs(['--env', 'non-prod', '--kind', 'people'])).toThrow(/--kind/);
    expect(() => parseRunArgs(['--env', 'non-prod', '--part', 'risks'])).toThrow(/--part/);
    expect(() => parseRunArgs(['--env', 'non-prod', '--limit', '0'])).toThrow(/--limit/);
    expect(() => parseRunArgs(['--env', 'non-prod', '--import', '42'])).toThrow(/Not an id/);
  });

  it('spends only up to a cap, which --yes asks for unless it is a trial', () => {
    expect(() => parseRunArgs(['--env', 'non-prod', '--yes'])).toThrow(/--max-cost/);
    expect(() => parseRunArgs(['--env', 'non-prod', '--yes', '--max-cost', '0'])).toThrow(
      /--max-cost/
    );
    expect(() => parseRunArgs(['--env', 'non-prod', '--yes', '--max-cost', 'five'])).toThrow(
      /--max-cost/
    );
    expect(parseRunArgs(['--env', 'non-prod', '--yes', '--max-cost', '2.5']).maxCost).toBe(2.5);
    expect(parseRunArgs(['--env', 'non-prod', '--yes', '--trial']).maxCost).toBeNull();
  });
});

describe('the environment', () => {
  it('reads each project from variables of its own', () => {
    const env = {
      IMPORT_TEST_SUPABASE_URL_PRODUCTION: 'https://prod.example',
      IMPORT_TEST_SUPABASE_SECRET_KEY_PRODUCTION: 'sb_secret_prod',
      SUPABASE_URL: 'https://other.example',
      SUPABASE_SECRET_KEY: 'sb_secret_other',
    };

    expect(supabaseOf('production', env)).toEqual({
      url: 'https://prod.example',
      secret: 'sb_secret_prod',
    });
    expect(() => supabaseOf('non-prod', env)).toThrow(/IMPORT_TEST_SUPABASE_URL_NON_PROD/);
    expect(() => gatewayOf({})).toThrow(/AI_GATEWAY_URL/);
  });
});
