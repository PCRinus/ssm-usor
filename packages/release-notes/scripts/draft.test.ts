import { describe, expect, it, vi } from 'vitest';

import { parseReleaseBody } from '../src/parse';
import {
  draftModel,
  draftPrompt,
  type DraftSource,
  draftUpdate,
  limits,
  type ModelDraft,
  systemPrompt,
  validateDraft,
} from './draft';
import { assembleRelease, collectBlocks, type PullRequest } from './release';

function pullRequest(number: number, title: string, lines: string[] | null): PullRequest {
  return {
    number,
    title,
    url: `https://github.com/PCRinus/ssm-usor/pull/${number}`,
    body: lines === null ? null : lines.join('\n'),
  };
}

const testBuilder = pullRequest(543, 'feat(app): knowledge tests from the question bank', [
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
]);

const testBySms = pullRequest(549, 'feat(portal): send a test by SMS', [
  '## Actualizări',
  '',
  '## Ce e nou',
  '### Teste trimise prin SMS',
  'Angajatul primește testul pe telefon și îl completează fără cont.',
]);

const employeeFilter = pullRequest(548, 'feat(app): La zi filter on the employee list', [
  '## Actualizări',
  '',
  '## Îmbunătățiri',
  '- Lista de angajați are un filtru „La zi”.',
]);

const employeeColumn = pullRequest(550, 'feat(app): La zi column on the employee list', [
  '## Actualizări',
  '',
  '## Îmbunătățiri',
  '- Lista de angajați arată cine e la zi cu instruirile.',
]);

const noBlockFix = pullRequest(570, 'fix(app): keep the sort when going back to the clients list', [
  'Going back from a client lost the sort of the list.',
]);

const dependencyBump = pullRequest(560, 'chore(deps): bump vitest from 4.1.0 to 5.0.0', null);

const pullRequests = [
  testBuilder,
  employeeFilter,
  dependencyBump,
  testBySms,
  employeeColumn,
  noBlockFix,
];

function sourceOf(requests: PullRequest[]): DraftSource {
  const collected = collectBlocks(requests);
  if (collected.kind !== 'collected') throw new Error(collected.kind);
  return { pullRequests: requests, contributions: collected.contributions };
}

const source = sourceOf(pullRequests);

function goodDraft(): ModelDraft {
  return {
    headline: 'Teste de verificare, direct pe telefonul angajaților',
    lead: 'Compui un test din banca de întrebări și îl trimiți angajaților prin SMS.',
    features: [
      { sources: ['F1'], title: 'Alt titlu', text: 'Alt text.' },
      { sources: ['F2'], title: 'Teste trimise prin SMS', text: 'Angajatul primește testul.' },
    ],
    improvements: [
      {
        sources: ['I2', 'I1'],
        text: 'Lista de angajați arată cine e la zi cu instruirile și are un filtru „La zi”.',
      },
    ],
    fixes: [{ sources: ['R1'], text: 'Data de pe PDF nu mai iese cu o zi în urmă.' }],
    proposed: [
      {
        pull_request: 570,
        section: 'fixes',
        title: null,
        text: 'Lista de clienți își păstrează ordinea când te întorci la ea.',
      },
    ],
  };
}

