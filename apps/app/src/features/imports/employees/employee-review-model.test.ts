import {
  hiringTestRowIds as packageHiringTestRowIds,
  includedByDefault as packageIncludedByDefault,
  toEmployeePayload,
} from '@ssm-usor/import';
import { describe, expect, it } from 'vitest';

import {
  bakerId,
  employeeProposal,
  existingEmployeeId,
  sellerId,
  sheetRow,
  workplaces,
} from '@/test/employee-import-fixture';

import {
  type Changes,
  confirmSummary,
  decisionsOf,
  decisionSummary,
  emptyChanges,
  examinerValues,
  firstToCheck,
  handoversOf,
  heldWith,
  hiringTestRowIds,
  hubCounts,
  includedByDefault,
  includedOf,
  isWritten,
  leaving,
  nextToCheck,
  notesOf,
  pagesOf,
  peopleGroups,
  peopleViews,
  personIncluded,
  personName,
  type Proposal,
  reopened,
  resolveField,
  type ReviewContext,
  rowIncluded,
  rowValues,
  type SheetPage,
  type SheetRow,
  statesOf,
  testIncluded,
  trainingsByDomain,
  untestedDomains,
  withField,
  withMatchDeclined,
  withMatchRestored,
  withPersonChange,
  withPersonIncluded,
  withRow,
} from './employee-review-model';
import { withPage, withTitle, withWorkplace } from './review-changes';

const proposal = employeeProposal() as unknown as Proposal;

function contextOf(changes: Changes = emptyChanges(), workplaceCount = 2): ReviewContext {
  return {
    proposal,
    changes,
    states: statesOf(proposal, changes),
    workplaceCount,
    today: '2026-10-31',
  };
}

const person = (id: string) => proposal.people.find((each) => each.id === id)!;

function withRows(pageId: string, rows: ReturnType<typeof sheetRow>[]) {
  const changed = {
    ...proposal,
    pages: proposal.pages.map((page) =>
      page.id === pageId ? { ...page, rows: [...page.rows, ...rows] } : page
    ),
  } as unknown as Proposal;
  return (changes: Changes = emptyChanges()) => ({ ...contextOf(changes), proposal: changed });
}

const hiringTest = {
  test: 'hiring',
  takenOn: null,
  examinerName: 'Mureșan Ioana',
  examinerJobTitle: 'administrator',
  verified: true,
  inApp: false,
};

function withPerson(id: string, patch: (person: Record<string, unknown>) => object) {
  const changed = {
    ...proposal,
    people: proposal.people.map((each) =>
      each.id === id ? { ...each, ...patch(each as unknown as Record<string, unknown>) } : each
    ),
  } as unknown as Proposal;
  return {
    context: (changes: Changes = emptyChanges()) => ({ ...contextOf(changes), proposal: changed }),
    person: changed.people.find((each) => each.id === id)!,
  };
}

const annualTest = (overrides: Record<string, unknown> = {}, test: Record<string, unknown> = {}) =>
  sheetRow('annual', {
    domain: 'su',
    testOnly: true,
    heldOn: null,
    test: {
      test: 'annual',
      takenOn: null,
      examinerName: 'Barbu Ionuț',
      examinerJobTitle: 'inspector SSM',
      verified: true,
      inApp: false,
      ...test,
    },
    ...overrides,
  });
const row = (id: string) =>
  proposal.pages.flatMap((page) => page.rows).find((each) => each.id === id)!;
const tags = (context: ReviewContext, id: string) =>
  decisionsOf(
    context,
    context.proposal.people.find((each) => each.id === id)!
  ).map((decision) => decision.tag);

describe('resolving a field', () => {
  it('takes the one value the pages give', () => {
    expect(resolveField(contextOf(), person('pop'), 'hiredAt')).toMatchObject({
      value: '2023-05-02',
      choice: false,
      edited: false,
    });
  });

  it("keeps an existing employee's value by default and takes the sheet's when asked", () => {
    const address = resolveField(contextOf(), person('lazar'), 'homeAddress');
    expect(address).toMatchObject({ value: 'Str. Viitorului nr. 3, Sibiu', replaced: false });
    const replaced = withField(emptyChanges(), 'lazar', 'homeAddress', {
      option: 0,
      replace: true,
    });
    expect(resolveField(contextOf(replaced), person('lazar'), 'homeAddress')).toMatchObject({
      value: 'Str. Fabricii nr. 21, Sibiu',
      replaced: true,
    });
  });

  it('replaces nothing when the sheet writes the app’s address with more detail', () => {
    const detailed = {
      ...proposal,
      people: proposal.people.map((each) =>
        each.id === 'lazar'
          ? {
              ...each,
              fields: {
                ...each.fields,
                homeAddress: {
                  options: [
                    { value: 'Mun. Sibiu, jud. Sibiu, str. Viitorului, nr. 3', pageIds: ['p4'] },
                  ],
                  app: 'Str. Viitorului nr. 3, Sibiu',
                },
              },
            }
          : each
      ),
    } as Proposal;
    const changes = withField(emptyChanges(), 'lazar', 'homeAddress', {
      option: 0,
      replace: true,
    });
    const lazar = detailed.people.find((each) => each.id === 'lazar')!;

    expect(
      resolveField({ ...contextOf(changes), proposal: detailed }, lazar, 'homeAddress')
    ).toMatchObject({ value: 'Str. Viitorului nr. 3, Sibiu', replaced: false });
  });

  it('fills an empty field of an existing employee from the sheet', () => {
    expect(resolveField(contextOf(), person('lazar'), 'hiredAt').value).toBe('2019-04-03');
  });

  it('takes what the member wrote, even an empty value', () => {
    const cleared = withField(emptyChanges(), 'pop', 'hiredAt', { value: null });
    expect(resolveField(contextOf(cleared), person('pop'), 'hiredAt')).toMatchObject({
      value: null,
      edited: true,
    });
  });

  it("drops a value from a page given to someone else, and asks when one's pages disagree", () => {
    const moved = withPage(emptyChanges(), 'p3', 'toma');
    expect(resolveField(contextOf(moved), person('pop'), 'hiredAt').value).toBeNull();
    const twoDates = {
      ...proposal,
      people: proposal.people.map((each) =>
        each.id === 'pop'
          ? {
              ...each,
              fields: {
                ...each.fields,
                hiredAt: {
                  options: [
                    { value: '2023-05-02', pageIds: ['p3'] },
                    { value: '2023-05-20', pageIds: ['p3'] },
                  ],
                },
              },
            }
          : each
      ),
    } as Proposal;
    const context = { ...contextOf(), proposal: twoDates };
    const pop = twoDates.people.find((each) => each.id === 'pop')!;
    expect(resolveField(context, pop, 'hiredAt')).toMatchObject({ choice: true, value: null });
    expect(decisionsOf(context, pop).map((decision) => decision.key)).toContain('choice-hiredAt');
  });

  it('names a person whose pages disagree on the name by the one most pages give', () => {
    const twoNames = {
      ...proposal,
      people: proposal.people.map((each) =>
        each.id === 'pop'
          ? {
              ...each,
              fields: {
                ...each.fields,
                lastName: {
                  options: [
                    { value: 'Popa', pageIds: ['p3'] },
                    { value: 'Pora', pageIds: ['p3'] },
                  ],
                },
              },
            }
          : each
      ),
    } as Proposal;
    const context = { ...contextOf(), proposal: twoNames };
    const pop = twoNames.people.find((each) => each.id === 'pop')!;

    expect(resolveField(context, pop, 'lastName').choice).toBe(true);
    expect(personName(context, pop)).toMatch(/^Popa /);
  });
});

