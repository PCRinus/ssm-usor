import type { ModelClient } from '@ssm-usor/import';
import { describe, expect, it, vi } from 'vitest';

import { parsePullRequestBlock } from '../../../../../packages/release-notes/src/parse';
import type { OpenChange, RunsSeen } from './changes';
import { deadManDue, type FixDependencies, runLegislationFix } from './fix';
import type { GitHub } from './github';
import { type QuoteTool, templatesAt, type ToolResult } from './workspace';

const oldText =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const newText =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.';

const roads: OpenChange = {
  id: '0fd0fd0f-0000-4000-8000-000000000195',
  act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portalId: 41006 },
  consolidatedOn: '2026-11-06',
  comparedWith: '2026-08-25',
  outcome: 'quote_differs',
  amendingActs: [{ name: 'Legea 207/2026', portalId: null }],
  amendedUnits: ['Art. 36 alin. (2)'],
  review: [],
  passages: [
    {
      manifest: 'ssm',
      template_file: '2.2_general_training_material.docx',
      paragraph: 2048,
      citation_form: 'quote',
      locator: 'Art. 36 alin. (1) – (3)',
      unit_label: 'Art. 36 alin. (2)',
      status: 'changed',
      old_text: oldText,
      new_text: newText,
    },
  ],
};

const applied: ToolResult = {
  status: 'applied',
  written: ['2.2_general_training_material.docx', 'citations.json', 'manifest.json'],
  summary: {
    file: '2.2_general_training_material.docx',
    act: 'O.U.G. 195/2002',
    locator: 'Art. 36 alin. (1) – (3)',
    changes: [{ kind: 'changed', paragraph: 2052, before: oldText, after: newText }],
    notes: [],
  },
  copies: [],
  markdown:
    '**2.2_general_training_material.docx**: O.U.G. 195/2002, Art. 36 alin. (1) – (3)\n\n- alin. (2), ¶2052: … ~~casca~~ **pe cap cască** …',
};

const note =
  'Art. 36 alin. (2) din O.U.G. 195/2002: motocicliștii și pasagerii lor poartă pe cap cască omologată pentru categoria vehiculului, cu elementele de siguranță cuplate.';

const recentRuns: RunsSeen = {
  lastSucceededStart: '2026-11-13T03:17:00Z',
  latest: { status: 'succeeded', startedAt: '2026-11-13T03:17:00Z' },
};
const now = Date.parse('2026-11-13T04:30:00Z');

function modelAnswering(edits: { candidate: number; proposed: string; reason: string }[] = []) {
  const complete = vi.fn().mockResolvedValue({
    value: { note, edits },
    usage: { input: 2_400, cachedInput: 0, output: 900 },
    cost: 0.0069,
    attempts: 1,
  });
  return { model: { complete } as unknown as ModelClient, complete };
}

function setup({
  changes = [roads],
  tool = () => applied,
  runs = recentRuns,
  github = {},
  resolves = false,
  model = modelAnswering().model,
}: {
  changes?: OpenChange[];
  tool?: QuoteTool;
  runs?: RunsSeen;
  github?: Partial<GitHub>;
  resolves?: boolean;
  model?: ModelClient | null;
} = {}) {
  const real = templatesAt(
    new URL('../../../../../packages/document-engine/templates/', import.meta.url)
  );
  const gh: GitHub = {
    pullForBranch: vi.fn().mockResolvedValue(null),
    issueByMarker: vi.fn().mockResolvedValue(null),
    ensureLabel: vi.fn().mockResolvedValue(undefined),
    openPull: vi.fn().mockResolvedValue({
      number: 950,
      url: 'https://github.com/PCRinus/ssm-usor/pull/950',
      state: 'open',
    }),
    openIssue: vi.fn().mockResolvedValue({
      number: 951,
      url: 'https://github.com/PCRinus/ssm-usor/issues/951',
      state: 'open',
    }),
    ...github,
  };
  const git = {
    assertClean: vi.fn(),
    restore: vi.fn(),
    currentBranch: vi.fn().mockReturnValue('main'),
    commit: vi.fn(),
    push: vi.fn(),
    switchTo: vi.fn(),
  };
  const discord = { send: vi.fn().mockResolvedValue(true) };
  const toolMock = vi.fn<QuoteTool>(tool);
  const lines: string[] = [];
  const deps: FixDependencies = {
    changes: () => Promise.resolve(changes),
    runs: () => Promise.resolve(runs),
    templates: { ...real, resolves: () => resolves },
    tool: toolMock,
    git,
    github: gh,
    model,
    discord,
    actTitle: () => 'Ordonanța de urgență a Guvernului nr. 195 din 12 decembrie 2002',
    log: (text) => lines.push(text),
    now: () => now,
  };
  return { deps, gh, git, discord, tool: toolMock, lines };
}

