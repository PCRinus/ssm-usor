import { describe, expect, it } from 'vitest';

import type { LibraryPost } from './library-model';
import {
  cleanRiskChanges,
  confirmSentence,
  existingByReference,
  factorChangeFrom,
  factorState,
  incompleteFactors,
  lacksText,
  leftSentence,
  libraryOutcome,
  pendingLine,
  pendingOf,
  type ProposedFactor,
  type RiskSheet,
  riskSummary,
  type SheetChange,
  type SheetContext,
  sheetState,
  takenSheets,
} from './risks-model';

const factor = (overrides: Partial<ProposedFactor> = {}): ProposedFactor => ({
  key: 'cook.1',
  row: 'R12',
  source: { file: 'Dosar/Evaluare.docx', start: 0, end: 10 },
  component: 'means_of_production',
  writtenComponent: 'MIJLOACE DE PRODUCȚIE',
  group: 'Riscuri termice',
  description: 'Arsuri la atingerea plitei',
  code: 'F1.',
  consequence: 'ITM 3-45 zile',
  gravityClass: 2,
  probabilityClass: 5,
  printedLevel: 3,
  measures: [{ kind: 'technical', description: 'Mănuși termoizolante' }],
  measuresFrom: 'plan',
  actions: null,
  deadline: 'Permanent',
  responsiblePerson: 'Administrator',
  observations: null,
  flags: [],
  included: true,
  level: 3,
  ...overrides,
});

const sheet = (overrides: Partial<RiskSheet> = {}): RiskSheet => ({
  key: 'cook',
  file: 'Dosar/Evaluare.docx',
  heading: 'Fișa de evaluare: Bucătar',
  kind: 'job_position',
  name: 'Bucătar',
  rows: { first: 'R10', last: 'R14' },
  meansOfProduction: 'Plită, cuptor',
  workEnvironment: 'Bucătărie',
  exposure: '8 h / schimb',
  flags: [],
  posts: [{ name: 'Bucătar', existingFactors: 0, choice: null }],
  undecided: false,
  existing: null,
  libraryName: 'Bucătar',
  status: 'new',
  match: null,
  choice: 'add',
  sameAs: [],
  copyOf: null,
  factors: [factor(), factor({ key: 'cook.2', description: 'Tăiere cu cuțitul' })],
  ...overrides,
});

const posts: LibraryPost[] = [
  { id: 'position-1', name: 'Bucătar', jobPositionId: null },
  { id: 'position-2', name: 'Cameristă', jobPositionId: null },
];

const context = (sheets: RiskSheet[] = []): SheetContext => {
  const postReferences = { Bucătar: 'position-1', Cameristă: 'position-2' };
  return {
    postReferences,
    postsById: new Map(posts.map((post) => [post.id, post])),
    existingByReference: existingByReference(sheets, postReferences),
    existingFactors: null,
  };
};

const match = {
  evaluationId: 'e1',
  name: 'Bucătar',
  share: 0.8,
  pairs: [
    {
      factor: 'cook.1',
      libraryFactor: 'f1',
      similarity: 1,
      otherClasses: false,
      otherMeasures: false,
    },
  ],
  onlyInPack: ['cook.2'],
  onlyInLibrary: [],
};