describe('validateDraft', () => {
  it('accepts a good draft, keeps unmerged items verbatim and marks the proposed line', () => {
    const result = validateDraft(goodDraft(), source);

    expect(result).toEqual({
      ok: true,
      update: {
        headline: 'Teste de verificare, direct pe telefonul angajaților',
        lead: 'Compui un test din banca de întrebări și îl trimiți angajaților prin SMS.',
        features: [
          {
            title: 'Teste compuse din banca de întrebări',
            text: 'Alegi tematica, câte întrebări intră și pragul de promovare.',
            where: 'Client, fila Instruiri, butonul Test nou',
            icon: 'clipboard-check',
          },
          {
            title: 'Teste trimise prin SMS',
            text: 'Angajatul primește testul pe telefon și îl completează fără cont.',
            where: null,
            icon: null,
          },
        ],
        improvements: [
          'Lista de angajați arată cine e la zi cu instruirile și are un filtru „La zi”.',
        ],
        fixes: [
          'Data de pe PDF nu mai iese cu o zi în urmă după miezul nopții.',
          'Lista de clienți își păstrează ordinea când te întorci la ea. (propus)',
        ],
      },
      proposed: [
        {
          pullRequest: 570,
          section: 'fixes',
          text: 'Lista de clienți își păstrează ordinea când te întorci la ea. (propus)',
        },
      ],
    });
  });

  it('carries the icon and the place of a merged feature from its sources', () => {
    const draft = goodDraft();
    draft.features = [
      {
        sources: ['F2', 'F1'],
        title: 'Teste din banca de întrebări, trimise prin SMS',
        text: 'Compui testul și angajatul îl completează pe telefon.',
      },
    ];
    const result = validateDraft(draft, source);
    if (!result.ok) throw new Error(result.reason);

    expect(result.update?.features).toEqual([
      {
        title: 'Teste din banca de întrebări, trimise prin SMS',
        text: 'Compui testul și angajatul îl completează pe telefon.',
        where: 'Client, fila Instruiri, butonul Test nou',
        icon: 'clipboard-check',
      },
    ]);
  });

  it('rejects an item that no pull request wrote', () => {
    const draft = goodDraft();
    draft.improvements.push({ sources: ['I3'], text: 'Un rând inventat.' });

    expect(validateDraft(draft, source)).toEqual({
      ok: false,
      reason: 'it cites I3, which no pull request wrote',
    });
  });

  it('rejects an item list grown by citing a source twice', () => {
    const draft = goodDraft();
    draft.improvements = [
      { sources: ['I1'], text: 'x' },
      { sources: ['I2'], text: 'y' },
      { sources: ['I1'], text: 'z' },
    ];

    expect(validateDraft(draft, source)).toEqual({ ok: false, reason: 'it cites I1 twice' });
  });

  it('rejects a draft that drops an item without merging it', () => {
    const draft = goodDraft();
    draft.fixes = [];

    expect(validateDraft(draft, source)).toEqual({ ok: false, reason: 'it drops R1' });
  });

  it('rejects a proposed line for a pull request that carries a block', () => {
    const draft = goodDraft();
    draft.proposed[0]!.pull_request = 548;

    expect(validateDraft(draft, source)).toMatchObject({ ok: false });
  });

  it('rejects a merged feature with no text, and an answer missing a field', () => {
    const draft = goodDraft();
    draft.features = [{ sources: ['F1', 'F2'], title: 'Teste', text: '  ' }];

    expect(validateDraft(draft, source)).toEqual({
      ok: false,
      reason: 'a merged feature text is empty',
    });

    const withoutText = { sources: ['F1'], title: 'Teste' };
    expect(validateDraft({ ...goodDraft(), features: [withoutText] }, source)).toEqual({
      ok: false,
      reason:
        'it does not match the schema at features.0.text: Invalid input: expected string, received undefined',
    });
  });

  it('rejects a headline over the limit or naming the version', () => {
    const long = { ...goodDraft(), headline: 'Teste '.repeat(20) };
    expect(validateDraft(long, source)).toEqual({
      ok: false,
      reason: 'the headline is 119 characters, over 80',
    });

    const version = { ...goodDraft(), headline: 'Versiunea 2026.10.24' };
    expect(validateDraft(version, source)).toEqual({
      ok: false,
      reason: 'the headline names the version instead of a change',
    });
  });

  it('rejects wording that does not parse back to the same update', () => {
    const draft = goodDraft();
    draft.features = [
      {
        sources: ['F1', 'F2'],
        title: 'Teste',
        text: 'Unde o găsești: Client, fila Instruiri',
      },
    ];

    expect(validateDraft(draft, source)).toEqual({
      ok: false,
      reason: 'its text does not survive rendering and parsing back unchanged',
    });
  });

  it('is silent when nobody wrote a block and the model proposes nothing', () => {
    const silent = sourceOf([dependencyBump]);
    const draft: ModelDraft = {
      headline: '',
      lead: null,
      features: [],
      improvements: [],
      fixes: [],
      proposed: [],
    };

    expect(validateDraft(draft, silent)).toEqual({ ok: true, update: null, proposed: [] });
  });
});

const gateway = { url: 'https://gateway.example/v1/account/ssm-usor', token: 'test-token' };

describe('draftUpdate', () => {
  it('falls back without a key and never calls the model', async () => {
    const call = vi.fn();

    await expect(draftUpdate(source, { gateway: undefined, call })).resolves.toEqual({
      kind: 'fallback',
      reason: 'AI_GATEWAY_URL and AI_GATEWAY_TOKEN are not set',
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('sends the pull requests and the numbered items, and returns the accepted draft', async () => {
    const call = vi.fn().mockResolvedValue(goodDraft());

    const outcome = await draftUpdate(source, { gateway, call });

    expect(outcome).toMatchObject({ kind: 'drafted', model: draftModel });
    const prompt = call.mock.calls[0]![0];
    expect(prompt).toEqual(draftPrompt(source));
    expect(prompt.user).toContain('<pull_request number="570" has_items="false">');
    expect(prompt.user).toContain('"id": "F2"');
  });

  it('falls back when the call fails or the answer is rejected', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('overloaded'));
    await expect(draftUpdate(source, { gateway, call: failing })).resolves.toEqual({
      kind: 'fallback',
      reason: 'the call failed: overloaded',
    });

    const grown = { ...goodDraft(), fixes: [...goodDraft().fixes, { sources: ['R2'], text: 'x' }] };
    const rejecting = vi.fn().mockResolvedValue(grown);
    await expect(draftUpdate(source, { gateway, call: rejecting })).resolves.toEqual({
      kind: 'fallback',
      reason: 'the draft was rejected: it cites R2, which no pull request wrote',
    });
  });
});

describe('assembleRelease with a draft', () => {
  it('writes the drafted update and lists the proposed lines in the summary', async () => {
    const collected = collectBlocks(pullRequests);
    if (collected.kind !== 'collected') throw new Error(collected.kind);
    const draft = await draftUpdate(source, {
      gateway,
      call: vi.fn().mockResolvedValue(goodDraft()),
    });

    const result = assembleRelease(pullRequests, collected, '', draft);

    const parsed = parseReleaseBody(result.body);
    if (parsed.kind !== 'update') throw new Error(parsed.kind);
    expect(parsed.update.headline).toBe('Teste de verificare, direct pe telefonul angajaților');
    expect(result.summary).toContain(`Headline and lead drafted by ${draftModel}.`);
    expect(result.summary).toContain('2 new features, 1 improvement, 2 fixes');
    expect(result.summary).toContain(
      '- #570, Remedieri: Lista de clienți își păstrează ordinea când te întorci la ea. (propus)'
    );
  });
});

describe('systemPrompt', () => {
  it('is the prompt file without its preamble, with the limits filled in', () => {
    expect(systemPrompt.startsWith('## Who reads it')).toBe(true);
    expect(systemPrompt).toContain(`at most ${limits.headline} characters`);
    expect(systemPrompt).toContain(`at most ${limits.lead} characters`);
    expect(systemPrompt).not.toContain('{{');
    expect(systemPrompt).toContain('## Contract');
  });
});