const options = { dryRun: false, environment: 'production', only: () => true };

describe('a change whose quote differs', () => {
  it('applies the law to our text and opens a pull request that merging signs off', async () => {
    const { deps, gh, git, discord, tool } = setup();
    const report = await runLegislationFix(deps, options);

    expect(report.results).toMatchObject([
      { key: 'oug-195-2002-2026-11-06', action: 'pull', url: expect.stringContaining('/pull/950') },
    ]);
    expect(tool).toHaveBeenCalledTimes(2);
    expect(tool.mock.calls[0]![0]).not.toHaveProperty('change');
    expect(tool.mock.calls[1]![0]).toMatchObject({
      citation: {
        file: '2.2_general_training_material.docx',
        paragraph: 2048,
        act: 'oug-195-2002',
      },
      changes: [{ old: oldText, new: newText }],
      change: { note, resolves: { act: 'oug-195-2002', consolidatedOn: '2026-11-06' } },
    });
    expect(git.commit).toHaveBeenCalledWith(
      'legislation/oug-195-2002-2026-11-06',
      ['2.2_general_training_material.docx', 'citations.json', 'manifest.json'],
      'fix(templates): quote O.U.G. 195/2002 in its form of 2026-11-06'
    );
    expect(git.push).toHaveBeenCalledWith('legislation/oug-195-2002-2026-11-06');
    expect(git.switchTo).toHaveBeenCalledWith('main');
    expect(gh.ensureLabel).toHaveBeenCalled();

    const pull = vi.mocked(gh.openPull).mock.calls[0]![0];
    expect(pull).toMatchObject({ branch: 'legislation/oug-195-2002-2026-11-06', base: 'main' });
    expect(pull.body).toContain('<!-- legislation-change: oug-195-2002-2026-11-06 -->');
    expect(pull.body).toContain(`> ${note}`);
    expect(pull.body).toContain('Merging is the sign-off');
    expect(pull.body).toContain(`- ${oldText}\n+ ${newText}`);
    expect(parsePullRequestBlock(pull.body)).toEqual({
      kind: 'block',
      sections: {
        features: [],
        improvements: [
          'În „Material de instruire introductiv-generală”, art. 36 alin. (2) din O.U.G. 195/2002 este citat în forma în vigoare, modificată prin Legea 207/2026.',
        ],
        fixes: [],
      },
    });

    const message = discord.send.mock.calls[0]![0].content as string;
    expect(message).toContain('<https://github.com/PCRinus/ssm-usor/pull/950>');
    expect(message).toContain(`\`\`\`diff\n- ${oldText}\n+ ${newText}\n\`\`\``);
    expect(message).toContain(`**Note:** ${note}`);
    expect(report.cost).toBeCloseTo(0.0069);
  });

  it('lists the sentences of ours the model would change, without changing them', async () => {
    const { model, complete } = modelAnswering([
      { candidate: 1, proposed: 'Text propus.', reason: 'Reia regula căștii.' },
      { candidate: 99, proposed: 'Nimic.', reason: 'Un paragraf care nu a fost trimis.' },
    ]);
    const { deps, gh, discord } = setup({ model });
    await runLegislationFix(deps, options);

    const request = complete.mock.calls[0]![0];
    expect(request.metadata).toEqual({
      reading: 'legislation_fix',
      change: 'oug-195-2002-2026-11-06',
    });
    expect(request.messages[1].content).toContain('[1] Material de instruire');
    const body = vi.mocked(gh.openPull).mock.calls[0]![0].body;
    expect(body).toContain('**not applied**');
    expect(body).toMatch(
      /- \*\*2\.2_general_training_material\.docx\*\* ¶\d+\n {2}- now: .+\n {2}- proposed: Text propus\.\n {2}- why: Reia regula căștii\./
    );
    expect(body).not.toContain('Nimic.');
    expect(discord.send.mock.calls[0]![0].content).toContain('Sentences of ours to change');
  });

  it('writes a plain note when no model is configured', async () => {
    const { deps, tool, gh } = setup({ model: null });
    await runLegislationFix(deps, options);
    expect(tool.mock.calls[1]![0].change!.note).toBe(
      'Art. 36 alin. (2) din O.U.G. 195/2002 este citat în forma modificată prin Legea 207/2026.'
    );
    expect(vi.mocked(gh.openPull).mock.calls[0]![0].body).toContain('No model was asked');
  });

  it('opens an issue, and no pull request, when our passage does not hold the old words', async () => {
    const { deps, gh, git, discord } = setup({
      tool: () => ({
        status: 'needs-review',
        problems: [{ alineat: '2', reason: "the template's passage does not hold the old words" }],
        markdown: '',
      }),
    });
    const report = await runLegislationFix(deps, options);

    expect(report.results).toMatchObject([
      { action: 'issue', url: expect.stringContaining('/issues/951') },
    ]);
    expect(gh.openPull).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(git.restore).toHaveBeenCalled();
    const issue = vi.mocked(gh.openIssue).mock.calls[0]![0];
    expect(issue.title).toBe('Legislation: O.U.G. 195/2002, form of 2026-11-06 needs a person');
    expect(issue.body).toContain(
      "- 2.2_general_training_material.docx, Art. 36 alin. (1) – (3): (2) the template's passage does not hold the old words"
    );
    expect(issue.body).toContain(`- ${oldText}\n+ ${newText}`);
    expect(discord.send.mock.calls[0]![0].content).toContain(
      'Issue: <https://github.com/PCRinus/ssm-usor/issues/951>'
    );
  });

  it('opens an issue when the citation index no longer lists the quote', async () => {
    const moved = {
      ...roads,
      passages: [{ ...roads.passages[0]!, paragraph: 7, locator: 'Art. 99' }],
    };
    const { deps, gh, tool } = setup({ changes: [moved] });
    await runLegislationFix(deps, options);
    expect(tool).not.toHaveBeenCalled();
    expect(vi.mocked(gh.openIssue).mock.calls[0]![0].body).toContain(
      'the citation index no longer lists this quote at ¶7'
    );
  });

  it('says so and goes on when the pull request cannot be opened', async () => {
    const { deps, git, discord } = setup({
      github: { openPull: vi.fn().mockRejectedValue(new Error('GitHub answered 422')) },
    });
    const report = await runLegislationFix(deps, options);
    expect(report.results).toMatchObject([{ action: 'failed', reason: 'GitHub answered 422' }]);
    expect(git.switchTo).toHaveBeenCalledWith('main');
    expect(discord.send.mock.calls.at(-1)![0].content).toContain('Legislation fix failed');
  });
});

