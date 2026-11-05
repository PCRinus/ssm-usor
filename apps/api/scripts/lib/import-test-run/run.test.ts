import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { CompletionRequest, ModelClient } from '@ssm-usor/import';
import {
  GatewayError,
  noUsage,
  readingAnswer,
  sheetPageAnswer,
  sortingAnswer,
} from '@ssm-usor/import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportCopyRecord } from './cases';
import type { CaseContext } from './reading';
import { codeRevision, type RunDeps, type RunOptions, runTests, writeReport } from './run';
import {
  clientProposal,
  clientReading,
  employeeProposal,
  importRecord,
  memoryBucket,
  organizationId,
  photoId,
  sheetPage,
  today,
} from './test/fixtures';

const exec = promisify(execFile);

const odd = vi.hoisted(() => ({ readClientFails: 0 }));

vi.mock('./results', async (importOriginal) => {
  const results = await importOriginal<typeof import('./results')>();
  return {
    ...results,
    readClient(proposal: unknown) {
      if (odd.readClientFails > 0) {
        odd.readClientFails--;
        throw new TypeError("Cannot read properties of undefined (reading 'Vasilescu')");
      }
      return results.readClient(proposal);
    },
  };
});

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const decisionText = [
  'BRUTĂRIA FICTIVĂ S.R.L., CUI 12345674, Timișoara',
  'Administrator: Vasilescu Andrei Mihai',
].join('\n');

const context: CaseContext = {
  client: async () => null,
  trainingThemes: async () => () => null,
};

const importId = (n: number) => `c1000000-0000-4000-8000-00000000000${n}`;
const fileId = (n: number) => `f1000000-0000-4000-8000-00000000000${n}`;

function clientCopy(n: number, extraFiles: ImportCopyRecord['files'] = []) {
  const answer = clientProposal();
  const record = importRecord({
    import: importId(n),
    kind: 'client',
    files: [
      {
        place: 1,
        id: fileId(n),
        uploadPath: 'Dosar/Decizia 1.docx',
        originalFileName: 'Decizia 1.docx',
        storagePath: `${organizationId}/${importId(n)}/${fileId(n)}.docx`,
        textPath: `${organizationId}/${importId(n)}/${fileId(n)}.txt`,
        derivedPath: null,
        declaredPages: null,
        mimeType: docxType,
        sizeBytes: 1200,
        sha256: 'a'.repeat(64),
        pageCount: null,
        isScan: false,
        state: 'read',
        kind: 'decision',
        domain: null,
        reason: null,
        company: { name: 'BRUTĂRIA FICTIVĂ S.R.L.', cui: '12345674' },
        objects: [`files/${fileId(n)}.docx`, `files/${fileId(n)}.txt`],
      },
      ...extraFiles,
    ],
    proposal: { ...answer, registeredCompany: null },
    changes: {
      fields: { 'client.legalRepresentativeName': { value: 'Vasilescu Andrei Mihai' } },
      items: {},
    },
    usage: {
      inputTokens: 7000,
      cachedInputTokens: 1000,
      outputTokens: 3200,
      costUsd: 0.03,
      readCharacters: decisionText.length,
      bySteps: {
        sorting: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 200, cost_usd: 0 },
        reading: { input_tokens: 5000, cached_input_tokens: 1000, output_tokens: 3000 },
      },
    },
  });
  return { record, files: { [`${fileId(n)}.docx`]: 'docx', [`${fileId(n)}.txt`]: decisionText } };
}

function fakeModel() {
  const requests: CompletionRequest<unknown>[] = [];
  const outages = { reading: 0 };
  const model: ModelClient = {
    async complete<T>(request: CompletionRequest<T>) {
      requests.push(request as CompletionRequest<unknown>);
      if (request.answer.name === readingAnswer.name && outages.reading > 0) {
        outages.reading--;
        throw new GatewayError('The gateway answered 503.', 503, noUsage, 0);
      }
      const usage = { input: 1000, cachedInput: 0, output: 500 };
      if (request.answer.name === sortingAnswer.name) {
        const path = request.messages
          .flatMap((message) => (typeof message.content === 'string' ? [message.content] : []))
          .join('\n')
          .match(/Dosar\/[^\n=]*\.docx/)?.[0];
        return {
          value: {
            files: [
              {
                path: path ?? 'Dosar/Decizia 1.docx',
                kind: 'decision',
                companyName: 'BRUTĂRIA FICTIVĂ S.R.L.',
                companyCui: '12345674',
                carriesClientData: true,
                domain: null,
              },
            ],
          } as T,
          usage,
          cost: 0.001,
          attempts: 1,
        };
      }
      if (request.answer.name === readingAnswer.name) {
        return { value: clientReading() as T, usage, cost: 0.01, attempts: 1 };
      }
      if (request.answer.name === sheetPageAnswer.name) {
        return { value: sheetPage({}) as T, usage, cost: 0.002, attempts: 1 };
      }
      throw new Error(`Unexpected request ${request.answer.name}`);
    },
  };
  return { model, requests, outages };
}

