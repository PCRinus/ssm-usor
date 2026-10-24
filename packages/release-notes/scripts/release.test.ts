import { describe, expect, it } from 'vitest';

import { parseReleaseBody } from '../src/parse';
import type { DraftOutcome } from './draft';
import {
  assembleRelease,
  collectBlocks,
  describeFailures,
  type PullRequest,
  releaseRow,
} from './release';

function pullRequest(number: number, title: string, body: string | null): PullRequest {
  return { number, title, url: `https://github.com/PCRinus/ssm-usor/pull/${number}`, body };
}

const knowledgeTests = pullRequest(
  543,
  'feat(app): knowledge tests from the question bank',
  [
    '## What',
    '',
    'Adds the test builder on the client page and the portal screen that runs a test.',
    '',
    '## Actualizări',
    '',
    '## Ce e nou',
    '### Teste compuse din banca de întrebări',
    'Alegi tematica, câte întrebări intră și pragul de promovare.',
    'Unde o găsești: Client, fila Instruiri, butonul Test nou',
    'Pictogramă: clipboard-check',
    '',
    '## Remedieri',
    '- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
    '',
    '## Evidence',
    '',
    '![Test builder](https://raw.githubusercontent.com/PCRinus/ssm-usor/pr-screenshots/feat/knowledge-tests/builder.png)',
  ].join('\n')
);

const employeeFilter = pullRequest(
  548,
  'feat(app): La zi filter on the employee list',
  [
    '## What',
    '',
    'A column and a filter for employees whose trainings are current.',
    '',
    '## Actualizări',
    '',
    '## Îmbunătățiri',
    '- Lista de angajați arată cine e la zi și are un filtru „La zi”.',
    '',
    '## Evidence',
    '',
    'Before and after at phone and desktop width.',
  ].join('\n')
);

const dependencyBump = pullRequest(
  560,
  'chore(deps): bump vitest from 4.1.0 to 5.0.0',
  'Bumps [vitest](https://github.com/vitest-dev/vitest) from 4.1.0 to 5.0.0.'
);

const refactor = pullRequest(561, 'refactor(api): share the gap plumbing', null);

const brokenBlock = pullRequest(
  562,
  'feat(app): employee notes',
  [
    '## What',
    '',
    'Notes on the employee page.',
    '',
    '## Actualizări',
    '',
    '## Ce e nou',
    '### Note pe fișa angajatului',
    'Scrii o notă pe care o vezi doar tu.',
    'Pictogramă: not-an-icon',
    '',
    '## Evidence',
  ].join('\n')
);

const trailer = [
  "## What's Changed",
  '* feat(app): knowledge tests from the question bank by @PCRinus in https://github.com/PCRinus/ssm-usor/pull/543',
  '',
  '**Full Changelog**: https://github.com/PCRinus/ssm-usor/compare/2026.10.20...2026.10.24',
].join('\n');

const noModel: DraftOutcome = { kind: 'fallback', reason: 'ANTHROPIC_API_KEY is not set' };

function assemble(pullRequests: PullRequest[], notes: string, draft = noModel) {
  const collected = collectBlocks(pullRequests);
  if (collected.kind !== 'collected') throw new Error(collected.kind);
  return assembleRelease(pullRequests, collected, notes, draft);
}

