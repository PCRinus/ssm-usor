import { reviewedRiskFactors } from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import type { LibraryPost } from './library-model';
import {
  cleanRiskChanges,
  confirmSentence,
  existingByReference,
  factorChangeFrom,
  factorState,
  incompleteFactors,
  incompleteText,
  lacksText,
  leftSentence,
  type LibraryName,
  measureGap,
  nameNote,
  nameSuggestions,
  needsCheck,
  pendingLine,
  pendingOf,
  placedPlanRows,
  planFieldsLine,
  type PlanRow,
  planRowsLine,
  type ProposedFactor,
  removedByMember,
  type RiskSheet,
  type RisksPart,
  risksPartDescription,
  riskSummary,
  type SheetChange,
  type SheetContext,
  sheetFlagText,
  sheetState,
  similarCounts,
  takenNameProblem,
  takenNamesText,
  takenSheets,
  unplacedPlanRows,
  usedOutcome,
  withIncluded,
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

describe('an unacceptable factor without a measure', () => {
  const commute = factor({
    description: 'Accident de traseu pe timpul deplasării de la/la serviciu',
    gravityClass: 7,
    probabilityClass: 2,
    printedLevel: 3,
    level: 4,
    measures: [],
    measuresFrom: null,
    deadline: null,
    responsiblePerson: null,
    flags: [{ kind: 'level_mismatch', grid: 4, printed: 3 }],
  });

  it('says the sheet printed an acceptable level the classes do not give, and what to do', () => {
    expect(measureGap(factorState(commute))).toEqual({
      text: 'Planul de prevenire nu are nicio măsură pentru acest factor. Pe fișă e trecut nivelul 3, dar gravitatea 7 și probabilitatea 2 dau nivelul 4, iar de la nivelul 4 factorul are nevoie de o măsură. Adaugă o măsură sau verifică clasele.',
      explainsLevel: true,
    });
  });

  it('says only that the level asks for a measure when the sheet printed it as well', () => {
    const printed = factorState({
      ...commute,
      gravityClass: 4,
      probabilityClass: 5,
      printedLevel: 4,
      level: 5,
      flags: [{ kind: 'level_mismatch', grid: 5, printed: 4 }],
    });
    expect(measureGap(printed)).toEqual({
      text: 'Planul de prevenire nu are nicio măsură pentru acest factor, iar nivelul 5 cere una. Adaugă o măsură.',
      explainsLevel: false,
    });
    expect(measureGap(factorState({ ...commute, flags: [] }))?.explainsLevel).toBe(false);
  });

  it('says nothing once a measure is added, or for an acceptable factor', () => {
    expect(
      measureGap(
        factorState(commute, { measures: [{ kind: 'organizational', description: 'Instruire' }] })
      )
    ).toBeNull();
    expect(measureGap(factorState({ ...commute, gravityClass: 2, level: 2 }))).toBeNull();
  });

  it('is a factor to look at while it is ticked', () => {
    const plain = factorState({ ...commute, flags: [] });
    expect(needsCheck(plain)).toBe(true);
    expect(needsCheck(factorState({ ...commute, flags: [], included: false }))).toBe(false);
  });
});

describe('a sheet of the pack', () => {
  it('adds a post’s new sheet to the library, with nothing to choose, and writes it on its post', () => {
    const state = sheetState(sheet(), undefined, context());
    expect(state.choice).toBe('add');
    expect(state.options).toEqual([]);
    expect(state.createsEntry).toBe(true);
    expect(state.targets.map((target) => [target.post.name, target.choice])).toEqual([
      ['Bucătar', 'append'],
    ]);
    expect(pendingOf(state, false)).toEqual([]);
  });

  it('adds a post’s sheet the reading left out of the library, as a proposal stored before', () => {
    const state = sheetState(sheet({ choice: 'skip' }), undefined, context());
    expect(state.choice).toBe('add');
    expect(state.createsEntry).toBe(true);
  });

  it('keeps a client-level sheet out of the library, with nothing to choose, even like an entry', () => {
    const visitors = sheet({
      key: 'visitors',
      kind: 'other',
      name: 'Vizitatori',
      posts: [],
      existing: { factors: 0, choice: null },
      choice: 'skip',
    });
    for (const each of [
      visitors,
      { ...visitors, status: 'similar' as const, match },
      { ...visitors, status: 'identical' as const, match, choice: 'use_existing' as const },
    ]) {
      const state = sheetState(each, undefined, context());
      expect(state.options).toEqual([]);
      expect(state.createsEntry).toBe(false);
      expect(state.usesLibrary).toBe(false);
      expect(state.toClient).toBe(true);
      expect(pendingOf(state, true)).toEqual([]);
    }
  });

  it('asks about a similar sheet until a choice is picked, even the proposed one', () => {
    const similar = sheet({ status: 'similar', match, choice: 'add_new' });
    const before = sheetState(similar, undefined, context());
    expect(before.choice).toBe('add_new');
    expect(pendingOf(before, false)).toEqual(['library']);
    expect(before.options).toEqual(['use_existing', 'add_new']);
    const after = sheetState(similar, { library: 'use_existing' }, context());
    expect(pendingOf(after, false)).toEqual([]);
    expect(after.usesLibrary).toBe(true);
    expect(after.createsEntry).toBe(false);
    expect(usedOutcome(after)).toBe(
      'Evaluarea ta rămâne cum e; fișa postului primește factorii din pachet, legați de ea.'
    );
    expect(sheetState(similar, { library: 'add_new' }, context()).createsEntry).toBe(true);
    expect(similarCounts(match)).toBe('1 factor la fel și 1 doar în pachet.');
    expect(
      similarCounts({
        ...match,
        pairs: Array(38).fill(match.pairs[0]),
        onlyInPack: Array(5).fill('x'),
        onlyInLibrary: ['f9', 'f10'],
      })
    ).toBe('38 de factori la fel, 5 doar în pachet și 2 doar în evaluarea ta.');
  });

  it('keeps a post that already has factors as it is, unless the member says otherwise', () => {
    const chambermaid = sheet({
      key: 'chambermaid',
      posts: [{ name: 'Cameristă', existingFactors: 18, choice: 'keep' }],
    });
    const kept = sheetState(chambermaid, undefined, context([chambermaid]));
    expect(kept.targets[0]).toMatchObject({ existing: 18, choice: 'keep', picked: false });
    expect(kept.toClient).toBe(false);
    expect(kept.createsEntry).toBe(true);
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
    const removed = withIncluded({}, state.factors, false);
    expect(pendingOf(sheetState(sheet(), removed, context()), true)).toEqual([]);
  });
});

describe('the name a new entry takes', () => {
  const entries: LibraryName[] = [
    { id: 'p1', name: 'Bucătar', archived: false },
    { id: 'p2', name: 'Ospătar', archived: true },
  ];

  it('says where the proposed name comes from', () => {
    expect(
      nameNote(sheetState(sheet({ nameFrom: 'post' }), undefined, context()), entries)
    ).toEqual({ text: 'E numele postului din document.', entry: null });
    const shared = sheet({
      nameFrom: 'heading',
      libraryName: 'Personal de bucătărie',
      posts: [
        { name: 'Bucătar', existingFactors: 0, choice: null },
        { name: 'Ajutor de bucătar', existingFactors: 0, choice: null },
      ],
    });
    expect(nameNote(sheetState(shared, undefined, context()), entries)?.text).toBe(
      'E numele din titlul fișei, care e pentru posturile Bucătar și Ajutor de bucătar.'
    );
    expect(nameNote(sheetState(sheet(), undefined, context()), entries)).toBeNull();
  });

  it('says when the name is the work the sheet evaluates or its workplace, with the posts', () => {
    const work = sheet({
      nameFrom: 'work',
      libraryName: 'Prepararea hranei',
      workName: 'Prepararea hranei',
    });
    expect(nameNote(sheetState(work, undefined, context()), entries)?.text).toBe(
      'Am numit-o după munca din fișă, care e pentru postul Bucătar.'
    );
    const workplace = sheet({
      nameFrom: 'workplace',
      libraryName: 'Bucătărie caldă',
      workplace: 'Bucătărie caldă',
      posts: [
        { name: 'Bucătar', existingFactors: 0, choice: null },
        { name: 'Ajutor de bucătar', existingFactors: 0, choice: null },
      ],
    });
    expect(nameNote(sheetState(workplace, undefined, context()), entries)?.text).toBe(
      'E locul de muncă din titlul fișei, care e pentru posturile Bucătar și Ajutor de bucătar.'
    );
    expect(
      nameNote(sheetState(sheet({ nameFrom: 'work', posts: [] }), undefined, context()), entries)
        ?.text
    ).toBe('Am numit-o după munca din fișă.');
  });

  it('offers the work, the workplace and the posts as names, leaving out those taken', () => {
    const named = sheet({
      nameFrom: 'work',
      libraryName: 'Prepararea hranei',
      workName: 'Prepararea hranei',
      workplace: 'Bucătărie caldă',
      name: 'BUCĂTAR',
    });
    expect(nameSuggestions(sheetState(named, undefined, context()), entries, [])).toEqual([
      'Bucătărie caldă',
    ]);
    expect(
      nameSuggestions(
        sheetState(named, { libraryName: 'Bucătărie rece' }, context()),
        [],
        ['Bucătărie caldă']
      )
    ).toEqual(['Prepararea hranei', 'Bucătar', 'BUCĂTAR']);
    expect(nameSuggestions(sheetState(sheet(), undefined, context()), [], [])).toEqual([]);
  });

  it('says why the client’s name was added, with the entry that holds the name, archived or not', () => {
    const taken = sheet({ libraryName: 'Bucătar (Hanul Verde)', takenName: 'Bucătar' });
    expect(nameNote(sheetState(taken, undefined, context()), entries)).toEqual({
      text: 'Ai deja o evaluare numită „Bucătar”, cu alți factori, așa că am adăugat numele clientului.',
      entry: entries[0],
    });
    const archived = sheet({ libraryName: 'Ospătar (Hanul Verde)', takenName: 'Ospătar' });
    expect(nameNote(sheetState(archived, undefined, context()), entries)?.text).toBe(
      'Ai deja o evaluare arhivată numită „Ospătar”, cu alți factori, așa că am adăugat numele clientului.'
    );
    const similar = sheet({
      libraryName: 'Bucătar (Hanul Verde)',
      takenName: 'Bucătar',
      status: 'similar',
      match,
      choice: 'add_new',
    });
    expect(nameNote(sheetState(similar, { library: 'add_new' }, context()), entries)).toEqual({
      text: 'Numele „Bucătar” e al evaluării tale asemănătoare, așa că am adăugat numele clientului.',
      entry: null,
    });
    expect(
      nameNote(sheetState(taken, { libraryName: 'Bucătărie caldă' }, context()), entries)?.text
    ).toBe('Numele l-ai ales tu; propunerea era „Bucătar (Hanul Verde)”.');
  });

  it('refuses a name the library or another new entry of the pack has', () => {
    expect(takenNameProblem('bucatar', entries, [])).toBe(
      'Biblioteca are deja o evaluare cu acest nume. Alege alt nume.'
    );
    expect(takenNameProblem('Ospătar', entries, [])).toBe(
      'Biblioteca are deja o evaluare arhivată cu acest nume. Alege alt nume.'
    );
    expect(takenNameProblem('Recepție', entries, ['Recepție'])).toBe(
      'Altă evaluare din pachet are deja acest nume. Alege alt nume.'
    );
    expect(takenNameProblem('Bucătărie caldă', entries, ['Recepție'])).toBeNull();
  });
});

describe('the plan rows placed on a sheet', () => {
  const planFactor = (key: string, overrides: Partial<ProposedFactor> = {}) =>
    factor({
      key,
      row: key.replace('plan-', ''),
      component: null,
      writtenComponent: '',
      group: '',
      description: 'Neutilizarea echipamentului individual de protecție',
      code: null,
      consequence: '',
      gravityClass: null,
      probabilityClass: null,
      printedLevel: null,
      measures: [
        { kind: 'organizational', description: 'Instruirea personalului' },
        { kind: 'organizational', description: 'Afișarea instrucțiunii.' },
        { kind: 'other', description: 'Mănuși' },
      ],
      actions: 'Alocarea fondurilor materiale necesare',
      deadline: 'Periodic',
      responsiblePerson: 'Cond. loc munca; Serv extern',
      included: false,
      level: null,
      ...overrides,
    });
  const planRow = (sheetKey: string | null, key: string): PlanRow => ({
    row: key.replace('plan-', ''),
    file: 'Dosar/Plan.docx',
    text: '| 22 |  | Neutilizarea echipamentului | Instruirea personalului; | -- |',
    post: 'RECEPTIONER HOTEL',
    risk: 'Neutilizarea echipamentului',
    sheet: sheetKey,
    factor: planFactor(key),
  });
  const cook = sheet();
  const rows = [
    planRow('cook', 'plan-R22'),
    planRow('cook', 'plan-R23'),
    planRow(null, 'plan-R30'),
    planRow('gone', 'plan-R31'),
    { ...planRow('cook', 'plan-R32'), factor: null },
    { row: 'R33', file: 'Dosar/Plan.docx', text: '| x |', post: '', risk: '' },
  ];
  const withPlan = (change?: SheetChange, client = false) =>
    sheetState(client ? { ...cook, kind: 'sensitive_groups', posts: [] } : cook, change, {
      ...context(),
      planFactors: placedPlanRows(rows, [cook]),
    });
  const added = {
    component: 'executant' as const,
    group: 'Omisiuni',
    gravityClass: 2,
    probabilityClass: 3,
    included: true,
  };

  it('puts on a sheet only the rows with a factor placed on it, the rest at the end', () => {
    expect(withPlan().planRows.map((row) => row.factor.key)).toEqual(['plan-R22', 'plan-R23']);
    expect(unplacedPlanRows(rows, [cook]).map((row) => row.row)).toEqual([
      'R30',
      'R31',
      'R32',
      'R33',
    ]);
  });

  it('writes a row once added, and counts no row left out as something to fix', () => {
    const before = withPlan();
    expect(before).toMatchObject({ written: 2, incomplete: 0, leftOut: 0, toCheck: 0 });

    const after = withPlan({ factors: { 'plan-R22': added } });
    expect(after.written).toBe(3);
    expect(after.planRows[0]).toMatchObject({ included: true, complete: true, level: 2 });
    expect(riskSummary([after]).factors).toBe(3);
  });

  it('says how many rows are for the post and how many the member added', () => {
    expect(planRowsLine(withPlan())).toBe(
      '2 rânduri din documente sunt pentru acest post, dar nu le-am putut lega de niciun factor de pe fișă.'
    );
    expect(planRowsLine(withPlan({ factors: { 'plan-R23': added } }, true))).toBe(
      '2 rânduri din documente sunt pentru această fișă, dar nu le-am putut lega de niciun factor de pe fișă. Ai adăugat un factor din ele.'
    );
  });

  it('lists the measures by kind and the plan fields present', () => {
    expect(planFieldsLine(planFactor('plan-R22'))).toBe(
      'Măsuri organizatorice: Instruirea personalului; Afișarea instrucțiunii. · Alte măsuri: Mănuși · Acțiuni: Alocarea fondurilor materiale necesare · Termen: Periodic · Răspunde: Cond. loc munca; Serv extern'
    );
  });
});

describe('the confirm bar and the header', () => {
  const visitors = sheet({
    key: 'visitors',
    kind: 'other',
    name: 'Vizitatori',
    posts: [],
    existing: { factors: 0, choice: null },
    choice: 'skip',
  });

  it('names what confirming adds to the library and counts what it writes on the client', () => {
    const states = [
      sheetState(sheet(), undefined, context()),
      sheetState(
        sheet({ key: 'similar', status: 'similar', match, choice: 'use_existing' }),
        undefined,
        context()
      ),
      sheetState(visitors, undefined, context()),
    ];
    const summary = riskSummary(states);
    expect(summary).toEqual({
      created: [{ name: 'Bucătar', factors: 2 }],
      used: ['Bucătar'],
      sheets: 3,
      factors: 6,
      post: null,
    });
    expect(confirmSentence(summary)).toBe(
      'Când confirmi, adăugăm „Bucătar” în bibliotecă, cu 2 factori, folosim „Bucătar” din biblioteca ta, și scriem 6 factori pe 3 fișe ale clientului.'
    );
    expect(confirmSentence({ created: [], used: [], sheets: 0, factors: 0, post: null })).toBe(
      'Nu adăugăm nimic în bibliotecă și nu scriem nimic pe fișele clientului.'
    );
    expect(
      confirmSentence({
        created: ['A', 'B', 'C', 'D'].map((name) => ({ name, factors: 1 })),
        used: [],
        sheets: 0,
        factors: 0,
        post: null,
      })
    ).toBe(
      'Când confirmi, adăugăm 4 evaluări în bibliotecă, fără să scriem factori pe fișele clientului.'
    );
  });

  it('names the evaluation and its post, one factor fewer once one is unticked', () => {
    const one = sheet();
    const all = sheetState(one, undefined, context());
    expect(confirmSentence(riskSummary([all]))).toBe(
      'Când confirmi, adăugăm „Bucătar” în bibliotecă, cu 2 factori, și îi scriem pe fișa postului „Bucătar”.'
    );
    const unticked = sheetState(one, withIncluded({}, [all.factors[0]!], false), context());
    expect(confirmSentence(riskSummary([unticked]))).toBe(
      'Când confirmi, adăugăm „Bucătar” în bibliotecă, cu un factor, și îi scriem pe fișa postului „Bucătar”.'
    );
    const renamed = sheetState(one, { libraryName: 'Bucătărie caldă' }, context());
    expect(
      confirmSentence(riskSummary([renamed, sheetState(visitors, undefined, context())]))
    ).toBe(
      'Când confirmi, adăugăm „Bucătărie caldă” în bibliotecă, cu 2 factori, și scriem 4 factori pe 2 fișe ale clientului.'
    );
  });

  it('names the evaluations a refused confirm asks to change', () => {
    expect(takenNamesText(['Contabil'])).toBe(
      'Biblioteca are deja o evaluare cu numele ales. Schimbă numele marcat la evaluarea „Contabil”.'
    );
    expect(incompleteText(['Bucătar', 'Ospătar'])).toBe(
      'Unii factori incluși nu au clasele, componenta sau grupa. Completează-i la factorii marcați la evaluările „Bucătar” și „Ospătar” sau oprește-i.'
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
      'Mai ai de ales la o evaluare. Un factor are ceva de verificat, marcat la el. Unui factor îi lipsesc clasele, componenta sau grupa și rămâne pe dinafară până le alegi.'
    );
  });
});

describe('the changes and the refusals', () => {
  it('drops what holds no change', () => {
    const changes: { sheets: Record<string, SheetChange> } = {
      sheets: {
        cook: { factors: { 'cook.1': {} }, postChoices: {} },
        chambermaid: { library: 'add_new', factors: { 'chambermaid.1': { included: false } } },
      },
    };
    expect(cleanRiskChanges(changes)).toEqual({
      sheets: {
        chambermaid: { library: 'add_new', factors: { 'chambermaid.1': { included: false } } },
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

describe('the risk evaluations task on the hub', () => {
  const part = (overrides: Partial<RisksPart> = {}): RisksPart => ({
    part: 'risk_evaluations',
    status: 'to_review',
    attempt: 1,
    failureReason: null,
    version: 0,
    changes: null,
    counts: { identical: 2, similar: 0, new: 0, unread: 0 },
    readAt: '2026-11-02T09:00:00Z',
    confirmedAt: null,
    expiresAt: null,
    credits: 15,
    postReferences: {},
    existingFactors: null,
    libraryNames: [],
    proposal: null,
    ...overrides,
  });

  it('asks to confirm sheets the library already has, since confirming writes them on the client', () => {
    expect(risksPartDescription(part(), true)).toBe(
      'Le ai deja în bibliotecă; confirmă ca să le scriem pe fișele clientului.'
    );
    expect(risksPartDescription(part(), false)).toBe(
      'Le ai deja în bibliotecă; după client, confirmă-le ca să le scriem pe fișele lui.'
    );
  });

  it('says nothing is new only for a part that writes nothing', () => {
    expect(risksPartDescription(part({ status: 'nothing_new' }), true)).toBe(
      'Nimic nou: le ai deja în bibliotecă și nu e nimic de scris pe fișele clientului.'
    );
  });

  it('counts the new and similar sheets beside those already in the library', () => {
    expect(
      risksPartDescription(part({ counts: { identical: 1, similar: 1, new: 1, unread: 0 } }), false)
    ).toBe(
      'De verificat: 3 evaluări, una nouă, una asemănătoare și 1 deja în bibliotecă. Le confirmi după client.'
    );
  });
});

describe('a sheet’s warnings', () => {
  it('asks to check the classes of a sheet whose gravity and probability look swapped', () => {
    expect(sheetFlagText({ kind: 'classes_swapped' })).toBe(
      'Gravitatea și probabilitatea par inversate în document: verifică clasele.'
    );
  });
});

describe('the factor switches and what confirming writes', () => {
  it('writes the factors whose switch is on, and only those', () => {
    const own = sheet({
      factors: [
        factor(),
        factor({ key: 'cook.2', description: 'Tăiere cu cuțitul' }),
        factor({ key: 'cook.3', description: 'Alunecare pe pardoseala udă' }),
        factor({ key: 'cook.4', gravityClass: null, included: false, level: null }),
      ],
    });
    const factors = {
      'cook.2': { included: false },
      'cook.3': { included: false },
      'cook.4': { included: true, gravityClass: 3 },
    };
    const changes = { sheets: { cook: { factors } } };
    const state = sheetState(own, changes.sheets.cook as never, context([own]));
    const { reviewed, issues } = reviewedRiskFactors(
      { sheets: [own], unplacedRows: [], unmatchedPlanRows: [], unmatchedMeasureRows: [] } as never,
      changes as never
    );
    expect(issues).toEqual([]);
    expect(reviewed.get('cook')!.map((each) => each.key)).toEqual(
      state.factors.filter((each) => each.included).map((each) => each.factor.key)
    );
    expect(reviewed.get('cook')!.map((each) => each.key)).toEqual(['cook.1', 'cook.4']);
  });
});

describe('the factors a sheet counts as left out', () => {
  it('are the ones that collapse: proposed and switched off, not proposed off', () => {
    const own = sheet({
      factors: [
        factor(),
        factor({ key: 'cook.2', gravityClass: null, included: false, level: null }),
      ],
    });
    const state = sheetState(
      own,
      {
        factors: { 'cook.1': { included: false }, 'cook.2': { included: false, gravityClass: 3 } },
      },
      context([own])
    );
    expect(state.factors.filter(removedByMember).map((each) => each.factor.key)).toEqual([
      'cook.1',
    ]);
  });
});