let sandbox: string;

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'import-test-run-'));
  odd.readClientFails = 0;
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function setUp(options: Partial<RunOptions> = {}, overrides: Partial<RunDeps> = {}) {
  const bucket = memoryBucket();
  const { model, requests, outages } = fakeModel();
  const makeModel = vi.fn(() => model);
  const wait = vi.fn(async () => {});
  const lines: string[] = [];
  const run = () =>
    runTests(
      {
        environment: 'non-prod',
        imports: [],
        organization: null,
        kind: null,
        parts: [],
        confirmedOnly: true,
        limit: null,
        rescan: false,
        yes: false,
        trial: false,
        out: join(sandbox, 'report.json'),
        showValues: false,
        maxCost: null,
        ...options,
      },
      {
        source: bucket.source,
        context,
        model: makeModel,
        extractor: null,
        print: (line) => lines.push(line),
        repositoryRoot: join(sandbox, 'repository'),
        today,
        wait,
        revision: async () => null,
        ...overrides,
      }
    );
  return { bucket, requests, outages, makeModel, wait, lines, run };
}

describe('runTests', () => {
  it('stops after the estimate without --yes, sending nothing to a model', async () => {
    const { bucket, makeModel, lines, run } = setUp();
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);

    expect(await run()).toBeNull();

    expect(makeModel).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('1 copy, ');
    expect(lines.at(-1)).toMatch(/^Nothing was sent to a model\. Run again with --yes/);
    expect(await readdir(sandbox)).toEqual([]);
  });

  it('reads the copy again with --yes, tagging its requests as a test run', async () => {
    const { bucket, requests, lines, run } = setUp({ yes: true });
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);

    const report = await run();

    expect(requests.map((request) => request.answer.name)).toEqual([
      sortingAnswer.name,
      readingAnswer.name,
    ]);
    expect(requests.every((request) => request.metadata.purpose === 'test-run')).toBe(true);
    expect(report!.cases[0]).toMatchObject({ status: 'compared', import: importId(1) });
    expect(report!.cases[0]!.comparison!.totals.wrong).toBe(1);
    expect(report!.cases[0]!.spent.cost).toBeCloseTo(0.011);
    expect(lines.some((line) => line.includes('0123456789ab') && line.includes('→'))).toBe(true);
  });

  it('gives the reading the provider its copy recorded', async () => {
    const { bucket, requests, run } = setUp({ yes: true });
    const copy = clientCopy(1);
    const provider = { name: 'SERVICIUL DE ATUNCI S.R.L.', cui: '11223344', people: [] };
    bucket.keepImport(
      { ...copy.record, context: { ...copy.record.context, provider } },
      copy.files
    );

    await run();

    const reading = requests.find((request) => request.answer.name === readingAnswer.name)!;
    expect(JSON.stringify(reading.messages)).toContain('SERVICIUL DE ATUNCI S.R.L. (CUI 11223344)');
  });

  it('writes a report of counts that holds none of the values read', async () => {
    const { bucket, run } = setUp({ yes: true });
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);

    await run();

    const text = await readFile(join(sandbox, 'report.json'), 'utf8');
    expect(text).not.toMatch(/Vasilescu|BRUTĂRIA/);
    expect(JSON.parse(text).cases[0].comparison.differences).toEqual([
      { section: 'client', row: 0, field: 'legal_representative_name', outcome: 'wrong' },
    ]);
    expect(await readdir(sandbox)).toEqual(['report.json']);
  });

  it('reads only the first copy with --trial, and prints what it spent', async () => {
    const { bucket, requests, lines, run } = setUp({ yes: true, trial: true });
    for (const n of [1, 2]) {
      const copy = clientCopy(n);
      bucket.keepImport(copy.record, copy.files);
    }

    const report = await run();

    expect(report!.cases.map((each) => each.import)).toEqual([importId(1)]);
    expect(new Set(requests.map((request) => request.metadata.importId))).toEqual(
      new Set([importId(1)])
    );
    expect(lines).toContain(
      '  gpt-6-luna: 1000 input (0 cached), 500 output tokens, 1 requests, $0.0010'
    );
  });

  it('reads an employee copy from its kept page readings without a model or --yes', async () => {
    const { bucket, makeModel, run } = setUp();
    const answer = employeeProposal(sheetPage({}));
    const reading = sheetPage({ fields: { birthPlace: 'Sibu' } });
    const record = importRecord({
      import: importId(3),
      kind: 'employees',
      files: [
        {
          place: 1,
          id: photoId,
          uploadPath: 'Fise/Coman.jpg',
          originalFileName: 'Coman.jpg',
          storagePath: `${organizationId}/${importId(3)}/${photoId}.jpg`,
          textPath: `${organizationId}/${importId(3)}/${photoId}.json`,
          derivedPath: `${organizationId}/${importId(3)}/${photoId}.jpeg`,
          declaredPages: null,
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sha256: 'b'.repeat(64),
          pageCount: 1,
          isScan: true,
          state: 'read',
          kind: null,
          domain: null,
          reason: null,
          company: null,
          objects: ['jpg', 'jpeg', 'json', 'page-1.json', 'scan.json', 'scan-1.json'].map(
            (end) => `files/${photoId}.${end}`
          ),
        },
      ],
      proposal: answer,
      changes: {
        people: { [answer.people[0]!.id]: { state: 'checked' } },
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      },
    });
    bucket.keepImport(record, {
      [`${photoId}.jpg`]: 'jpeg',
      [`${photoId}.jpeg`]: 'jpeg',
      [`${photoId}.json`]: {
        pageCount: 1,
        pages: [{ number: 1, text: '', isScan: true }],
        sheets: { 1: reading },
      },
      [`${photoId}.page-1.json`]: reading,
      [`${photoId}.scan.json`]: { owner: 'first-run' },
      [`${photoId}.scan-1.json`]: { owner: 'first-run' },
    });

    const report = await run();

    expect(makeModel).not.toHaveBeenCalled();
    expect(report!.cases[0]!.comparison!.differences).toEqual([
      { section: 'people', row: 0, field: 'birth_place', outcome: 'wrong' },
    ]);
    expect(bucket.reads).not.toContain(
      `${record.organization}/${record.import}/files/${photoId}.jpg`
    );
  });

  it('reads the page images again with --rescan, which asks for --yes', async () => {
    const answer = employeeProposal(sheetPage({}));
    const record = importRecord({
      import: importId(4),
      kind: 'employees',
      files: [
        {
          place: 1,
          id: photoId,
          uploadPath: 'Fise/Coman.jpg',
          originalFileName: 'Coman.jpg',
          storagePath: `${organizationId}/${importId(4)}/${photoId}.jpg`,
          textPath: `${organizationId}/${importId(4)}/${photoId}.json`,
          derivedPath: `${organizationId}/${importId(4)}/${photoId}.jpeg`,
          declaredPages: null,
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sha256: 'b'.repeat(64),
          pageCount: 1,
          isScan: true,
          state: 'read',
          kind: null,
          domain: null,
          reason: null,
          company: null,
          objects: ['jpg', 'jpeg', 'json', 'page-1.json'].map((end) => `files/${photoId}.${end}`),
        },
      ],
      proposal: answer,
      changes: {
        people: { [answer.people[0]!.id]: { state: 'checked' } },
        jobTitles: {},
        workplaces: {},
        rows: {},
        pages: {},
      },
      usage: {
        inputTokens: 1500,
        cachedInputTokens: 0,
        outputTokens: 800,
        costUsd: 0.005,
        readCharacters: null,
        bySteps: { scanning: { input_tokens: 1500, cached_input_tokens: 0, output_tokens: 800 } },
      },
    });
    const files = {
      [`${photoId}.jpg`]: 'jpeg',
      [`${photoId}.jpeg`]: 'jpeg',
      [`${photoId}.json`]: { pageCount: 1, pages: [{ number: 1, text: '', isScan: true }] },
      [`${photoId}.page-1.json`]: sheetPage({ fields: { birthPlace: 'Sibu' } }),
    };

    const unasked = setUp({ rescan: true });
    unasked.bucket.keepImport(record, files);
    expect(await unasked.run()).toBeNull();
    expect(unasked.makeModel).not.toHaveBeenCalled();

    const asked = setUp({ rescan: true, yes: true });
    asked.bucket.keepImport(record, files);
    const report = await asked.run();

    expect(asked.requests.map((request) => request.answer.name)).toEqual([sheetPageAnswer.name]);
    expect(report!.cases[0]!.comparison!.differences).toEqual([]);
  });

  it('does not send a page image again without --rescan', async () => {
    const { bucket, requests, run } = setUp({ yes: true });
    const photo = fileId(9);
    const copy = clientCopy(5, [
      {
        place: 2,
        id: photo,
        uploadPath: 'Dosar/Afis.jpg',
        originalFileName: 'Afis.jpg',
        storagePath: `${organizationId}/${importId(5)}/${photo}.jpg`,
        textPath: `${organizationId}/${importId(5)}/${photo}.json`,
        derivedPath: `${organizationId}/${importId(5)}/${photo}.jpeg`,
        declaredPages: null,
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        sha256: 'c'.repeat(64),
        pageCount: 1,
        isScan: true,
        state: 'failed',
        kind: 'fire_safety_document',
        domain: null,
        reason: 'Citirea fișierului s-a oprit din cauza unei erori.',
        company: null,
        objects: ['jpg', 'jpeg', 'json'].map((end) => `files/${photo}.${end}`),
      },
    ]);
    bucket.keepImport(copy.record, {
      ...copy.files,
      [`${photo}.jpg`]: 'jpeg',
      [`${photo}.jpeg`]: 'jpeg',
      [`${photo}.json`]: { pageCount: 1, pages: [{ number: 1, text: '', isScan: true }] },
    });

    const report = await run();

    expect(report!.cases[0]).toMatchObject({ status: 'compared', imagesNotReadAgain: 1 });
    expect(requests.map((request) => request.answer.name)).toEqual([
      sortingAnswer.name,
      readingAnswer.name,
    ]);
  });

  it('skips a copy that kept no proposal, spending nothing on it', async () => {
    const { bucket, requests, run } = setUp({ yes: true });
    const copy = clientCopy(6);
    bucket.keepImport({ ...copy.record, proposal: null }, copy.files);

    const report = await run();

    expect(report!.cases[0]).toMatchObject({ status: 'skipped' });
    expect(requests).toEqual([]);
  });

  it('refuses to write the report into the repository', async () => {
    const { run } = setUp({ out: join(sandbox, 'repository', 'apps', 'report.json') });

    await expect(run()).rejects.toThrow(/outside the repository/);
  });

  it('refuses a report path that reaches the repository through a symlink', async () => {
    await mkdir(join(sandbox, 'repository'), { recursive: true });
    await symlink(join(sandbox, 'repository'), join(sandbox, 'elsewhere'));
    const { run } = setUp({ out: join(sandbox, 'elsewhere', 'report.json') });

    await expect(run()).rejects.toThrow(/outside the repository/);
  });

  it('refuses a report path that names the repository in another case', async (context) => {
    await mkdir(join(sandbox, 'repository'), { recursive: true });
    const caseSensitive = await access(join(sandbox, 'REPOSITORY')).then(
      () => false,
      () => true
    );
    if (caseSensitive) context.skip();
    const { run } = setUp({ out: join(sandbox, 'REPOSITORY', 'report.json') });

    await expect(run()).rejects.toThrow(/outside the repository/);
  });

  it('fails a copy whose reading cannot be compared, and goes on to the next', async () => {
    const { bucket, lines, run } = setUp({ yes: true });
    for (const n of [1, 2]) {
      const copy = clientCopy(n);
      bucket.keepImport(copy.record, copy.files);
    }
    odd.readClientFails = 1;

    const report = await run();

    expect(report!.cases.map((each) => [each.import, each.status, each.reason])).toEqual([
      [importId(1), 'failed', 'The new reading could not be compared.'],
      [importId(2), 'compared', null],
    ]);
    expect(report!.cases[0]!.spent.cost).toBeCloseTo(0.011);
    expect(lines.join('\n')).not.toContain('Vasilescu');
  });

  it('writes the report of the copies read when the run stops halfway', async () => {
    const lines: string[] = [];
    const print = (line: string) => {
      if (line.startsWith(`client import ${importId(2)}`)) throw new Error('The terminal closed.');
      lines.push(line);
    };
    const { bucket, run } = setUp({ yes: true }, { print });
    for (const n of [1, 2]) {
      const copy = clientCopy(n);
      bucket.keepImport(copy.record, copy.files);
    }

    await expect(run()).rejects.toThrow('The terminal closed.');

    const report = JSON.parse(await readFile(join(sandbox, 'report.json'), 'utf8'));
    expect(report.cases.map((each: { import: string }) => each.import)).toEqual([importId(1)]);
    expect(report.summary).toMatchObject({ compared: 1, cost: expect.closeTo(0.011) });
  });

  it('skips a copy whose changes no longer read, spending nothing on it', async () => {
    const { bucket, requests, run } = setUp({ yes: true });
    const copy = clientCopy(7);
    bucket.keepImport({ ...copy.record, changes: { fields: [], items: [] } as never }, copy.files);

    const report = await run();

    expect(report!.cases[0]).toMatchObject({
      status: 'skipped',
      reason: "The copy's changes no longer read.",
    });
    expect(requests).toEqual([]);
  });

  it('starts no copy once the spending reaches --max-cost', async () => {
    const { bucket, requests, lines, run } = setUp({ yes: true, maxCost: 0.005 });
    for (const n of [1, 2, 3]) {
      const copy = clientCopy(n);
      bucket.keepImport(copy.record, copy.files);
    }

    const report = await run();

    expect(report!.cases.map((each) => each.import)).toEqual([importId(1)]);
    expect(new Set(requests.map((request) => request.metadata.importId))).toEqual(
      new Set([importId(1)])
    );
    expect(report!).toMatchObject({ maxCost: 0.005, summary: { notStarted: 2 } });
    expect(lines).toContain('Spending reached --max-cost $0.0050: 2 copies not started.');
    expect(lines.find((line) => line.startsWith('Summary:'))).toContain('2 not started');
  });

  it('reads a step again after a passing gateway error, as the queue would', async () => {
    const { bucket, outages, wait, run } = setUp({ yes: true });
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);
    outages.reading = 2;

    const report = await run();

    expect(report!.cases[0]).toMatchObject({ status: 'compared' });
    expect(wait.mock.calls).toEqual([[30_000], [60_000]]);
  });

  it('fails the copy when the gateway error outlasts the retries', async () => {
    const { bucket, outages, run } = setUp({ yes: true });
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);
    outages.reading = 3;

    const report = await run();

    expect(report!.cases[0]).toMatchObject({ status: 'failed' });
    expect(report!.summary.failed).toBe(1);
  });

  it('names the commit the run read with, and whether it had uncommitted changes', async () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    const { bucket, lines, run } = setUp(
      { yes: true },
      { revision: async () => ({ commit, dirty: true }) }
    );
    const copy = clientCopy(1);
    bucket.keepImport(copy.record, copy.files);

    const report = await run();

    expect(report!.code).toEqual({ commit, dirty: true });
    expect(lines.find((line) => line.startsWith('Summary:'))).toMatch(
      /code 0123456789ab with uncommitted changes$/
    );
  });
});