describe('a change that needs review', () => {
  it('opens an issue with the reasons and the passages', async () => {
    const review: OpenChange = {
      ...roads,
      outcome: 'needs_review',
      review: ['Art. 37 is referred to and was changed.'],
      passages: [
        {
          ...roads.passages[0]!,
          citation_form: 'reference',
          locator: null,
          unit_label: 'Art. 37',
          paragraph: 2060,
        },
      ],
    };
    const { deps, gh, tool } = setup({ changes: [review] });
    await runLegislationFix(deps, options);
    expect(tool).not.toHaveBeenCalled();
    const issue = vi.mocked(gh.openIssue).mock.calls[0]![0];
    expect(issue.body).toContain('- Art. 37 is referred to and was changed.');
    expect(issue.body).toContain(
      '- 2.2_general_training_material.docx ¶2060, reference Art. 37: Art. 37 changed'
    );
  });
});

describe('a change already answered', () => {
  it('is skipped while its pull request is open or merged', async () => {
    const { deps, tool, gh } = setup({
      github: {
        pullForBranch: vi
          .fn()
          .mockResolvedValue({ number: 950, url: 'https://x/950', state: 'closed' }),
      },
    });
    const report = await runLegislationFix(deps, options);
    expect(report.results).toEqual([
      {
        key: 'oug-195-2002-2026-11-06',
        action: 'skipped',
        reason: 'pull request https://x/950 (closed) answers it',
      },
    ]);
    expect(tool).not.toHaveBeenCalled();
    expect(gh.openIssue).not.toHaveBeenCalled();
  });

  it('is skipped while its issue exists', async () => {
    const { deps, gh } = setup({
      github: {
        issueByMarker: vi
          .fn()
          .mockResolvedValue({ number: 951, url: 'https://x/951', state: 'open' }),
      },
    });
    const report = await runLegislationFix(deps, options);
    expect(report.results[0]).toMatchObject({ action: 'skipped' });
    expect(gh.issueByMarker).toHaveBeenCalledWith(
      '<!-- legislation-change: oug-195-2002-2026-11-06 -->'
    );
  });

  it('is skipped when a manifest already resolves it, waiting for the release', async () => {
    const { deps, gh } = setup({ resolves: true });
    const report = await runLegislationFix(deps, options);
    expect(report.results[0]).toMatchObject({ action: 'skipped' });
    expect(gh.pullForBranch).not.toHaveBeenCalled();
  });
});

