import { costOf } from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import type { TestCase } from './cases';
import { estimateCases, estimateLines, stepsOf, totalCost } from './estimate';
import { currentVersions } from './run';
import { importRecord, partRecord } from './test/fixtures';

const folder = 'org/import';

const clientCase = (
  bySteps: Record<string, Record<string, number>> | null,
  readCharacters = 32_500
): TestCase => ({
  type: 'import',
  folder,
  record: importRecord({
    import: 'import-1',
    kind: 'client',
    files: [
      {
        place: 1,
        id: 'scan',
        uploadPath: 'Dosar/Scan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
        pageCount: 3,
        isScan: true,
        state: 'read',
        kind: 'decision',
        domain: null,
        reason: null,
        company: null,
        objects: [
          'files/scan.pdf',
          'files/scan.json',
          'files/scan.page-1.json',
          'files/scan.page-3.json',
        ],
      },
    ],
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      readCharacters,
      bySteps,
    },
  }),
});

const employeeCase: TestCase = {
  type: 'import',
  folder,
  record: importRecord({
    import: 'import-2',
    kind: 'employees',
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      readCharacters: null,
      bySteps: { scanning: { input_tokens: 20_000, cached_input_tokens: 0, output_tokens: 6_000 } },
    },
  }),
};

const risksCase: TestCase = {
  type: 'part',
  folder,
  part: 'risk_evaluations',
  record: partRecord({
    import: 'import-1',
    part: 'risk_evaluations',
    usage: { inputTokens: 90_000, cachedInputTokens: 10_000, outputTokens: 30_000, costUsd: 0.3 },
  }),
  importRecord: importRecord({ import: 'import-1', kind: 'client' }),
};

describe('stepsOf', () => {
  it('sends a scan to a model again only with --rescan', () => {
    expect(stepsOf(clientCase(null), false)).toEqual(['sorting', 'reading']);
    expect(stepsOf(clientCase(null), true)).toEqual(['sorting', 'scanning', 'reading']);
    expect(stepsOf(employeeCase, false)).toEqual([]);
    expect(stepsOf(employeeCase, true)).toEqual(['scanning']);
    expect(stepsOf(risksCase, false)).toEqual(['risks']);
  });
});

describe('estimateCases', () => {
  it('prices each step’s stored usage at today’s rates, a cached token as a fresh one', async () => {
    const versions = await currentVersions();
    const estimate = estimateCases(
      [
        clientCase({
          sorting: { input_tokens: 8_000, cached_input_tokens: 0, output_tokens: 1_000 },
          reading: { input_tokens: 9_000, cached_input_tokens: 1_000, output_tokens: 4_000 },
          scanning: { input_tokens: 50_000, cached_input_tokens: 0, output_tokens: 9_000 },
        }),
        employeeCase,
        risksCase,
      ],
      versions,
      false
    );

    expect(estimate).toMatchObject({ copies: 3, characters: 32_500, scannedPages: 2, fromText: 0 });
    expect(estimate.byModel['gpt-6-luna']!.usage).toEqual({
      input: 8_000,
      cachedInput: 0,
      output: 1_000,
    });
    expect(estimate.byModel['gpt-6.1-terra']!.cost).toBeCloseTo(
      costOf('gpt-6.1-terra', { input: 10_000, cachedInput: 0, output: 4_000 }) +
        costOf('gpt-6.1-terra', { input: 100_000, cachedInput: 0, output: 30_000 })
    );
  });

  it('guesses the input of a step that stored no usage from the copy’s text', async () => {
    const estimate = estimateCases([clientCase(null)], await currentVersions(), false);

    expect(estimate.fromText).toBe(1);
    expect(estimate.byModel['gpt-6.1-terra']!.usage.input).toBe(10_000);
    expect(estimate.byModel['gpt-6-luna']!.usage.input).toBe(10_000);
  });

  it('costs nothing for an employee copy read from its kept page readings', async () => {
    const estimate = estimateCases([employeeCase], await currentVersions(), false);

    expect(totalCost(estimate)).toBe(0);
    expect(totalCost(estimateCases([employeeCase], await currentVersions(), true))).toBeGreaterThan(
      0
    );
  });

  it('states the copies, the text, the pages and the cost by model', async () => {
    const estimate = estimateCases(
      [
        clientCase({
          sorting: { input_tokens: 8_000, cached_input_tokens: 0, output_tokens: 1_000 },
          reading: { input_tokens: 9_000, cached_input_tokens: 1_000, output_tokens: 4_000 },
        }),
        risksCase,
      ],
      await currentVersions(),
      false
    );

    expect(estimateLines(estimate, false)).toEqual([
      '2 copies, 32,500 characters of extracted text, 2 scanned pages (their kept readings reused).',
      '  gpt-6-luna        $0.0013  (8,000 input, 1,000 output tokens)',
      '  gpt-6.1-terra     $0.2800  (110,000 input, 34,000 output tokens)',
      '  total             $0.2813',
    ]);
  });
});