describe('what a person still needs', () => {
  it('asks for the post of a title the client lacks, the CNP and the workplace', () => {
    expect(tags(contextOf(), 'toma')).toEqual([
      'Post de hotărât',
      'CNP cu o cifră necitită',
      'Loc de muncă de ales',
    ]);
  });

  it('settles each once it is answered, for the whole title or text', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withPersonChange(changes, 'toma', (change) => ({ ...change, cnpCorrection: true }));
    changes = withWorkplace(changes, 'place-none', null);
    changes = withRow(changes, 'r5', () => ({ values: { trainerName: 'Barbu Ionuț' } }));
    expect(tags(contextOf(changes), 'toma')).toEqual([]);
  });

  it('never asks the workplace of a client with one', () => {
    expect(tags(contextOf(emptyChanges(), 1), 'toma')).not.toContain('Loc de muncă de ales');
  });

  it('asks a near title to be confirmed, not chosen', () => {
    const near = {
      ...proposal,
      jobTitles: proposal.jobTitles.map((group) =>
        group.id === 'title-helper' ? { ...group, match: 'near', proposedId: bakerId } : group
      ),
    } as Proposal;
    const decisions = decisionsOf({ ...contextOf(), proposal: near }, person('toma'));
    expect(decisions[0]).toMatchObject({ tag: 'Post de confirmat', tone: 'warning' });
  });

  it('wants the required data of someone new, and nothing of an existing employee', () => {
    const cleared = withField(emptyChanges(), 'pop', 'hiredAt', { value: null });
    expect(tags(contextOf(cleared), 'pop')).toEqual(['Lipsește data angajării']);
    expect(tags(contextOf(), 'lazar')).toEqual([]);
  });

  it('wants a valid CNP the member wrote, and none when left without', () => {
    const wrong = withField(emptyChanges(), 'pop', 'cnp', { value: '1900517320140' });
    expect(tags(contextOf(wrong), 'pop')).toEqual(['CNP de corectat']);
    const without = withField(emptyChanges(), 'toma', 'cnp', { value: null });
    expect(tags(contextOf(without), 'toma')).not.toContain('CNP cu o cifră necitită');
  });

  it('wants the date of an annual test it takes, which the member can write', () => {
    const context = withRows('p3', [annualTest()]);
    expect(tags(context(), 'pop')).toEqual(['Lipsește data unui test']);
    const dated = withRow(emptyChanges(), 'annual', () => ({ values: { heldOn: '2025-03-04' } }));
    expect(tags(context(dated), 'pop')).toEqual([]);
    const unticked = withRow(emptyChanges(), 'annual', () => ({ test: false }));
    expect(tags(context(unticked), 'pop')).toEqual([]);
  });

  it('names the annual test whose examiner is missing', () => {
    const context = withRows('p3', [annualTest({ heldOn: '2025-03-04' }, { examinerName: null })]);
    expect(decisionsOf(context(), person('pop')).map((decision) => decision.label)).toEqual([
      'Completează examinatorul testului anual SU',
    ]);
  });

  it('refuses a CNP or employee number another person of the import has', () => {
    let changes = withField(emptyChanges(), 'pop', 'employeeNumber', { value: 'M-12' });
    changes = withField(changes, 'toma', 'employeeNumber', { value: 'm 12' });
    expect(decisionsOf(contextOf(changes), person('pop'))).toContainEqual(
      expect.objectContaining({
        label: 'Numărul de marcă apare și la Toma Andrei',
        anchor: 'employment',
      })
    );
    const aside = withPersonChange(changes, 'toma', (change) => ({
      ...change,
      state: 'set_aside',
    }));
    expect(tags(contextOf(aside), 'pop')).toEqual([]);

    const sameCnp = withField(
      withPersonChange(emptyChanges(), 'toma', () => ({ cnpCorrection: true })),
      'pop',
      'cnp',
      { value: '1900517320141' }
    );
    expect(tags(contextOf(sameCnp), 'pop')).toContain('CNP-ul apare la două persoane');
  });

  it('wants a job title of two characters and durations of 1 to 600 minutes', () => {
    const short = withField(emptyChanges(), 'pop', 'jobTitle', { value: 'V' });
    expect(decisionsOf(contextOf(short), person('pop'))).toContainEqual(
      expect.objectContaining({
        tag: 'Funcția de corectat',
        label: 'Corectează funcția: are cel puțin 2 caractere',
      })
    );
    const long = withRow(emptyChanges(), 'r3', () => ({ values: { durationMinutes: 720 } }));
    expect(tags(contextOf(long), 'pop')).toEqual(['O instruire cu durata de corectat']);
    const commute = withField(emptyChanges(), 'pop', 'commuteMinutes', { value: 0 });
    expect(tags(contextOf(commute), 'pop')).toEqual(['Durata drumului de corectat']);
  });

  it("points an existing employee's birth date that disagrees with the CNP to the comparison", () => {
    const changes = withField(
      withField(emptyChanges(), 'lazar', 'cnp', { value: '1900517320141' }),
      'lazar',
      'birthDate',
      { value: '1990-05-18' }
    );
    expect(decisionsOf(contextOf(changes), person('lazar'))).toEqual([
      expect.objectContaining({ key: 'birthDate', anchor: 'existing' }),
    ]);
  });

  it('signals an unusual duration without asking anything', () => {
    expect(notesOf(contextOf(), person('pop')).map((note) => note.tag)).toEqual([
      'Durată neobișnuită la o instruire',
    ]);
    expect(tags(contextOf(), 'pop')).toEqual([]);
  });

  it('signals a page put by the post it writes and one put after the page before it', () => {
    const placed = {
      ...proposal,
      pages: proposal.pages.map((page) =>
        page.id === 'p1'
          ? { ...page, placement: 'placed_by_order' }
          : page.id === 'p2'
            ? { ...page, placement: 'placed_by_job_title' }
            : page
      ),
    } as unknown as Proposal;
    const context = { ...contextOf(), proposal: placed };

    expect(notesOf(context, person('toma')).map((note) => note.tag)).toEqual(
      expect.arrayContaining(['O pagină pusă după funcție', 'O pagină pusă după ordine'])
    );
    expect(tags(context, 'toma')).toEqual(tags(contextOf(), 'toma'));
  });

  it('notes a handover written on the person’s pages, each day once, and follows a moved page', () => {
    const handover = { date: '2022-10-03', text: '03.10.22 Preluare CD Safety Core SRL' };
    const noted = {
      ...proposal,
      pages: proposal.pages.map((page) =>
        page.id === 'p1' || page.id === 'p2'
          ? { ...page, handovers: [handover, { date: null, text: 'Preluare' }] }
          : page
      ),
    } as unknown as Proposal;
    const context = { ...contextOf(), proposal: noted };

    expect(handoversOf(context, person('toma'))).toEqual({
      dates: ['2022-10-03'],
      undated: ['Preluare'],
    });
    expect(notesOf(context, person('toma')).map((note) => note.tag)).toEqual(
      expect.arrayContaining([
        'Preluare consemnată pe fișă: 03.10.2022',
        'Preluare consemnată pe fișă',
      ])
    );
    expect(tags(context, 'toma')).toEqual(tags(contextOf(), 'toma'));

    const moved = withPage(withPage(emptyChanges(), 'p1', 'pop'), 'p2', 'pop');
    expect(handoversOf({ ...context, changes: moved }, person('toma'))).toEqual({
      dates: [],
      undated: [],
    });
    expect(handoversOf({ ...context, changes: moved }, person('pop')).dates).toEqual([
      '2022-10-03',
    ]);
  });

  it('shows a handover without a past day by its text, cut short when long', () => {
    const long = `Preluat de Alfa Prevent SRL ${'conform contractului '.repeat(12)}`;
    const noted = {
      ...proposal,
      pages: proposal.pages.map((page) =>
        page.id === 'p1'
          ? {
              ...page,
              handovers: [
                { date: null, text: '  Preluare   Alfa Prevent SRL ' },
                { date: null, text: 'Preluare Alfa Prevent SRL' },
                { date: null, text: long },
              ],
            }
          : page
      ),
    } as unknown as Proposal;
    const { dates, undated } = handoversOf({ ...contextOf(), proposal: noted }, person('toma'));

    expect(dates).toEqual([]);
    expect(undated[0]).toBe('Preluare Alfa Prevent SRL');
    expect(undated).toHaveLength(2);
    expect(undated[1]!.length).toBe(160);
    expect(undated[1]!.endsWith('…')).toBe(true);
    expect(
      notesOf({ ...contextOf(), proposal: noted }, person('toma')).map((note) => note.tag)
    ).toContain('Preluare consemnată pe fișă');
  });
});