describe('a dry run', () => {
  it('applies and prints everything, and pushes, opens and posts nothing', async () => {
    const { deps, gh, git, discord, tool, lines } = setup();
    const report = await runLegislationFix(deps, { ...options, dryRun: true });

    expect(report.results).toMatchObject([{ action: 'pull', url: null }]);
    expect(tool).toHaveBeenCalledTimes(2);
    expect(gh.ensureLabel).not.toHaveBeenCalled();
    expect(gh.openPull).not.toHaveBeenCalled();
    expect(gh.openIssue).not.toHaveBeenCalled();
    expect(git.commit).not.toHaveBeenCalled();
    expect(git.push).not.toHaveBeenCalled();
    expect(git.restore).toHaveBeenCalled();
    expect(discord.send).not.toHaveBeenCalled();
    const printed = lines.join('\n');
    expect(printed).toContain('--- Pull request: fix(templates): quote O.U.G. 195/2002');
    expect(printed).toContain('## Actualizări');
    expect(printed).toContain('--- Discord payload ---');
    expect(printed).toContain('Dry run: no pull request opened.');
  });
});

describe('the dead-man check', () => {
  it('warns when no check succeeded in two days and nothing said so', async () => {
    const { deps, discord } = setup({
      changes: [],
      runs: {
        lastSucceededStart: '2026-11-11T03:17:00Z',
        latest: { status: 'running', startedAt: '2026-11-12T03:17:00Z' },
      },
    });
    const report = await runLegislationFix(deps, options);
    expect(report.stale).toBe(true);
    expect(discord.send.mock.calls[0]![0].content).toBe(
      '🔴 **No successful legislation check in two days** · production\nThe last successful run started 2026-11-11T03:17:00Z.'
    );
  });

  it('leaves the warning to the Worker when its run failed this morning', () => {
    expect(
      deadManDue(
        {
          lastSucceededStart: '2026-11-10T03:17:00Z',
          latest: { status: 'failed', startedAt: '2026-11-13T03:17:00Z' },
        },
        now
      )
    ).toBe(false);
  });

  it('warns when no run ever succeeded and none ran lately', () => {
    expect(deadManDue({ lastSucceededStart: null, latest: null }, now)).toBe(true);
    expect(deadManDue(recentRuns, now)).toBe(false);
  });
});
