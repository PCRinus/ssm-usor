import { riskImportChangesSchema } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { riskImportPayload } from './risks-payload';
import { entryName, proposeRisks } from './risks-proposal';
import { readRisksAnswer } from './risks-read';
import { risksProposalSchema } from './risks-schema';
import { answer, assessment, plan } from './test/risks-pack';

const read = readRisksAnswer([assessment, plan], answer);
const posts = ['Brutar', 'Vânzător', 'Casier'];
const propose = (overrides: Partial<Parameters<typeof proposeRisks>[0]> = {}) =>
  proposeRisks({
    read,
    posts,
    library: [],
    takenNames: [],
    client: { name: 'Brutăria din curte' },
    ...overrides,
  });

describe('proposeRisks', () => {
  const proposal = propose();
  const [baker, shop, sensitive, visitor] = proposal.sheets;

  it('applies a sheet that names several posts to each, as the proposal names them', () => {
    expect(shop!.posts).toEqual([
      { name: 'Vânzător', existingFactors: 0, choice: null },
      { name: 'Casier', existingFactors: 0, choice: null },
    ]);
    expect(shop!.undecided).toBe(false);
    expect(shop).toMatchObject({
      libraryName: 'Vânzător, casier',
      nameFrom: 'heading',
      takenName: null,
    });
  });

  it('leaves a heading that names none of the posts undecided', () => {
    const [sheet] = proposeRisks({
      read: { ...read, sheets: [{ ...read.sheets[0]!, posts: ['Patiser'] }] },
      posts,
      library: [],
      takenNames: [],
      client: { name: 'Brutăria din curte' },
    }).sheets;

    expect(sheet).toMatchObject({ posts: [], undecided: true, libraryName: 'Brutar' });
  });

  it('ticks a factor only when its component and classes are known, with the grid’s level', () => {
    expect(baker!.factors.map((factor) => factor.included)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(baker!.factors[2]).toMatchObject({ printedLevel: 4, level: 3 });
    expect(baker!.factors[6]!.level).toBeNull();
  });

  it('adds a new post sheet to the library and leaves a client-level one out', () => {
    expect(baker).toMatchObject({
      status: 'new',
      choice: 'add',
      copyOf: null,
      sameAs: ['sheet-3'],
    });
    expect(visitor).toMatchObject({
      kind: 'other',
      status: 'new',
      choice: 'skip',
      libraryName: 'Vizitator',
    });
    expect(visitor!.existing).toEqual({ factors: 0, choice: null });
  });

  it('keeps a sensitive groups’ copy of a post’s sheet, following that sheet in the library', () => {
    expect(sensitive).toMatchObject({
      kind: 'sensitive_groups',
      status: null,
      choice: null,
      copyOf: 'sheet-1',
      libraryName: 'Grupuri sensibile',
    });
    expect(sensitive!.factors).toHaveLength(7);
  });

  it('proposes the client’s name after a name the library has, and leaves a post with factors as it is', () => {
    const named = propose({
      takenNames: ['Brutar'],
      existing: { posts: { Brutar: 18 }, other: { Vizitator: 2 } },
    });

    expect(named.sheets[0]).toMatchObject({
      libraryName: 'Brutar (Brutăria din curte)',
      nameFrom: 'post',
      takenName: 'Brutar',
      posts: [{ name: 'Brutar', existingFactors: 18, choice: 'keep' }],
    });
    expect(named.sheets[3]!.existing).toEqual({ factors: 2, choice: 'keep' });
  });

  it('uses an identical library entry and pairs its factors', () => {
    const library = [
      {
        id: 'e1',
        name: 'Vânzător',
        factors: shop!.factors.map((factor, index) => ({
          id: `lf${index + 1}`,
          component: factor.component!,
          description: factor.description,
          gravityClass: factor.gravityClass!,
          probabilityClass: factor.probabilityClass!,
          measures: [],
        })),
      },
    ];
    const [, matched] = propose({ library, takenNames: ['Vânzător'] }).sheets;

    expect(matched).toMatchObject({ status: 'identical', choice: 'use_existing' });
    expect(matched!.match!.pairs.map((pair) => pair.libraryFactor)).toEqual(['lf1', 'lf2', 'lf3']);
  });

  it('keeps a post’s sheet the original of a client-level copy the pack puts before it', () => {
    const reordered = { ...read, sheets: [read.sheets[2]!, read.sheets[0]!] };
    const [copy, original] = propose({ read: reordered }).sheets;

    expect(original).toMatchObject({ kind: 'job_position', choice: 'add', copyOf: null });
    expect(copy).toMatchObject({ kind: 'sensitive_groups', choice: null, copyOf: 'sheet-1' });
  });

  it('proposes names within the database’s 160 characters', () => {
    const long = 'Operator la mașina de ambalat și etichetat produse de panificație '.repeat(3);
    const named = propose({
      read: {
        ...read,
        sheets: [
          { ...read.sheets[0]!, posts: [], name: long },
          { ...read.sheets[3]!, name: 'X' },
        ],
      },
      takenNames: [entryName(long).slice(0, 160).trim()],
      client: { name: 'Brutăria din curte și patiseria de lângă gară a familiei Popescu' },
    });

    expect(named.sheets[0]!.libraryName).toMatch(/ \(Brutăria din curte .*\)$/);
    expect(named.sheets[0]!.libraryName.length).toBeLessThanOrEqual(160);
    expect(named.sheets[1]!.libraryName).toMatch(/^Subcapitolul v\.iv\. evaluarea riscurilor/);
  });

  it('stores as its schema says', () => {
    expect(risksProposalSchema.parse(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
  });

  it('reads a proposal stored before its plan rows were placed on sheets', () => {
    const stored = JSON.parse(JSON.stringify(proposal)) as typeof proposal;
    for (const row of stored.unmatchedPlanRows) {
      delete row.sheet;
      delete row.factor;
    }

    expect(risksProposalSchema.parse(stored).unmatchedPlanRows[0]).not.toHaveProperty('factor');
  });
});

describe('entryName', () => {
  it('writes a heading’s capitals as a name', () => {
    expect(entryName('DIRECTOR GENERAL , DIRECTOR COMERCIAL')).toBe(
      'Director general, director comercial'
    );
    expect(entryName('Receptioner de hotel')).toBe('Receptioner de hotel');
  });
});

describe('riskImportPayload', () => {
  const proposal = propose();
  const posts = [
    { id: 'position-1', name: 'Brutar', jobPositionId: 'jp-brutar' },
    { id: 'position-2', name: 'Vânzător', jobPositionId: 'jp-vanzator' },
    { id: 'position-3', name: 'Casier', jobPositionId: null },
  ];
  const postReferences = { Brutar: 'position-1', Vânzător: 'position-2', Casier: 'position-3' };

  it('creates the chosen entries, with a person named only on the client’s sheet', () => {
    const { payload, issues } = riskImportPayload({
      proposal,
      changes: null,
      posts,
      postReferences,
    });

    expect(issues).toEqual([]);
    expect(payload.entries.map((entry) => [entry.key, entry.name, entry.factors.length])).toEqual([
      ['sheet-1', 'Brutar', 6],
      ['sheet-2', 'Vânzător, casier', 3],
    ]);
    expect(payload.entries[0]!.factors[1]!.responsible_person).toBeNull();
    const bakerSheet = payload.evaluations.find((evaluation) => evaluation.sheet === 'sheet-1')!;
    expect(bakerSheet.factors[1]).toMatchObject({
      responsible_person: 'Ion POPESCU',
      source: { entry: 'sheet-1', factor: 'sheet-1.2' },
    });
  });

  it('writes each sheet onto its posts and client-level evaluations, the copy pointing at the original’s entry', () => {
    const { payload } = riskImportPayload({ proposal, changes: null, posts, postReferences });

    expect(
      payload.evaluations.map((evaluation) => [
        evaluation.sheet,
        evaluation.kind,
        evaluation.job_position_id,
        evaluation.name,
        evaluation.mode,
      ])
    ).toEqual([
      ['sheet-1', 'job_position', 'jp-brutar', null, 'append'],
      ['sheet-2', 'job_position', 'jp-vanzator', null, 'append'],
      ['sheet-3', 'sensitive_groups', null, null, 'append'],
      ['sheet-4', 'other', null, 'Vizitator', 'append'],
    ]);
    const copy = payload.evaluations[2]!;
    expect(copy.factors[0]!.source).toEqual({ entry: 'sheet-1', factor: 'sheet-1.1' });
    expect(payload.evaluations[3]!.factors.map((factor) => factor.source)).toEqual([null]);
  });

  it('follows the member’s changes and leaves a post with factors as it is by default', () => {
    const changes = riskImportChangesSchema.parse({
      sheets: {
        'sheet-1': {
          postChoices: {},
          factors: { 'sheet-1.7': { probabilityClass: 4 }, 'sheet-1.1': { included: false } },
        },
        'sheet-2': { posts: ['position-2'], postChoices: { 'position-2': 'replace' } },
      },
    });
    const { payload } = riskImportPayload({
      proposal,
      changes,
      posts,
      postReferences,
      existing: { jobPositions: { 'jp-brutar': 18, 'jp-vanzator': 4 } },
    });

    expect(payload.entries.map((entry) => [entry.key, entry.factors.length])).toEqual([
      ['sheet-1', 5],
      ['sheet-2', 3],
    ]);
    expect(payload.evaluations.map((evaluation) => [evaluation.sheet, evaluation.mode])).toEqual([
      ['sheet-2', 'replace'],
      ['sheet-3', 'append'],
      ['sheet-4', 'append'],
    ]);
    expect(payload.evaluations[1]!.factors.map((factor) => factor.source)).toEqual([
      null,
      ...[2, 3, 4, 5, 6].map((index) => ({ entry: 'sheet-1', factor: `sheet-1.${index}` })),
    ]);
  });

  it('adds a post’s sheet stored as left out of the library, and never a client-level one', () => {
    const stored = {
      ...proposal,
      sheets: proposal.sheets.map((sheet) =>
        sheet.key === 'sheet-1' ? { ...sheet, choice: 'skip' as const } : sheet
      ),
    };
    const { payload } = riskImportPayload({
      proposal: stored,
      changes: riskImportChangesSchema.parse({ sheets: { 'sheet-4': { library: 'add_new' } } }),
      posts,
      postReferences,
    });

    expect(payload.entries.map((entry) => entry.key)).toEqual(['sheet-1', 'sheet-2']);
  });

  it('leaves a factor without a group unticked, and refuses it ticked', () => {
    const noGroup = readRisksAnswer(
      [
        {
          ...assessment,
          text: assessment.text.replace('| EXECUTANT | Acţiuni greşite |', '| EXECUTANT |  |'),
        },
        plan,
      ],
      answer
    );
    const grouped = propose({ read: noGroup });
    expect(grouped.sheets[0]!.factors[4]).toMatchObject({ group: '', included: false });

    const changes = riskImportChangesSchema.parse({
      sheets: { 'sheet-1': { factors: { 'sheet-1.5': { included: true } } } },
    });
    const { payload, issues } = riskImportPayload({
      proposal: grouped,
      changes,
      posts,
      postReferences,
    });
    expect(issues).toContainEqual({
      path: 'sheets.sheet-1.factors.sheet-1.5',
      message: 'incomplete',
    });
    expect(payload.entries[0]!.factors.every((factor) => factor.group !== '')).toBe(true);
  });

  it('writes a plan row placed on a sheet only once added, after the sheet’s factors', () => {
    expect(proposal.unmatchedPlanRows[0]).toMatchObject({
      sheet: 'sheet-1',
      factor: { key: 'plan-R41', included: false, level: null },
    });
    const left = riskImportPayload({ proposal, changes: null, posts, postReferences }).payload;
    expect(left.evaluations[0]!.factors.map((factor) => factor.key)).not.toContain('plan-R41');

    const changes = riskImportChangesSchema.parse({
      sheets: {
        'sheet-1': {
          factors: {
            'plan-R41': {
              component: 'work_environment',
              group: 'Factori de risc fizic',
              gravityClass: 2,
              probabilityClass: 3,
              included: true,
            },
          },
        },
      },
    });
    const { payload, issues } = riskImportPayload({ proposal, changes, posts, postReferences });

    expect(issues).toEqual([]);
    expect(payload.entries[0]!.factors.at(-1)).toMatchObject({ key: 'plan-R41' });
    expect(payload.evaluations[0]!.factors.at(-1)).toEqual({
      key: 'plan-R41',
      component: 'work_environment',
      group: 'Factori de risc fizic',
      description: 'Zgomot de la hota de evacuare',
      gravity_class: 2,
      probability_class: 3,
      measures: [{ kind: 'technical', description: 'Izolarea hotei.' }],
      actions: null,
      deadline: 'Anual',
      responsible_person: 'Administrator',
      observations: null,
      source: { entry: 'sheet-1', factor: 'plan-R41' },
    });
  });

  it('refuses a plan row added without its classes', () => {
    const changes = riskImportChangesSchema.parse({
      sheets: { 'sheet-1': { factors: { 'plan-R41': { included: true } } } },
    });

    expect(riskImportPayload({ proposal, changes, posts, postReferences }).issues).toEqual([
      { path: 'sheets.sheet-1.factors.plan-R41', message: 'incomplete' },
    ]);
  });

  it('refuses a ticked factor still without a class, and a post the client no longer has', () => {
    const changes = riskImportChangesSchema.parse({
      sheets: {
        'sheet-1': { factors: { 'sheet-1.7': { included: true } } },
        'sheet-2': { posts: ['position-9'] },
      },
    });

    expect(riskImportPayload({ proposal, changes, posts, postReferences }).issues).toEqual([
      { path: 'sheets.sheet-1.factors.sheet-1.7', message: 'incomplete' },
      { path: 'sheets.sheet-2.posts', message: 'unknown_post' },
    ]);
  });
});