describe('rows and tests', () => {
  it('leaves out a row already in the app unless ticked, and keeps a verified test', () => {
    expect(rowIncluded(emptyChanges(), row('r4'), true)).toBe(false);
    expect(
      rowIncluded(
        withRow(emptyChanges(), 'r4', () => ({ included: true })),
        row('r4'),
        true
      )
    ).toBe(true);
    expect(testIncluded(emptyChanges(), row('r1'), false)).toBe(true);
    expect(
      testIncluded(
        withRow(emptyChanges(), 'r1', () => ({ test: false })),
        row('r1'),
        false
      )
    ).toBe(false);
  });

  it('counts the others a training is held with when everything matches', () => {
    const context = contextOf();
    expect(heldWith(context, 'toma', row('r2'))).toBe(0);
    expect(heldWith(context, 'lazar', row('r6'))).toBe(0);
    const sameDay = withRow(emptyChanges(), 'r5', () => ({
      values: { trainerName: 'Barbu Ionuț' },
    }));
    expect(heldWith(contextOf(sameDay), 'lazar', row('r6'))).toBe(1);
  });

  it('keeps apart rows whose trainer’s function or verifier differ', () => {
    const sameDay = withRow(emptyChanges(), 'r5', () => ({
      values: { trainerName: 'Barbu Ionuț', trainerJobTitle: 'Administrator' },
    }));
    expect(heldWith(contextOf(sameDay), 'lazar', row('r6'))).toBe(0);
    const verified = withRow(emptyChanges(), 'r5', () => ({
      values: {
        trainerName: 'Barbu Ionuț',
        verifierName: 'Dan Marin',
        verifierJobTitle: 'Inspector SSM',
      },
    }));
    expect(heldWith(contextOf(verified), 'lazar', row('r6'))).toBe(0);
  });
});