describe('codeRevision', () => {
  it('is null where git cannot tell', async () => {
    expect(await codeRevision(join(sandbox, 'not-a-folder'))).toBeNull();
  });

  it('names the commit checked out, and whether the tree has changes', async () => {
    const git = (...args: string[]) => exec('git', args, { cwd: sandbox });
    await git('init', '--quiet');
    await git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '--quiet',
      '-m',
      'Start'
    );

    const clean = await codeRevision(sandbox);
    await writeFile(join(sandbox, 'notes.txt'), 'changed');

    expect(clean).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), dirty: false });
    expect(await codeRevision(sandbox)).toEqual({ commit: clean!.commit, dirty: true });
  });
});

describe('writeReport', () => {
  it('leaves no part of a report it could not write', async () => {
    const target = join(sandbox, 'taken');
    await mkdir(join(target, 'inside'), { recursive: true });

    await expect(writeReport(target, { cases: [] })).rejects.toThrow();

    expect(await readdir(sandbox)).toEqual(['taken']);
  });

  it('writes the report readable by its owner alone', async () => {
    const target = join(sandbox, 'nested', 'report.json');

    await writeReport(target, { cases: [] });

    expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ cases: [] });
    expect(await readdir(join(sandbox, 'nested'))).toEqual(['report.json']);
  });
});
