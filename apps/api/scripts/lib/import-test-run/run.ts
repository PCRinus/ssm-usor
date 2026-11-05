import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import {
  type ExtractorService,
  type ImportLibraryPart,
  importLibraryParts,
  isInstructionsPart,
} from '@ssm-usor/contracts';
import type { ModelClient, ModelId, Usage } from '@ssm-usor/import';

import { describe } from '../../../src/modules/imports/pipeline';
import {
  type Reader,
  type ReadingVersion,
  readingVersion,
} from '../../../src/modules/imports/reading-version';
import {
  caseLabel,
  type CopySource,
  readerOf,
  selectCases,
  type Selection,
  type TestCase,
} from './cases';
import {
  addCounts,
  compareSections,
  type Comparison,
  type Counts,
  noCounts,
  scoreOf,
  type Sections,
} from './compare';
import { dollars, estimateCases, estimateLines, stepsOf, totalCost } from './estimate';
import { type CaseContext, readAgain, type Spent, testRunModel } from './reading';
import {
  confirmedClient,
  confirmedEmployees,
  instructionSections,
  NoResultError,
  readClient,
  readEmployees,
  riskSections,
} from './results';

export interface RunOptions extends Selection {
  environment: 'non-prod' | 'production';
  rescan: boolean;
  yes: boolean;
  trial: boolean;
  out: string;
  showValues: boolean;
  // In dollars; null only for a trial or a run told nothing to spend.
  maxCost: number | null;
}

export interface RunDeps {
  source: CopySource;
  context: CaseContext;
  // Made only once the run may spend, so an estimate needs no gateway token.
  model: () => ModelClient;
  extractor: ExtractorService | null;
  print: (line: string) => void;
  repositoryRoot: string;
  today: string;
  now?: () => Date;
  wait?: (milliseconds: number) => Promise<void>;
  revision?: (repositoryRoot: string) => Promise<CodeRevision | null>;
}

// The reading version names the models and the prompts; the reasoning effort, the token limits
// and the code after the model are told only by the commit.
export interface CodeRevision {
  commit: string;
  dirty: boolean;
}

interface CaseReport {
  copy: string;
  import: string;
  organization: string;
  part: ImportLibraryPart | null;
  readingVersion: { stored: unknown; current: ReadingVersion };
  status: 'compared' | 'failed' | 'skipped';
  reason: string | null;
  spent: { byModel: Partial<Record<ModelId, Spent>>; cost: number };
  imagesNotReadAgain: number;
  comparison:
    | (Omit<Comparison, 'differences'> & {
        // Where the reading and the answer differ, without the values, which are client data.
        differences: Omit<Comparison['differences'][number], 'expected' | 'got'>[];
      })
    | null;
}

export interface RunReport {
  ranAt: string;
  environment: string;
  rescan: boolean;
  trial: boolean;
  maxCost: number | null;
  // Null where git could not tell.
  code: CodeRevision | null;
  readingVersions: Record<Reader, ReadingVersion>;
  cases: CaseReport[];
  summary: {
    compared: number;
    failed: number;
    skipped: number;
    // Left when the spending reached --max-cost.
    notStarted: number;
    totals: Counts;
    score: number | null;
    cost: number;
  };
}

const readers: Reader[] = ['client', 'employees', ...importLibraryParts];

export async function currentVersions() {
  const entries = await Promise.all(
    readers.map(async (reader) => [reader, await readingVersion(reader)] as const)
  );
  return Object.fromEntries(entries) as Record<Reader, ReadingVersion>;
}

// The repository is public, and the report names the copies it read. Both sides are compared
// as real paths, so a symlink or a path in another case on macOS does not slip past.
export async function isRepositoryPath(path: string, root: string) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const folder = await realpath(dirname(target));
  const repository = await realpath(root).catch(() => resolve(root));
  const from = relative(repository, join(folder, basename(target)));
  return from === '' || !(from === '..' || from.startsWith(`..${sep}`) || isAbsolute(from));
}

const exec = promisify(execFile);