describe('the people list', () => {
  const groupsOf = (context: ReviewContext) =>
    peopleGroups(peopleViews(context)).map((group) => [
      group.title,
      group.views.map((view) => view.person.id),
    ]);

  it('splits those still to check into what has a decision and what is unopened', () => {
    expect(groupsOf(contextOf())).toEqual([
      ['Cu ceva de hotărât', ['toma']],
      ['Încă nedeschise', ['pop', 'lazar']],
    ]);
  });

  it('keeps apart those who wait only on what is decided once for everyone above', () => {
    const ownAnswered = withRow(
      withPersonChange(emptyChanges(), 'toma', () => ({ cnpCorrection: true })),
      'r5',
      () => ({ values: { trainerName: 'Barbu Ionuț' } })
    );
    expect(groupsOf(contextOf(ownAnswered))[0]).toEqual([
      'Așteaptă doar postul sau locul de muncă',
      ['toma'],
    ]);
    expect(groupsOf(contextOf(ownAnswered, 1))[0]).toEqual(['Așteaptă doar postul', ['toma']]);
    expect(groupsOf(contextOf(withTitle(ownAnswered, 'title-helper', bakerId)))[0]).toEqual([
      'Așteaptă doar locul de muncă',
      ['toma'],
    ]);
  });

  it('ends with those checked and those set aside', () => {
    const changes = withPersonChange(
      withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' })),
      'lazar',
      () => ({ state: 'set_aside' })
    );
    expect(groupsOf(contextOf(changes))).toEqual([
      ['Cu ceva de hotărât', ['toma']],
      ['Verificați', ['pop']],
      ['Lăsați deoparte', ['lazar']],
    ]);
  });

  it('sums up what a person decides on their own pages, not the post decided above', () => {
    const toma = peopleViews(contextOf()).find((view) => view.person.id === 'toma')!;
    expect(toma.decisions.map((decision) => decision.key)).toContain('post');
    expect(decisionSummary(toma)).toEqual({ count: 1, text: 'CNP cu o cifră necitită' });
  });

  it('names the values that differ between sheets on one line, each counted', () => {
    const differing = (pageIds: string[]) => ({
      options: [
        { value: 'Str. Fabricii nr. 21, Sibiu', pageIds: [pageIds[0]] },
        { value: 'Str. Morii nr. 4, Cisnădie', pageIds: [pageIds[1]] },
      ],
    });
    const twoTitles = {
      options: [
        { value: 'Vânzător', pageIds: ['p3'] },
        { value: 'Casier', pageIds: ['p5'] },
      ],
    };
    const changed = {
      ...proposal,
      people: proposal.people.map((each) =>
        each.id === 'pop'
          ? {
              ...each,
              fields: {
                ...each.fields,
                homeAddress: differing(['p3', 'p5']),
                rhFactor: {
                  options: [
                    { value: '+', pageIds: ['p3'] },
                    { value: '-', pageIds: ['p5'] },
                  ],
                },
                jobTitle: twoTitles,
              },
            }
          : each
      ),
    } as unknown as Proposal;
    const context = { ...contextOf(withPage(emptyChanges(), 'p5', 'pop')), proposal: changed };
    const pop = peopleViews(context).find((view) => view.person.id === 'pop')!;
    expect(decisionSummary(pop)).toEqual({
      count: 3,
      text: 'Domiciliul, Rh-ul și funcția diferă între fișe',
    });
  });

  it('sets aside a leaver not taken, out of what is left to check, until switched on', () => {
    const left = withField(emptyChanges(), 'pop', 'leftOn', { value: '2026-09-30' });
    const context = contextOf(left);
    const views = peopleViews(context);
    expect(groupsOf(context)).toEqual([
      ['Cu ceva de hotărât', ['toma']],
      ['Încă nedeschise', ['lazar']],
      ['Lăsați deoparte', ['pop']],
    ]);
    expect(hubCounts(context, views).people).toEqual({
      total: 3,
      toCheck: 2,
      checked: 0,
      setAside: 1,
      deciding: 1,
      included: 2,
    });
    expect(firstToCheck(views.filter((view) => view.person.id !== 'toma'))?.person.id).toBe(
      'lazar'
    );

    const taken = contextOf(withPersonIncluded(context, person('pop'), true));
    expect(groupsOf(taken)).toEqual([
      ['Cu ceva de hotărât', ['toma']],
      ['Încă nedeschise', ['pop', 'lazar']],
    ]);
  });

  it('counts what each section of the hub still waits on', () => {
    const context = contextOf();
    expect(hubCounts(context, peopleViews(context))).toEqual({
      posts: { decide: 1, confirm: 0 },
      workplaces: { decide: 1, confirm: 0 },
      people: { total: 3, toCheck: 3, checked: 0, setAside: 0, deciding: 1, included: 3 },
      photos: { total: 1, toAssign: 1 },
    });
    const decided = withPage(
      withWorkplace(withTitle(emptyChanges(), 'title-helper', bakerId), 'place-none', null),
      'p5',
      null
    );
    const after = contextOf(
      withPersonChange(decided, 'pop', () => ({ state: 'set_aside' })),
      1
    );
    expect(hubCounts(after, peopleViews(after))).toMatchObject({
      posts: { decide: 0, confirm: 0 },
      workplaces: { decide: 0, confirm: 0 },
      people: { setAside: 1, included: 2 },
      photos: { total: 1, toAssign: 0 },
    });
  });

  it('checks a person with nothing to decide on moving on, and no one else', () => {
    const context = contextOf();
    expect(leaving(context, person('pop')).people.pop?.state).toBe('checked');
    expect(leaving(context, person('toma'))).toBe(context.changes);
    const aside = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'set_aside' }));
    expect(leaving(contextOf(aside), person('pop')).people.pop?.state).toBe('set_aside');
  });

  it('puts a checked person back to check when an edit or a page leaves something to decide', () => {
    const checked = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' }));
    const fixed = { proposal, workplaceCount: 2, today: '2026-10-31' };
    expect(reopened({ ...fixed, changes: checked })).toBe(checked);

    const cleared = withField(checked, 'pop', 'firstName', { value: null });
    expect(reopened({ ...fixed, changes: cleared }).people.pop?.state).toBeUndefined();

    const unticked = withRow(checked, 'r3', () => ({
      included: true,
      values: { heldOn: null },
    }));
    expect(reopened({ ...fixed, changes: unticked }).people.pop?.state).toBeUndefined();

    const undatedElsewhere = withRow(checked, 'r5', () => ({ values: { heldOn: null } }));
    expect(reopened({ ...fixed, changes: undatedElsewhere }).people.pop?.state).toBe('checked');
    const given = withPage(undatedElsewhere, 'p2', 'pop');
    expect(reopened({ ...fixed, changes: given }).people.pop?.state).toBeUndefined();

    const aside = withField(
      withPersonChange(emptyChanges(), 'pop', () => ({ state: 'set_aside' })),
      'pop',
      'firstName',
      { value: null }
    );
    expect(reopened({ ...fixed, changes: aside }).people.pop?.state).toBe('set_aside');
  });

  it('continues with the next person to check, from the start when none follows', () => {
    const checked = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' }));
    expect(nextToCheck(contextOf(checked))?.id).toBe('toma');
    expect(nextToCheck(contextOf(checked), 'toma')?.id).toBe('lazar');
    expect(nextToCheck(contextOf(checked), 'lazar')?.id).toBe('toma');
  });
});

describe('the confirm summary', () => {
  it('writes the checked people only, with their trainings, tests and photographs', () => {
    let changes = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'checked' }));
    changes = withPersonChange(changes, 'lazar', () => ({ state: 'checked' }));
    const summary = confirmSummary(contextOf(changes));
    expect(summary.created.map((each) => each.id)).toEqual(['pop']);
    expect(summary.completed.map((each) => each.id)).toEqual(['lazar']);
    expect(summary.toCheck.map((each) => each.id)).toEqual(['toma']);
    expect(summary).toMatchObject({ rows: 2, trainingsHeld: 2, files: 2, filesLeft: 3 });
    expect(summary.noContact.map((each) => each.id)).toEqual(['pop']);
    expect(summary.unusual.map(({ person }) => person.id)).toEqual(['pop']);
  });

  it('makes rows of several people that match in everything one training held', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', sellerId);
    for (const id of ['toma', 'lazar'])
      changes = withPersonChange(changes, id, () => ({ state: 'checked' }));
    changes = withRow(changes, 'r5', () => ({ values: { trainerName: 'Barbu Ionuț' } }));
    const summary = confirmSummary(contextOf(changes));
    expect(summary.rows).toBe(4);
    expect(summary.trainingsHeld).toBe(3);
    expect(summary.tests).toEqual({ ssm: 1, su: 0 });
  });
});

