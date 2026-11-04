import { costOf, type ModelId, noUsage, type Usage } from '@ssm-usor/import';

import type { Reader, ReadingVersion } from '../../../src/modules/imports/reading-version';
import { readerOf, type TestCase } from './cases';

// Measured on the reference packs (pipeline.ts, maxReadingCharacters).
const charactersPerToken = 3.25;

export interface Estimate {
  copies: number;
  characters: number;
  scannedPages: number;
  // By model, priced at today's rates; a cached token is counted as a fresh one, since a test
  // run is rarely in the provider's cache.
  byModel: Partial<Record<ModelId, { usage: Usage; cost: number }>>;
  // Copies with a step that had no usage stored, estimated from their text alone.
  fromText: number;
}

interface StepUsage {
  input_tokens?: number | string | null;
  cached_input_tokens?: number | string | null;
  output_tokens?: number | string | null;
}

const add = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cachedInput: a.cachedInput + b.cachedInput,
  output: a.output + b.output,
});

const pageReading = /\.page-\d+\.json$/;

function scannedPagesOf(testCase: TestCase) {
  const record = testCase.type === 'import' ? testCase.record : testCase.importRecord;
  const files =
    testCase.type === 'import'
      ? record.files
      : record.files.filter((file) =>
          testCase.part === 'risk_evaluations'
            ? file.kind === 'risk_assessment'
            : file.kind === 'own_instructions' || file.kind === 'training_themes'
        );
  return files.reduce(
    (pages, file) => pages + file.objects.filter((name) => pageReading.test(name)).length,
    0
  );
}

export function stepsOf(testCase: TestCase, rescan: boolean): string[] {
  if (testCase.type === 'part') {
    return testCase.part === 'risk_evaluations' ? ['risks'] : ['instructions'];
  }
  if (testCase.record.kind === 'employees') return rescan ? ['scanning'] : [];
  return rescan ? ['sorting', 'scanning', 'reading'] : ['sorting', 'reading'];
}

export function estimateCases(
  cases: TestCase[],
  versions: Record<Reader, ReadingVersion>,
  rescan: boolean
): Estimate {
  const estimate: Estimate = {
    copies: cases.length,
    characters: 0,
    scannedPages: 0,
    byModel: {},
    fromText: 0,
  };
  for (const testCase of cases) {
    const models = versions[readerOf(testCase)].models;
    const characters =
      testCase.type === 'import' ? Number(testCase.record.usage.readCharacters ?? 0) : 0;
    estimate.characters += characters;
    estimate.scannedPages += scannedPagesOf(testCase);
    let guessed = false;
    for (const step of stepsOf(testCase, rescan)) {
      const model = models[step] as ModelId | undefined;
      if (!model) continue;
      let usage = storedUsage(testCase, step);
      if (!usage && (step === 'sorting' || step === 'reading') && characters > 0) {
        usage = { input: Math.ceil(characters / charactersPerToken), cachedInput: 0, output: 0 };
        guessed = true;
      }
      if (!usage) continue;
      const spent = estimate.byModel[model] ?? { usage: noUsage, cost: 0 };
      estimate.byModel[model] = {
        usage: add(spent.usage, usage),
        cost: spent.cost + costOf(model, usage),
      };
    }
    if (guessed) estimate.fromText++;
  }
  return estimate;
}

function storedUsage(testCase: TestCase, step: string): Usage | null {
  if (testCase.type === 'part') {
    const { inputTokens, cachedInputTokens, outputTokens } = testCase.record.usage;
    if (inputTokens + cachedInputTokens + outputTokens === 0) return null;
    return { input: inputTokens + cachedInputTokens, cachedInput: 0, output: outputTokens };
  }
  const bySteps = (testCase.record.usage.bySteps ?? {}) as Record<string, StepUsage | undefined>;
  const stored = bySteps[step];
  if (!stored) return null;
  const input = Number(stored.input_tokens ?? 0) + Number(stored.cached_input_tokens ?? 0);
  const output = Number(stored.output_tokens ?? 0);
  return input + output === 0 ? null : { input, cachedInput: 0, output };
}

export const totalCost = (estimate: Pick<Estimate, 'byModel'>) =>
  Object.values(estimate.byModel).reduce((sum, spent) => sum + (spent?.cost ?? 0), 0);

const number = new Intl.NumberFormat('en-US');
export const dollars = (cost: number) => `$${cost.toFixed(4)}`;

export function estimateLines(estimate: Estimate, rescan: boolean): string[] {
  const models = Object.entries(estimate.byModel) as [ModelId, { usage: Usage; cost: number }][];
  const width = Math.max(5, ...models.map(([model]) => model.length));
  return [
    `${number.format(estimate.copies)} ${estimate.copies === 1 ? 'copy' : 'copies'}, ${number.format(estimate.characters)} characters of extracted text, ${number.format(estimate.scannedPages)} scanned pages (${rescan ? 'read again' : 'their kept readings reused'}).`,
    ...models.map(
      ([model, { usage, cost }]) =>
        `  ${model.padEnd(width)}  ${dollars(cost).padStart(10)}  (${number.format(usage.input)} input, ${number.format(usage.output)} output tokens)`
    ),
    `  ${'total'.padEnd(width)}  ${dollars(totalCost(estimate)).padStart(10)}`,
    ...(estimate.fromText > 0
      ? [
          `  ${estimate.fromText} of them stored no usage for a step, so its input is guessed from the text and its output left out.`,
        ]
      : []),
  ];
}