describe('a factor of the pack', () => {
  it('takes the member changes and computes the level from the classes it ends with', () => {
    const state = factorState(factor(), { gravityClass: 4, probabilityClass: 5 });
    expect(state.level).toBe(5);
    expect(state.complete).toBe(true);
    expect(state.edited).toBe(true);
  });

  it('drops the flags a change answers and keeps those it does not', () => {
    const flagged = factor({
      gravityClass: null,
      level: null,
      included: false,
      flags: [
        { kind: 'class_missing', field: 'gravity', written: '' },
        { kind: 'person_named', field: 'responsiblePerson', text: 'Ionescu Maria' },
      ],
    });
    expect(factorState(flagged).complete).toBe(false);
    expect(factorState(flagged).flags.map((flag) => flag.kind)).toEqual([
      'class_missing',
      'person_named',
    ]);
    expect(
      factorState(flagged, { gravityClass: 3, included: true }).flags.map((flag) => flag.kind)
    ).toEqual(['person_named']);
    expect(
      factorState(factor({ flags: [{ kind: 'level_mismatch', printed: 2, grid: 3 }] }), {
        probabilityClass: 4,
      }).flags
    ).toEqual([]);
  });

  it('needs a group as well as the component and the classes before it can be taken', () => {
    const noGroup = factorState(factor({ group: ' ', included: false }));
    expect(noGroup.complete).toBe(false);
    expect(noGroup.missing).toEqual(['group']);
    expect(lacksText(noGroup.missing)).toBe('îi lipsește grupa');
    expect(lacksText(factorState(factor({ component: null, gravityClass: null })).missing)).toBe(
      'îi lipsesc componenta și clasele'
    );
    expect(factorState(factor({ group: '' }), { group: 'Riscuri termice' }).complete).toBe(true);
  });

  it("turns the editor's values into the differences only, and ticks a factor left out", () => {
    const proposed = factor({ gravityClass: null, included: false });
    expect(
      factorChangeFrom(proposed, {
        component: 'means_of_production',
        group: 'Riscuri termice',
        description: 'Arsuri la atingerea plitei ',
        gravityClass: 3,
        probabilityClass: 5,
        measures: [{ kind: 'technical', description: 'Mănuși termoizolante' }],
        actions: null,
        deadline: 'Permanent',
        responsiblePerson: null,
        observations: null,
      })
    ).toEqual({ gravityClass: 3, responsiblePerson: null, included: true });
  });
});

describe('a sheet of the pack', () => {
  it('adds a new sheet to the library and writes it on its post', () => {
    const state = sheetState(sheet(), undefined, context());
    expect(state.choice).toBe('add');
    expect(state.createsEntry).toBe(true);
    expect(state.targets.map((target) => [target.post.name, target.choice])).toEqual([
      ['Bucătar', 'append'],
    ]);
    expect(pendingOf(state, false)).toEqual([]);
    expect(libraryOutcome(state)).toBe(
      'Intră în bibliotecă ca evaluare nouă, iar fișa postului primește factorii din pachet.'
    );
  });

  it('asks about a similar sheet until a choice is picked, even the proposed one', () => {
    const similar = sheet({ status: 'similar', match, choice: 'add_new' });
    const before = sheetState(similar, undefined, context());
    expect(before.choice).toBe('add_new');
    expect(pendingOf(before, false)).toEqual(['library']);
    const after = sheetState(similar, { library: 'use_existing' }, context());
    expect(pendingOf(after, false)).toEqual([]);
    expect(after.usesLibrary).toBe(true);
    expect(after.createsEntry).toBe(false);
  });

  it('keeps a post that already has factors as it is, unless the member says otherwise', () => {
    const chambermaid = sheet({
      key: 'chambermaid',
      posts: [{ name: 'Cameristă', existingFactors: 18, choice: 'keep' }],
    });
    const kept = sheetState(chambermaid, undefined, context([chambermaid]));
    expect(kept.targets[0]).toMatchObject({ existing: 18, choice: 'keep', picked: false });
    expect(kept.toClient).toBe(false);
    expect(libraryOutcome(kept)).toBe(
      'Intră în bibliotecă ca evaluare nouă, iar fișa postului rămâne cum e.'
    );
    const appended = sheetState(
      chambermaid,
      { postChoices: { 'position-2': 'append' } },
      context([chambermaid])
    );
    expect(appended.toClient).toBe(true);
  });

  it("asks about the client's sheets as they are now, once the client exists", () => {
    const confirmedPosts: LibraryPost[] = [
      { id: 'position-1', name: 'Bucătar', jobPositionId: 'job-1' },
      { id: 'job-3', name: 'Ospătar', jobPositionId: 'job-3' },
    ];
    const now: SheetContext = {
      ...context([sheet()]),
      postsById: new Map(
        confirmedPosts.flatMap((post) => [
          [post.id, post] as const,
          [post.jobPositionId!, post] as const,
        ])
      ),
      existingFactors: { jobPositions: { 'job-1': 7, 'job-3': 4 }, sheets: { sensitive: 2 } },
    };
    expect(sheetState(sheet(), undefined, now).targets[0]).toMatchObject({
      existing: 7,
      choice: 'keep',
    });
    expect(sheetState(sheet(), { posts: ['job-3'] }, now).targets[0]).toMatchObject({
      existing: 4,
      choice: 'keep',
    });
    const sensitive = sheet({
      key: 'sensitive',
      kind: 'sensitive_groups',
      posts: [],
      existing: { factors: 0, choice: null },
    });
    expect(sheetState(sensitive, undefined, now).existing).toMatchObject({
      factors: 2,
      choice: 'keep',
    });
  });

  it('asks for the posts again when one the member picked is gone', () => {
    const gone = sheetState(sheet(), { posts: ['position-1', 'archived'] }, context());
    expect(gone.postsGone).toBe(true);
    expect(gone.targets.map((target) => target.reference)).toEqual(['position-1']);
    expect(pendingOf(gone, false)).toEqual(['posts']);
  });

  it('asks for the posts again when one the reading proposed is gone', () => {
    const gone = sheetState(sheet(), undefined, {
      ...context(),
      postReferences: { Bucătar: 'archived' },
    });
    expect(gone.postsGone).toBe(true);
    expect(pendingOf(gone, false)).toEqual(['posts']);
  });

  it('leaves an undecided sheet open until a post is picked or it goes to the library alone', () => {
    const undecided = sheet({ posts: [], undecided: true, name: 'Ospătar room-service' });
    expect(pendingOf(sheetState(undecided, undefined, context()), false)).toEqual(['posts']);
    const libraryOnly = sheetState(undecided, { posts: [] }, context());
    expect(pendingOf(libraryOnly, false)).toEqual([]);
    expect(libraryOnly.toClient).toBe(false);
  });

  it('asks for another name only for a sheet that makes an entry', () => {
    const state = sheetState(sheet(), undefined, context());
    expect(pendingOf(state, true)).toEqual(['name']);
    expect(pendingLine(['posts', 'name'])).toBe('Mai ai 2 lucruri de făcut');
    expect(pendingOf(sheetState(sheet(), { library: 'skip' }, context()), true)).toEqual([]);
  });
});