describe('hiring tests left unverified', () => {
  it('counts a paper introductory training without a ticked test', () => {
    expect(untestedDomains(contextOf(), person('toma'))).toEqual([]);
    const unticked = withRow(emptyChanges(), 'r1', () => ({ test: false }));
    expect(untestedDomains(contextOf(unticked), person('toma'))).toEqual(['ssm']);
  });

  it('counts nothing when the app already has the pass', () => {
    const context = withRows('p4', [
      sheetRow('lazar-hiring', {
        phase: 'introductory_general',
        heldOn: '2019-04-03',
        test: { ...hiringTest, verified: false, inApp: true },
      }),
    ]);
    const hiring = context().proposal.pages[3]!.rows.at(-1)!;
    expect(testIncluded(emptyChanges(), hiring, true)).toBe(false);
    expect(untestedDomains(context(), person('lazar'))).toEqual([]);
  });

  it("reads SU's workplace training, not its periodic one, and SSM's introductory only", () => {
    const context = withRows('p3', [
      sheetRow('su-workplace', { domain: 'su', phase: 'workplace', heldOn: '2023-05-02' }),
      sheetRow('ssm-workplace', { phase: 'workplace', heldOn: '2023-05-02' }),
    ]);
    expect(untestedDomains(context(), person('pop'))).toEqual(['su']);
    const periodicOnly = withRows('p3', [sheetRow('su-periodic', { domain: 'su' })]);
    expect(untestedDomains(periodicOnly(), person('pop'))).toEqual([]);
  });

  it('takes a ticked annual pass as the pass, and counts no one who left', () => {
    const context = withRows('p3', [
      sheetRow('su-workplace', { domain: 'su', phase: 'workplace', heldOn: '2023-05-02' }),
      annualTest({ heldOn: '2024-05-02' }),
    ]);
    expect(untestedDomains(context(), person('pop'))).toEqual([]);
    const leaver = withRows('p3', [
      sheetRow('su-workplace', { domain: 'su', phase: 'workplace', heldOn: '2023-05-02' }),
    ]);
    const left = withField(emptyChanges(), 'pop', 'leftOn', { value: '2024-01-31' });
    expect(untestedDomains(leaver(left), person('pop'))).toEqual([]);
  });

  it('lists each person and domain left so in the summary', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', sellerId);
    changes = withPersonChange(changes, 'toma', () => ({ state: 'checked' }));
    changes = withRow(changes, 'r1', () => ({ test: false }));
    expect(
      confirmSummary(contextOf(changes)).untested.map(({ person, domain }) => [person.id, domain])
    ).toEqual([['toma', 'ssm']]);
  });
});

describe('the hiring test confirming writes', () => {
  const twoIntroductions = withRows('p2', [
    sheetRow('older', {
      phase: 'introductory_general',
      heldOn: '2023-01-10',
      test: { ...hiringTest, examinerName: null },
    }),
  ]);

  it('is the newest row of the phase, as the import picks it', () => {
    const rows = twoIntroductions().proposal.pages.flatMap((page) => page.rows);
    expect(hiringTestRowIds(rows)).toEqual(new Set(['r1']));
    expect(hiringTestRowIds(rows)).toEqual(packageHiringTestRowIds(rows as never));
    const su = [
      sheetRow('a', { domain: 'su', phase: 'introductory_general', test: hiringTest }),
      sheetRow('b', { domain: 'su', phase: 'workplace', heldOn: '2020-01-01', test: hiringTest }),
      sheetRow('c', { domain: 'su', phase: 'workplace', heldOn: null, test: hiringTest }),
    ] as unknown as Parameters<typeof hiringTestRowIds>[0];
    expect(hiringTestRowIds(su)).toEqual(new Set(['b']));
    expect(hiringTestRowIds(su)).toEqual(packageHiringTestRowIds(su as never));
  });

  it('asks nothing of the other rows, and counts one test', () => {
    const context = twoIntroductions(
      withPersonChange(withTitle(emptyChanges(), 'title-helper', sellerId), 'toma', () => ({
        state: 'checked',
      }))
    );
    expect(tags(context, 'toma')).not.toContain('Lipsește examinatorul unui test');
    expect(confirmSummary(context).tests).toEqual({ ssm: 1, su: 0 });
  });

  it('follows the dates as the member left them', () => {
    const moved = withRow(emptyChanges(), 'older', () => ({ values: { heldOn: '2024-09-01' } }));
    const context = twoIntroductions(moved);
    expect(decisionsOf(context, person('toma')).map((decision) => decision.label)).toContain(
      'Completează examinatorul testului la angajare'
    );
  });

  it('asks for the date once, on the row, while the row is taken', () => {
    const undated = withRow(emptyChanges(), 'r1', () => ({ values: { heldOn: null } }));
    const labels = decisionsOf(contextOf(undated), person('toma')).map(
      (decision) => decision.label
    );
    expect(labels).toContain('Completează data instruirii introductiv-generale');
    expect(labels).not.toContain('Completează data testului la angajare');
    const future = withRow(emptyChanges(), 'r1', () => ({ values: { heldOn: '2026-11-02' } }));
    expect(tags(contextOf(future), 'toma')).toContain('O instruire cu data în viitor');
    expect(tags(contextOf(future), 'toma')).not.toContain('Un test cu data în viitor');
  });

  it('wants the test date itself when only the test is taken', () => {
    const untaken = (heldOn: string | null) =>
      withRow(emptyChanges(), 'r1', () => ({ included: false, values: { heldOn } }));
    expect(tags(contextOf(untaken(null)), 'toma')).toEqual(
      expect.arrayContaining(['Lipsește data unui test'])
    );
    expect(tags(contextOf(untaken('2026-11-02')), 'toma')).toContain('Un test cu data în viitor');
  });

  it('names a row without a date by its phase', () => {
    const undated = withRow(emptyChanges(), 'r1', () => ({ values: { heldOn: null } }));
    expect(decisionsOf(contextOf(undated), person('toma')).map((each) => each.label)).toContain(
      'Completează data instruirii introductiv-generale'
    );
  });

  it('asks nothing of a row whose sheet writes no trainer, material or duration', () => {
    const asWritten = withRow(emptyChanges(), 'r2', () => ({
      values: { trainerName: null, trainerJobTitle: null, material: null, durationMinutes: null },
    }));
    expect(
      decisionsOf(contextOf(asWritten), person('toma')).filter((each) => each.key === 'row-r2')
    ).toEqual([]);
  });

  it('asks nothing of a hiring test whose sheet names no examiner, and the function of one named', () => {
    const unnamed = withRow(emptyChanges(), 'r1', () => ({
      values: { examinerName: null, examinerJobTitle: null },
    }));
    expect(tags(contextOf(unnamed), 'toma')).not.toContain('Lipsește examinatorul unui test');
    const halfNamed = withRow(emptyChanges(), 'r1', () => ({
      values: { examinerJobTitle: null },
    }));
    expect(tags(contextOf(halfNamed), 'toma')).toContain('Lipsește examinatorul unui test');
  });
});