describe('assembleRelease', () => {
  it('collects the blocks in merge order and keeps the generated notes after the rule', () => {
    const result = assemble([knowledgeTests, dependencyBump, employeeFilter, refactor], trailer);

    expect(result.body).toBe(
      [
        '# Teste compuse din banca de întrebări',
        '',
        '## Ce e nou',
        '### Teste compuse din banca de întrebări',
        'Alegi tematica, câte întrebări intră și pragul de promovare.',
        'Unde o găsești: Client, fila Instruiri, butonul Test nou',
        'Pictogramă: clipboard-check',
        '',
        '## Îmbunătățiri',
        '- Lista de angajați arată cine e la zi și are un filtru „La zi”.',
        '',
        '## Remedieri',
        '- Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
        '',
        '---',
        '',
        trailer,
      ].join('\n')
    );
    expect(parseReleaseBody(result.body).kind).toBe('update');
  });

  it('names the pull requests that contributed and those skipped, with the counts', () => {
    const result = assemble([knowledgeTests, dependencyBump, employeeFilter], trailer);

    expect(result.summary).toContain('Headline: Teste compuse din banca de întrebări');
    expect(result.summary).toContain(
      'Headline from the first item (no model: ANTHROPIC_API_KEY is not set).'
    );
    expect(result.summary).toContain('1 new feature, 1 improvement, 1 fix');
    expect(result.summary).toMatch(/Contributed:\n- \[#543\].*\n- \[#548\]/);
    expect(result.summary).toMatch(/No block, skipped:\n- \[#560\]/);
  });

  it('is silent when no pull request carries a block, and the body is only the notes', () => {
    const result = assemble([dependencyBump, refactor], trailer);

    expect(result.body).toBe(`---\n\n${trailer}`);
    expect(parseReleaseBody(result.body).kind).toBe('silent');
    expect(result.summary).toContain(
      'Silent: none of the 2 pull requests carries a `## Actualizări` block.'
    );
  });

  it('is silent when nothing was merged', () => {
    const result = assemble([], '');

    expect(result.body).toBe('');
    expect(result.summary).toContain('Silent: no pull requests were merged');
  });

  it('fails on a broken block and names the pull request and the line', () => {
    const result = collectBlocks([knowledgeTests, brokenBlock]);
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') return;

    expect(result.failures.map((failure) => failure.pullRequest.number)).toEqual([562]);
    expect(describeFailures(result.failures)).toEqual([
      '#562 feat(app): employee notes, line 10 of its description: "not-an-icon" is not a lucide icon name.',
    ]);
  });
});

describe('releaseRow', () => {
  const publishedAt = '2026-10-24T09:12:03Z';

  it('turns an edited release body into the row, with the source up to the rule', () => {
    const body = [
      '# Teste de verificare, direct din portal',
      'Dai un test angajaților unui client, ei răspund de pe telefon.',
      '',
      '## Ce e nou',
      '### Teste compuse din banca de întrebări',
      'Alegi tematica, câte întrebări intră și pragul de promovare.',
      'Pictogramă: clipboard-check',
      '',
      '## Remedieri',
      '- Data de pe PDF nu mai iese cu o zi în urmă.',
      '',
      '---',
      '',
      trailer,
    ].join('\r\n');

    expect(releaseRow('2026.10.24', publishedAt, body)).toEqual({
      kind: 'row',
      row: {
        tag: '2026.10.24',
        published_at: publishedAt,
        headline: 'Teste de verificare, direct din portal',
        lead: 'Dai un test angajaților unui client, ei răspund de pe telefon.',
        features: [
          {
            title: 'Teste compuse din banca de întrebări',
            text: 'Alegi tematica, câte întrebări intră și pragul de promovare.',
            where: null,
            icon: 'clipboard-check',
          },
        ],
        improvements: [],
        fixes: ['Data de pe PDF nu mai iese cu o zi în urmă.'],
        body: [
          '# Teste de verificare, direct din portal',
          'Dai un test angajaților unui client, ei răspund de pe telefon.',
          '',
          '## Ce e nou',
          '### Teste compuse din banca de întrebări',
          'Alegi tematica, câte întrebări intră și pragul de promovare.',
          'Pictogramă: clipboard-check',
          '',
          '## Remedieri',
          '- Data de pe PDF nu mai iese cu o zi în urmă.',
        ].join('\n'),
      },
    });
  });

  it('writes no row for a silent release', () => {
    expect(releaseRow('2026.10.24', publishedAt, `---\n\n${trailer}`)).toEqual({ kind: 'silent' });
  });

  it('reports a broken body by line', () => {
    const body = ['# Titlu', '', '## Noutăți', '- ceva', '', '---', trailer].join('\n');

    expect(releaseRow('2026.10.24', publishedAt, body)).toEqual({
      kind: 'invalid',
      errors: [
        {
          line: 1,
          message:
            'The release has a headline but no items under ## Ce e nou, ## Îmbunătățiri and ## Remedieri.',
        },
        {
          line: 3,
          message:
            'Unknown section "## Noutăți"; the sections are ## Ce e nou, ## Îmbunătățiri and ## Remedieri.',
        },
      ],
    });
  });
});