describe('the confirm bar and the header', () => {
  it('says what confirming adds to the library and writes on the client', () => {
    const states = [
      sheetState(sheet(), undefined, context()),
      sheetState(
        sheet({ key: 'similar', status: 'similar', match, choice: 'use_existing' }),
        undefined,
        context()
      ),
      sheetState(
        sheet({
          key: 'visitors',
          kind: 'other',
          name: 'Vizitatori',
          posts: [],
          existing: { factors: 0, choice: null },
          choice: 'skip',
        }),
        undefined,
        context()
      ),
    ];
    const summary = riskSummary(states);
    expect(summary).toEqual({ created: 1, used: 1, sheets: 3, factors: 6 });
    expect(confirmSentence(summary)).toBe(
      'Când confirmi, adăugăm o evaluare în bibliotecă, folosim una pe care o ai deja și scriem 6 factori pe 3 fișe ale clientului.'
    );
    expect(confirmSentence({ created: 0, used: 0, sheets: 0, factors: 0 })).toBe(
      'Nu adăugăm nimic în bibliotecă și nu scriem nimic pe fișele clientului.'
    );
  });

  it('counts the sheets left to decide and the factors to look at', () => {
    const flagged = sheet({
      factors: [
        factor({ flags: [{ kind: 'level_mismatch', printed: 2, grid: 3 }] }),
        factor({ key: 'cook.2', gravityClass: null, included: false, level: null }),
      ],
    });
    const states = [sheetState(flagged, undefined, context())];
    expect(leftSentence(states, 1)).toBe(
      'Mai ai de ales la o fișă. Un factor are ceva de verificat, marcat la el. Unui factor îi lipsesc clasele, componenta sau grupa și rămâne pe dinafară până le alegi.'
    );
  });
});

describe('the changes and the refusals', () => {
  it('drops what holds no change', () => {
    const changes: { sheets: Record<string, SheetChange> } = {
      sheets: {
        cook: { factors: { 'cook.1': {} }, postChoices: {} },
        chambermaid: { library: 'skip', factors: { 'chambermaid.1': { included: false } } },
      },
    };
    expect(cleanRiskChanges(changes)).toEqual({
      sheets: {
        chambermaid: { library: 'skip', factors: { 'chambermaid.1': { included: false } } },
      },
    });
  });

  it("reads the refused names and factors from the API's issues, with factor keys holding dots", () => {
    expect([...takenSheets([{ path: 'sheets.cook.libraryName' }])]).toEqual(['cook']);
    const refused = incompleteFactors([
      { path: 'sheets.receptionist.factors.receptionist.6' },
      { path: 'sheets.receptionist.factors.receptionist.2' },
    ]);
    expect([...refused.get('receptionist')!]).toEqual(['receptionist.6', 'receptionist.2']);
  });
});