describe('who is created', () => {
  it('leaves out someone new with a leave date, unless ticked, and completes an existing one', () => {
    const left = withField(emptyChanges(), 'pop', 'leftOn', { value: '2024-01-31' });
    expect(includedOf(contextOf(left), person('pop'))).toBe(false);
    const ticked = withPersonChange(left, 'pop', (change) => ({ ...change, included: true }));
    expect(includedOf(contextOf(ticked), person('pop'))).toBe(true);
    const leftLazar = withField(emptyChanges(), 'lazar', 'leftOn', { value: '2024-01-31' });
    expect(includedOf(contextOf(leftLazar), person('lazar'))).toBe(true);
    for (const [leftOn, existing] of [
      [null, false],
      ['2024-01-31', false],
      ['2024-01-31', true],
    ] as const) {
      expect(includedByDefault(leftOn, existing)).toBe(packageIncludedByDefault(leftOn, existing));
    }
  });
});

describe('the employee a person completes', () => {
  const nameOnly = withPerson('lazar', () => ({
    existing: { employeeId: existingEmployeeId, matchedBy: 'name_only' },
  }));

  it('asks whether a name-only match is the same employee', () => {
    expect(tags(nameOnly.context(), 'lazar')).toEqual(['Lucrător de confirmat']);
    const confirmed = withPersonChange(emptyChanges(), 'lazar', () => ({ existing: true }));
    expect(tags(nameOnly.context(confirmed), 'lazar')).toEqual([]);
  });

  it('makes a declined match someone new, who needs a post and keeps no app value', () => {
    const declined = withMatchDeclined(contextOf(), person('lazar'), false);
    const context = contextOf(declined);
    expect(declined.people.lazar).toEqual({ existing: false });
    expect(tags(context, 'lazar')).toEqual(['Post de hotărât']);
    expect(resolveField(context, person('lazar'), 'homeAddress').value).toBe(
      'Str. Fabricii nr. 21, Sibiu'
    );
    expect(rowIncluded(declined, row('r4'), false)).toBe(true);
    const placed = withPersonChange(declined, 'lazar', (change) => ({
      ...change,
      jobPositionId: bakerId,
    }));
    expect(tags(contextOf(placed), 'lazar')).toEqual([]);
    expect(withMatchRestored(declined, person('lazar')).people.lazar).toBeUndefined();
  });

  it("wants a declined match's CNP and employee number other than the employee's", () => {
    const numbered = withPerson('lazar', (each) => ({
      fields: {
        ...(each.fields as object),
        employeeNumber: { options: [{ value: 'M-7', pageIds: ['p4'] }], app: 'M 7' },
      },
    }));
    const declined = withPersonChange(emptyChanges(), 'lazar', () => ({
      existing: false,
      jobPositionId: bakerId,
    }));
    expect(tags(numbered.context(declined), 'lazar')).toEqual([
      'Numărul de marcă e deja în aplicație',
    ]);
  });

  it('names a former employee and asks how to take a rehire', () => {
    const rehired = withPerson('lazar', (each) => ({
      flags: [{ code: 'former_employee', detail: '2020-01-31' }, { code: 'rehire' }],
      fields: {
        ...(each.fields as object),
        hiredAt: { options: [{ value: '2021-06-01', pageIds: ['p4'] }], app: '2015-03-02' },
        employeeNumber: { options: [{ value: 'M 7', pageIds: ['p4'] }], app: 'M 7' },
      },
    }));
    const context = rehired.context();
    expect(notesOf(context, rehired.person).map((note) => note.tag)).toContain(
      'A plecat din firmă la 31.01.2020'
    );
    expect(tags(context, 'lazar')).toEqual(['Reangajat după plecare']);

    const corrected = withField(emptyChanges(), 'lazar', 'hiredAt', { value: '2015-03-02' });
    expect(tags(rehired.context(corrected), 'lazar')).toEqual([]);

    const asNew = withMatchDeclined(context, rehired.person, true);
    expect(asNew.people.lazar).toEqual({
      existing: false,
      fields: { employeeNumber: { value: null } },
    });
    expect(tags(rehired.context(asNew), 'lazar')).toEqual(['Post de hotărât']);

    const aside = withPersonChange(emptyChanges(), 'lazar', () => ({ state: 'set_aside' }));
    expect(tags(rehired.context(aside), 'lazar')).toEqual([]);
    const view = peopleViews(rehired.context(aside)).find((each) => each.person.id === 'lazar');
    expect(view?.decisions).toEqual([]);
  });

  it('completes an employee once: two people proposed as one are both asked', () => {
    const twice = withPerson('pop', () => ({
      existing: { employeeId: existingEmployeeId, matchedBy: 'cnp' },
    }));
    expect(tags(twice.context(), 'pop')).toContain('Același lucrător la două persoane');
    expect(tags(twice.context(), 'lazar')).toContain('Același lucrător la două persoane');
    const aside = withPersonChange(emptyChanges(), 'pop', () => ({ state: 'set_aside' }));
    expect(tags(twice.context(aside), 'lazar')).not.toContain('Același lucrător la două persoane');
  });
});