export async function codeRevision(repositoryRoot: string): Promise<CodeRevision | null> {
  try {
    const [head, status] = await Promise.all([
      exec('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
      exec('git', ['status', '--porcelain'], { cwd: repositoryRoot }),
    ]);
    return { commit: head.stdout.trim(), dirty: status.stdout.trim() !== '' };
  } catch {
    return null;
  }
}

const codeText = (code: CodeRevision | null) =>
  code ? `${code.commit.slice(0, 12)}${code.dirty ? ' with uncommitted changes' : ''}` : 'unknown';

const versionText = (version: unknown) => {
  if (!version || typeof version !== 'object') return 'none';
  const { models, prompts } = version as Partial<ReadingVersion>;
  const steps = Object.entries(models ?? {})
    .map(([step, model]) => `${step} ${model}`)
    .join(', ');
  return `${prompts ?? '?'} (${steps})`;
};

const percent = (score: number | null) =>
  score === null ? 'no values' : `${(score * 100).toFixed(1)}%`;

const countsText = (counts: Counts) =>
  `found ${counts.found}, missed ${counts.missed}, wrong ${counts.wrong}, extra ${counts.extra}`;

function expectedOf(testCase: TestCase, today: string): Sections {
  if (testCase.type === 'import') {
    const { proposal, changes } = testCase.record;
    return testCase.record.kind === 'client'
      ? confirmedClient(proposal, changes)
      : confirmedEmployees(proposal, changes, today);
  }
  const { proposal, changes } = testCase.record;
  const importProposal = testCase.importRecord.proposal;
  return isInstructionsPart(testCase.part)
    ? instructionSections(proposal, changes, importProposal)
    : riskSections(proposal, changes, importProposal);
}

function readOf(testCase: TestCase, proposal: unknown, today: string): Sections {
  if (testCase.type === 'import') {
    return testCase.record.kind === 'client'
      ? readClient(proposal)
      : readEmployees(proposal, today);
  }
  const importProposal = testCase.importRecord.proposal;
  return isInstructionsPart(testCase.part)
    ? instructionSections(proposal, null, importProposal)
    : riskSections(proposal, null, importProposal);
}

function spentOf(byModel: Map<ModelId, Spent>) {
  const spent = Object.fromEntries(byModel) as Partial<Record<ModelId, Spent>>;
  return { byModel: spent, cost: [...byModel.values()].reduce((sum, each) => sum + each.cost, 0) };
}

const tokens = (usage: Usage) =>
  `${usage.input + usage.cachedInput} input (${usage.cachedInput} cached), ${usage.output} output tokens`;

// Nothing of a copy is written to disk: the report alone, which holds counts and no values.
export async function runTests(options: RunOptions, deps: RunDeps): Promise<RunReport | null> {
  const print = deps.print;
  if (await isRepositoryPath(options.out, deps.repositoryRoot)) {
    throw new Error('Pass --out outside the repository, which is public.');
  }
  const versions = await currentVersions();
  const selected = await selectCases(deps.source, options, print);
  if (selected.length === 0) {
    print('No kept copy matches the selection.');
    return null;
  }
  const cases = options.trial ? selected.slice(0, 1) : selected;
  const estimate = estimateCases(cases, versions, options.rescan);
  print(
    `Environment: ${options.environment}.${options.trial ? ' Trial: the first copy only.' : ''}`
  );
  for (const line of estimateLines(estimate, options.rescan)) print(line);
  const spends = cases.some((testCase) => stepsOf(testCase, options.rescan).length > 0);
  if (spends && !options.yes) {
    print(
      `Nothing was sent to a model. Run again with --yes --max-cost <usd> to spend about ${dollars(totalCost(estimate))}, or with --trial --yes to read the first copy alone.`
    );
    return null;
  }

  const model = spends ? deps.model() : null;
  const code = await (deps.revision ?? codeRevision)(deps.repositoryRoot);
  const reports: CaseReport[] = [];
  const totals = noCounts();
  const spentSoFar = () => reports.reduce((sum, each) => sum + each.spent.cost, 0);
  let notStarted = 0;
  let report: RunReport;
  try {
    for (const [index, testCase] of cases.entries()) {
      if (options.maxCost !== null && spentSoFar() >= options.maxCost) {
        notStarted = cases.length - index;
        print(
          `Spending reached --max-cost ${dollars(options.maxCost)}: ${notStarted} ${notStarted === 1 ? 'copy' : 'copies'} not started.`
        );
        break;
      }
      const each = await runCase(testCase, versions, model, options, deps);
      reports.push(each);
      if (each.comparison) addCounts(totals, each.comparison.totals);
    }
  } finally {
    const cost = spentSoFar();
    report = {
      ranAt: (deps.now?.() ?? new Date()).toISOString(),
      environment: options.environment,
      rescan: options.rescan,
      trial: options.trial,
      maxCost: options.maxCost,
      code,
      readingVersions: versions,
      cases: reports,
      summary: {
        compared: reports.filter((each) => each.status === 'compared').length,
        failed: reports.filter((each) => each.status === 'failed').length,
        skipped: reports.filter((each) => each.status === 'skipped').length,
        notStarted,
        totals,
        score: scoreOf(totals),
        cost,
      },
    };
    print(
      `Summary: ${report.summary.compared} compared, ${report.summary.failed} failed, ${report.summary.skipped} skipped${notStarted ? `, ${notStarted} not started` : ''} · score ${percent(report.summary.score)} (${countsText(totals)}) · spent ${dollars(cost)} · code ${codeText(code)}`
    );
    await writeReport(options.out, report);
    print(`Report: ${resolve(options.out)}`);
  }
  return report;
}

async function runCase(
  testCase: TestCase,
  versions: Record<Reader, ReadingVersion>,
  model: ModelClient | null,
  options: RunOptions,
  deps: RunDeps
): Promise<CaseReport> {
  const print = deps.print;
  const current = versions[readerOf(testCase)];
  const base = {
    copy: caseLabel(testCase),
    import: testCase.record.import,
    organization: testCase.record.organization,
    part: testCase.type === 'part' ? testCase.part : null,
    readingVersion: { stored: testCase.record.readingVersion, current },
  };
  print(
    `${base.copy}: reading ${versionText(base.readingVersion.stored)} → ${versionText(current)}`
  );
  // An error's message may quote the copy, so the report keeps a reason of its own.
  const reasonOf = (error: unknown, otherwise: string) => {
    if (error instanceof NoResultError) return error.message;
    if (options.showValues) print(`    ${describe(error)}`);
    return otherwise;
  };
  let expected: Sections;
  try {
    expected = expectedOf(testCase, deps.today);
  } catch (error) {
    const reason = reasonOf(error, "The copy's answer could not be read.");
    print(`  skipped: ${reason}`);
    return {
      ...base,
      status: 'skipped',
      reason,
      spent: { byModel: {}, cost: 0 },
      imagesNotReadAgain: 0,
      comparison: null,
    };
  }
  const counted = testRunModel(model ?? noModel, options.rescan);
  let reading;
  try {
    reading = await readAgain({
      testCase,
      source: deps.source,
      context: deps.context,
      model: counted.client,
      extractor: deps.extractor,
      rescan: options.rescan,
      wait: deps.wait,
    });
  } catch (error) {
    reading = { proposal: null, failure: describe(error) };
  }
  const spent = spentOf(counted.byModel);
  const imagesNotReadAgain = counted.refused.images;
  const failed = (reason: string): CaseReport => {
    print(`  failed: ${reason} · ${dollars(spent.cost)}`);
    return { ...base, status: 'failed', reason, spent, imagesNotReadAgain, comparison: null };
  };
  if (reading.failure !== null) return failed(reading.failure);
  let comparison: Comparison;
  try {
    comparison = compareSections(expected, readOf(testCase, reading.proposal, deps.today));
  } catch (error) {
    return failed(reasonOf(error, 'The new reading could not be compared.'));
  }
  print(
    `  score ${percent(comparison.score)} (${countsText(comparison.totals)}) · ${dollars(spent.cost)}${imagesNotReadAgain ? ` · ${imagesNotReadAgain} page images not read again` : ''}`
  );
  for (const [section, counts] of Object.entries(comparison.sections)) {
    if (counts.found + counts.missed + counts.wrong + counts.extra === 0) continue;
    print(`    ${section}: ${percent(scoreOf(counts))} (${countsText(counts)})`);
  }
  if (options.showValues) {
    for (const difference of comparison.differences) {
      print(
        `      ${difference.outcome} ${difference.section}[${difference.row}].${difference.field}: ${JSON.stringify(difference.expected)} → ${JSON.stringify(difference.got)}`
      );
    }
  }
  if (options.trial) {
    for (const [id, each] of counted.byModel) {
      print(`  ${id}: ${tokens(each.usage)}, ${each.requests} requests, ${dollars(each.cost)}`);
    }
  }
  return {
    ...base,
    status: 'compared',
    reason: null,
    spent,
    imagesNotReadAgain,
    comparison: {
      ...comparison,
      differences: comparison.differences.map(({ section, row, field, outcome }) => ({
        section,
        row,
        field,
        outcome,
      })),
    },
  };
}

const noModel: ModelClient = {
  complete: () => Promise.reject(new Error('This run sends nothing to a model.')),
};

/** Written beside its path and renamed, so a failed write leaves no part of it behind. */
export async function writeReport(path: string, report: unknown) {
  const target = resolve(path);
  const partial = `${target}.${randomUUID()}.part`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(partial, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await rename(partial, target);
  } finally {
    await rm(partial, { force: true });
  }
}