describe('the switches and what confirming writes', () => {
  const extended = withRows('p3', [
    sheetRow('r10', { heldOn: '2025-08-11', flags: ['unsigned'], proposedIncluded: false }),
    sheetRow('r11', {
      heldOn: '2025-03-04',
      testOnly: true,
      flags: ['unsigned'],
      proposedIncluded: false,
      test: {
        test: 'annual',
        takenOn: '2025-03-04',
        examinerName: 'Barbu Ionuț',
        examinerJobTitle: 'inspector SSM',
        verified: true,
        inApp: false,
      },
    }),
  ]);

  function decided(changes: Changes) {
    const context = extended(changes);
    const { payload } = toEmployeePayload({
      proposal: context.proposal as never,
      changes: context.changes as never,
      records: {
        jobPositions: [{ id: bakerId }, { id: sellerId }],
        workplaces,
        employees: [],
      },
      today: '2026-10-31',
    });
    return { context, payload };
  }

  const checked = (changes: Changes, id: string) =>
    withPersonChange(changes, id, (change) => ({ ...change, state: 'checked' }));

  it('writes a person exactly when the switch beside the name is on and they are checked', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withWorkplace(changes, 'place-none', null);
    changes = withField(changes, 'pop', 'leftOn', { value: '2025-06-30' });
    changes = checked(checked(changes, 'toma'), 'pop');
    for (const takePop of [false, true]) {
      const switched = withPersonIncluded(extended(changes), person('pop'), takePop);
      if (takePop) {
        expect(switched.people.pop?.state).toBeUndefined();
        expect(decided(switched).payload.employees.map((each) => each.key)).not.toContain('pop');
      }
      const { context, payload } = decided(takePop ? checked(switched, 'pop') : switched);
      const written = new Set(payload.employees.map((employee) => employee.key));
      expect(written.has('toma')).toBe(true);
      expect(written.has('pop')).toBe(takePop);
      for (const each of context.proposal.people) {
        expect(written.has(each.id)).toBe(isWritten(context, each));
        expect(context.states[each.id] === 'checked').toBe(written.has(each.id));
      }
    }
  });

  it('sets aside a checked person once a leave date takes them out', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withWorkplace(changes, 'place-none', null);
    changes = checked(checked(changes, 'toma'), 'pop');
    expect(decided(changes).payload.employees.map((each) => each.key)).toContain('pop');
    const dated = withField(changes, 'pop', 'leftOn', { value: '2025-06-30' });
    expect(statesOf(proposal, dated).pop).toBe('set_aside');
    const saved = reopened({ ...contextOf(dated), changes: dated });
    expect(saved.people.pop?.state).toBe('set_aside');
    const { context, payload } = decided(saved);
    expect(payload.employees.map((each) => each.key)).not.toContain('pop');
    expect(isWritten(context, person('pop'))).toBe(false);
  });

  it('reads old saved changes, a checked leaver not taken, as set aside, and saves them so', () => {
    const old = withPersonChange(
      withField(emptyChanges(), 'pop', 'leftOn', { value: '2025-06-30' }),
      'pop',
      (change) => ({ ...change, state: 'checked', included: false })
    );
    expect(statesOf(proposal, old).pop).toBe('set_aside');
    expect(reopened({ ...contextOf(old), changes: old }).people.pop?.state).toBe('set_aside');
    const back = withPersonIncluded(contextOf(old), person('pop'), true);
    expect(back.people.pop?.state).toBeUndefined();
    expect(back.people.pop?.included).toBe(true);
  });

  it('keeps an existing worker with a leave date in, and writes them once checked', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withWorkplace(changes, 'place-none', null);
    changes = withField(changes, 'lazar', 'leftOn', { value: '2025-06-30' });
    changes = checked(changes, 'lazar');
    const context = extended(changes);
    expect(personIncluded(context, person('lazar'))).toBe(true);
    const { payload } = toEmployeePayload({
      proposal: context.proposal as never,
      changes: context.changes as never,
      records: {
        jobPositions: [{ id: bakerId }, { id: sellerId }],
        workplaces,
        employees: [
          {
            id: existingEmployeeId,
            lastName: 'Lazăr',
            firstName: 'Radu',
            cnp: null,
            employeeNumber: null,
            birthDate: null,
            birthPlace: null,
            homeAddress: 'Str. Viitorului nr. 3, Sibiu',
            education: null,
            qualification: null,
            bloodGroup: null,
            rhFactor: null,
            jobTitle: 'Brutar',
            hiredAt: '2019-04-03',
            terminatedAt: null,
            workplaceId: null,
            commuteRoute: null,
            commuteMinutes: null,
            hasContact: false,
            trainings: [],
            testResults: [],
          },
        ],
      },
      today: '2026-10-31',
    });
    expect(payload.employees.map((each) => each.key)).toEqual(['lazar']);
    expect(isWritten(context, person('lazar'))).toBe(true);
    expect(context.states.lazar).toBe('checked');
  });

  it('sets aside a leaver not taken once the member moves on, so the list says the same', () => {
    const left = withField(emptyChanges(), 'pop', 'leftOn', { value: '2025-06-30' });
    expect(personIncluded(contextOf(left), person('pop'))).toBe(false);
    expect(leaving(contextOf(left), person('pop')).people.pop?.state).toBe('set_aside');
    const taken = withPersonIncluded(contextOf(left), person('pop'), true);
    expect(taken.people.pop).toEqual({ fields: left.people.pop?.fields, included: true });
    expect(leaving(contextOf(taken), person('pop')).people.pop?.state).not.toBe('set_aside');
  });

  it('writes the trainings and tests whose switches are on', () => {
    let changes = withTitle(emptyChanges(), 'title-helper', bakerId);
    changes = withWorkplace(changes, 'place-none', null);
    changes = checked(checked(changes, 'toma'), 'pop');
    changes = withRow(changes, 'r5', (change) => ({ ...change, included: false }));
    changes = withRow(changes, 'r1', (change) => ({ ...change, test: false }));
    changes = withRow(changes, 'r10', (change) => ({ ...change, included: true }));
    changes = withRow(changes, 'r11', (change) => ({ ...change, test: true }));
    const { context, payload } = decided(changes);
    expect(payload.trainings.length).toBeGreaterThan(0);
    expect(payload.test_results.filter((result) => result.test === 'annual')).toHaveLength(1);
    for (const id of ['toma', 'pop']) {
      const domains = trainingsByDomain(context, id);
      const matched = false;
      const rows = domains
        .flatMap((domain) => [...domain.hiring.rows, ...domain.periodic])
        .filter(({ row: each }) => rowIncluded(context.changes, each, matched));
      const tests = domains.flatMap((domain) => [
        ...(domain.hiring.test ? [domain.hiring.test] : []),
        ...domain.annualTests,
      ]);
      expect(
        payload.trainings.flatMap((training) =>
          training.records.filter((record) => record.employee_key === id)
        )
      ).toHaveLength(rows.length);
      expect(payload.test_results.filter((result) => result.employee_key === id)).toHaveLength(
        tests.filter(({ row: each }) => testIncluded(context.changes, each, matched)).length
      );
    }
  });

  it('shows a periodic row that records the annual test with the training and the test apart', () => {
    const both = {
      testOnly: false,
      phase: 'periodic',
      heldOn: '2025-06-10',
      durationMinutes: 120,
      material: 'IPSU art. 97–187; prezentarea riscurilor; Testare',
    };
    const context = withRows('p3', [annualTest(both)]);
    const su = () => trainingsByDomain(context(), 'pop').find((each) => each.domain === 'su')!;
    expect(su().periodic.map(({ row: each }) => each.id)).toEqual(['annual']);
    expect(su().annualTests.map(({ row: each }) => each.id)).toEqual(['annual']);
    expect(su().hiring.test).toBeNull();

    const inApp = withRows('p4', [annualTest({ ...both, flags: ['in_app'] })]);
    const hidden = trainingsByDomain(inApp(), 'lazar').find((each) => each.domain === 'su')!;
    expect(hidden.periodic).toEqual([]);
    expect(hidden.annualTests.map(({ row: each }) => each.id)).toEqual(['annual']);
  });

  it('writes the training and the annual test of one row by their own switches', () => {
    let base = withTitle(emptyChanges(), 'title-helper', bakerId);
    base = withWorkplace(base, 'place-none', null);
    base = checked(base, 'pop');
    const context = withRows('p3', [
      annualTest({
        testOnly: false,
        phase: 'periodic',
        heldOn: '2025-06-10',
        durationMinutes: 120,
        material: 'IPSU art. 97–187; prezentarea riscurilor; Testare',
      }),
    ]);
    for (const [change, training, test] of [
      [{}, true, true],
      [{ test: false }, true, false],
      [{ included: false }, false, true],
    ] as const) {
      const changes = withRow(base, 'annual', () => change);
      const { payload } = toEmployeePayload({
        proposal: context(changes).proposal as never,
        changes: changes as never,
        records: { jobPositions: [{ id: bakerId }, { id: sellerId }], workplaces, employees: [] },
        today: '2026-10-31',
      });
      const row = context(changes)
        .proposal.pages.flatMap((page) => page.rows)
        .find((each) => each.id === 'annual')!;
      expect(rowIncluded(changes, row, false)).toBe(training);
      expect(testIncluded(changes, row, false)).toBe(test);
      expect(payload.trainings.some((each) => each.domain === 'su')).toBe(training);
      expect(payload.test_results.some((each) => each.test === 'annual')).toBe(test);
    }
  });
});

describe("a person's photos", () => {
  const sheet = (id: string, kind: SheetPage['kind'], dates: (string | null)[] = []) =>
    ({
      id,
      kind,
      personId: 'ana',
      rows: dates.map((heldOn) => ({ heldOn })),
    }) as unknown as SheetPage;
  const proposalOf = (pages: SheetPage[]) => ({ pages }) as unknown as Proposal;
  const ids = (pages: SheetPage[]) => pages.map((page) => page.id);
  const ownedPages = (
    proposal: Proposal,
    moved: Record<string, { personId: string | null }>,
    personId: string
  ) => pagesOf({ proposal, changes: { pages: moved } }, personId);

  it('read as the booklets do: the SSM cover, the declaration, its pages by their first date, then the SU sheet', () => {
    const pages = [
      sheet('su-2022', 'su_periodic', ['2022-03-01']),
      sheet('ssm-first', 'ssm_sheet_front', ['2021-05-02']),
      sheet('ssm-2022', 'ssm_periodic', [null, '2022-09-06', '2022-03-07']),
      sheet('declaration', 'commute_declaration'),
      sheet('su-cover', 'su_sheet_front'),
      sheet('su-first', 'su_sheet_front', ['2021-05-03']),
      sheet('ssm-cover', 'ssm_sheet_front'),
      sheet('unread', null),
      sheet('ssm-2021', 'ssm_periodic', ['2021-09-06']),
      sheet('ssm-blank', 'ssm_periodic', [null]),
    ];
    expect(ids(ownedPages(proposalOf(pages), {}, 'ana'))).toEqual([
      'ssm-cover',
      'declaration',
      'ssm-first',
      'ssm-2021',
      'ssm-2022',
      'ssm-blank',
      'su-cover',
      'su-first',
      'su-2022',
      'unread',
    ]);
  });

  it('keep the upload order between pages the sheets cannot tell apart, and follow a moved page', () => {
    const pages = [
      sheet('b', 'ssm_periodic'),
      sheet('a', 'ssm_periodic'),
      { ...sheet('elsewhere', 'ssm_sheet_front'), personId: 'ion' },
    ];
    expect(
      ids(
        ownedPages(
          proposalOf(pages),
          { elsewhere: { personId: 'ana' }, a: { personId: null } },
          'ana'
        )
      )
    ).toEqual(['elsewhere', 'b']);
    expect(ids(ownedPages(proposalOf(pages), {}, 'ana'))).toEqual(['b', 'a']);
  });
});

describe('a value an older reading took from the client’s themes', () => {
  const themed = sheetRow('t1', {
    phase: 'introductory_general',
    trainerName: 'Barbu Ionuț',
    trainerJobTitle: 'inspector SSM',
    material: 'Tematica semestrului',
    durationMinutes: 120,
    fromThemes: ['trainerName', 'trainerJobTitle', 'material'],
    flags: ['from_client_themes'],
    test: {
      test: 'hiring',
      takenOn: '2025-02-10',
      examinerName: 'Barbu Ionuț',
      examinerJobTitle: 'inspector SSM',
      verified: true,
      inApp: false,
    },
  }) as unknown as SheetRow;

  it('counts as empty, and as the examiner of the row’s test too', () => {
    expect(rowValues(emptyChanges(), themed)).toMatchObject({
      trainerName: null,
      trainerJobTitle: null,
      material: null,
      durationMinutes: 120,
    });
    expect(examinerValues(emptyChanges(), themed)).toEqual({
      examinerName: null,
      examinerJobTitle: null,
    });
  });

  it('unless the member typed one over it', () => {
    const typed = withRow(emptyChanges(), 't1', () => ({ values: { material: 'Riscuri' } }));
    expect(rowValues(typed, themed).material).toBe('Riscuri');
  });

  it('even when a dialog saved it unchanged with a corrected date', () => {
    const saved = withRow(emptyChanges(), 't1', () => ({
      values: {
        heldOn: '2025-02-12',
        durationMinutes: 120,
        trainerName: 'Barbu Ionuț',
        trainerJobTitle: 'inspector SSM',
        material: 'Tematica semestrului',
        examinerName: 'Barbu Ionuț',
        examinerJobTitle: 'inspector SSM',
      },
    }));
    expect(rowValues(saved, themed)).toMatchObject({
      heldOn: '2025-02-12',
      trainerName: null,
      trainerJobTitle: null,
      material: null,
      durationMinutes: 120,
    });
    expect(examinerValues(saved, themed)).toEqual({ examinerName: null, examinerJobTitle: null });
    const renamed = withRow(emptyChanges(), 't1', () => ({
      values: { examinerName: 'Pavel Dan', examinerJobTitle: 'inspector SSM' },
    }));
    expect(examinerValues(renamed, themed)).toEqual({
      examinerName: 'Pavel Dan',
      examinerJobTitle: 'inspector SSM',
    });
  });
});
