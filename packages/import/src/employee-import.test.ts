import { describe, expect, it } from 'vitest';

import { type EmployeeImportClient, hiringTestRowIds, toEmployeeProposal } from './employee-import';
import {
  cnps,
  comanFire,
  comanFront,
  comanPeriodic,
  existingPop,
  otherPhoto,
  page,
  pagesOf,
  popFront,
  positions,
  row,
  rusuFront,
  themes,
  today,
  tomaFront,
  tomaPeriodic,
  workplaces,
} from './test/sheets';

const client: EmployeeImportClient = {
  jobPositions: positions,
  workplaces,
  employees: [existingPop],
};

const propose = (overrides: Partial<EmployeeImportClient> = {}) =>
  toEmployeeProposal({
    pages: pagesOf(
      comanFront,
      comanPeriodic,
      comanFire,
      tomaFront,
      tomaPeriodic,
      rusuFront,
      popFront,
      otherPhoto
    ),
    client: { ...client, ...overrides },
    themes,
    today,
  });

const personNamed = (proposal: ReturnType<typeof propose>, lastName: string) =>
  proposal.people.find((person) => person.fields.lastName.options[0]?.value === lastName)!;

const rowsOf = (proposal: ReturnType<typeof propose>, personId: string) =>
  proposal.pages.filter((page) => page.personId === personId).flatMap((page) => page.rows);

describe('toEmployeeProposal', () => {
  it('groups the pages into people and lists the photograph it could not place', () => {
    const proposal = propose();

    expect(proposal.people.map((person) => person.pageIds)).toEqual([
      ['page-1', 'page-2', 'page-3'],
      ['page-4', 'page-5'],
      ['page-6'],
      ['page-7'],
    ]);
    expect(proposal.pages.map((page) => page.placement)).toEqual([
      'new_person',
      'placed_by_order',
      'name',
      'new_person',
      'near_name',
      'new_person',
      'new_person',
      'unplaced',
    ]);
    expect(proposal.pages[7]).toMatchObject({ personId: null, kind: 'other', rows: [] });
  });

  it('reads the personal fields with the page each comes from', () => {
    const coman = personNamed(propose(), 'Coman');

    expect(coman.fields.cnp.options).toEqual([{ value: cnps.coman, pageIds: ['page-1'] }]);
    expect(coman.fields.lastName.options).toEqual([
      { value: 'Coman', pageIds: ['page-1', 'page-3'] },
    ]);
    expect(coman.fields.bloodGroup.options[0]!.value).toBe('A(II)');
    expect(coman.fields.rhFactor.options[0]!.value).toBe('+');
    expect(coman.fields.hiredAt.options[0]!.value).toBe('2021-01-18');
    expect(coman.existing).toBeNull();
    expect(coman.flags).toEqual([{ code: 'no_contact' }]);
    expect(coman.proposedIncluded).toBe(true);
  });

  it('gives a choice where the pages disagree, the name most pages give first', () => {
    const toma = personNamed(propose(), 'Toma');

    expect(toma.fields.lastName.options.map((option) => option.value)).toEqual(['Toma', 'Tomma']);
    expect(toma.fields.firstName.options).toHaveLength(2);
  });

  it('marks the rows: month only, from the themes, unsigned, an unusual duration', () => {
    const proposal = propose();
    const rows = rowsOf(proposal, personNamed(proposal, 'Coman').id);
    const periodic = rows.filter((row) => row.domain === 'ssm' && row.phase === 'periodic');

    expect(periodic.map((row) => row.heldOn)).toEqual([
      '2024-07-15',
      '2025-01-01',
      '2025-07-14',
      '2026-07-01',
    ]);
    expect(periodic[0]!.flags).toEqual(['unusual_duration']);
    expect(periodic[1]).toMatchObject({
      material: 'Tematica semestrului',
      trainerJobTitle: 'Inspector SSM',
      fromThemes: ['trainerJobTitle', 'material'],
      flags: ['month_only', 'from_client_themes'],
      proposedIncluded: true,
    });
    expect(periodic[2]).toMatchObject({ flags: ['unsigned'], proposedIncluded: false });
    expect(periodic[3]!.flags).toEqual(['month_only']);
  });

  it('takes a verifier’s signature on a hiring block for the paper hiring test', () => {
    const proposal = propose();
    const rows = rowsOf(proposal, personNamed(proposal, 'Coman').id);
    const ssm = rows.find((row) => row.domain === 'ssm' && row.phase === 'introductory_general')!;
    const psi = rows.find((row) => row.domain === 'psi' && row.phase === 'workplace')!;

    expect(ssm.test).toEqual({
      test: 'hiring',
      takenOn: '2021-01-18',
      examinerName: 'Mureșan Ioana',
      examinerJobTitle: 'Administrator',
      verified: true,
      inApp: false,
    });
    expect(psi.test).toMatchObject({ examinerName: 'Barbu Ionuț', verified: true });
    expect(hiringTestRowIds(rows)).toEqual(new Set([ssm.id, psi.id]));
  });

  it('keeps the verifier box on a page it could not place, for the member to move', () => {
    const proposal = toEmployeeProposal({
      pages: pagesOf(
        page({
          pageKind: 'ssm_sheet_front',
          trainings: [row({ phase: 'introductory_general', verifierSignature: 'present' })],
        }),
        comanFront
      ),
      client,
      themes,
      today,
    });

    expect(proposal.pages[0]!.placement).toBe('unplaced');
    expect(proposal.pages[0]!.rows[0]!.test).toMatchObject({ test: 'hiring', verified: true });
  });

  it('puts the admission on the workplace row of its sheet', () => {
    const proposal = propose();
    const rows = rowsOf(proposal, personNamed(proposal, 'Coman').id);

    expect(
      rows.find((row) => row.domain === 'ssm' && row.phase === 'workplace')!.admission
    ).toEqual({
      admittedOn: '2021-01-20',
      admittedByName: 'Mureșan Ioana',
      admittedByJobTitle: 'Administrator',
    });
    expect(rows.find((row) => row.phase === 'introductory_general')!.admission).toBeNull();
  });

  it('turns the fire-safety annual test row into a paper result, not a training', () => {
    const proposal = propose();
    const annual = rowsOf(proposal, personNamed(proposal, 'Coman').id).find((row) => row.testOnly)!;

    expect(annual.test).toEqual({
      test: 'annual',
      takenOn: '2026-03-12',
      examinerName: 'Barbu Ionuț',
      examinerJobTitle: 'Cadru tehnic PSI',
      verified: true,
      inApp: false,
    });
  });

  it('proposes an unverified hiring test unticked', () => {
    const proposal = propose();
    const rows = rowsOf(proposal, personNamed(proposal, 'Toma').id);

    expect(rows.find((row) => row.phase === 'introductory_general')!.test).toMatchObject({
      verified: false,
    });
  });

  it('matches titles to posts by group: near, none, and the existing employee keeps theirs', () => {
    const proposal = propose();

    expect(
      proposal.jobTitles.map(({ title, match, personIds }) => ({ title, match, personIds }))
    ).toEqual([
      { title: 'Patiseră', match: 'near', personIds: [personNamed(proposal, 'Coman').id] },
      { title: 'Vânzătoare', match: 'near', personIds: [personNamed(proposal, 'Toma').id] },
      { title: 'Contabil', match: 'none', personIds: [personNamed(proposal, 'Rusu').id] },
    ]);
    expect(personNamed(proposal, 'Pop').jobTitleId).toBeNull();
    expect(proposal.clientHasPositions).toBe(true);
  });

  it('asks the workplace once per text, never at a client with one', () => {
    const proposal = propose();

    expect(
      proposal.workplaces.map(({ text, match, proposedId }) => ({ text, match, proposedId }))
    ).toEqual([
      { text: 'Sediu', match: 'exact', proposedId: workplaces[0]!.id },
      { text: 'Magazin Centru', match: 'exact', proposedId: workplaces[1]!.id },
      { text: '', match: 'none', proposedId: null },
    ]);
    expect(personNamed(proposal, 'Pop').workplaceId).toBeNull();
    expect(propose({ workplaces: [workplaces[0]!] }).workplaces).toEqual([]);
  });

  it('offers the corrected CNP and proposes a leaver unticked', () => {
    const rusu = personNamed(propose(), 'Rusu');

    expect(rusu.cnpCorrection).toBe(cnps.rusu);
    expect(rusu.flags.map((flag) => flag.code)).toEqual([
      'invalid_cnp',
      'cnp_correction',
      'leaver',
      'no_contact',
    ]);
    expect(rusu.proposedIncluded).toBe(false);
    expect(rusu.fields.bloodGroup.options[0]!.value).toBe('0(I)');
    expect(rusu.fields.rhFactor.options[0]!.value).toBe('-');
  });

  it('writes a post, a workplace and a job title in sentence case, however the sheet capitalizes', () => {
    const proposal = toEmployeeProposal({
      pages: pagesOf(
        page({
          pageKind: 'ssm_sheet_front',
          person: { lastName: 'Ionescu', firstName: 'Mihai' },
          fields: {
            jobTitle: 'SUDOR',
            workplace: 'ATELIER, BENEFICIARI',
            qualification: 'lăcătuș',
          },
          admission: { admittedOn: '2026-06-05', admittedByJobTitle: 'conducător loc muncă' },
          trainings: [
            row({ phase: 'workplace', heldOn: '2026-06-05', trainerJobTitle: 'șef echipă' }),
          ],
        })
      ),
      client,
      themes,
      today,
    });
    const [person] = proposal.people;
    const [workplace] = proposal.pages[0]!.rows;

    expect(person!.fields.jobTitle.options[0]!.value).toBe('Sudor');
    expect(person!.fields.workplace.options[0]!.value).toBe('Atelier, beneficiari');
    expect(person!.fields.qualification.options[0]!.value).toBe('Lăcătuș');
    expect(proposal.jobTitles.map((group) => group.title)).toEqual(['Sudor']);
    expect(workplace).toMatchObject({
      trainerJobTitle: 'Șef echipă',
      admission: { admittedByJobTitle: 'Conducător loc muncă' },
    });
  });

  it('takes one address written in another order for the same, but not another flat', () => {
    const proposal = toEmployeeProposal({
      pages: pagesOf(
        page({
          pageKind: 'ssm_sheet_front',
          person: { lastName: 'Marin', firstName: 'Ioana' },
          fields: {
            homeAddress: 'Loc. Dumbrăvița, jud. Timiș, str. Florilor, nr. 12, bl. 3, ap. 5',
          },
        }),
        page({
          pageKind: 'commute_declaration',
          person: { lastName: 'Marin', firstName: 'Ioana' },
          fields: { homeAddress: 'Str. Florilor, nr. 12, bl. 3, ap. 5, Dumbrăvița, Timis' },
        }),
        page({
          pageKind: 'psi_sheet_front',
          person: { lastName: 'Marin', firstName: 'Ioana' },
          fields: { homeAddress: 'Str. Florilor, nr. 12, bl. 5, ap. 3, Dumbrăvița, Timiș' },
        })
      ),
      client,
      themes,
      today,
    });

    expect(proposal.people[0]!.fields.homeAddress.options).toEqual([
      {
        value: 'Loc. Dumbrăvița, jud. Timiș, str. Florilor, nr. 12, bl. 3, ap. 5',
        pageIds: ['page-1', 'page-2'],
      },
      { value: 'Str. Florilor, nr. 12, bl. 5, ap. 3, Dumbrăvița, Timiș', pageIds: ['page-3'] },
    ]);
  });

  it('groups a name written surname last with the same person, matched once', () => {
    const proposal = toEmployeeProposal({
      pages: pagesOf(
        page({
          pageKind: 'ssm_sheet_front',
          person: { lastName: 'Pop', firstName: 'Elena' },
          fields: { birthDate: '1990-07-20' },
        }),
        page({
          pageKind: 'psi_sheet_front',
          person: { lastName: 'Elena', firstName: 'Pop' },
          fields: { birthDate: '1990-07-20' },
        })
      ),
      client,
      themes,
      today,
    });

    expect(proposal.people).toHaveLength(1);
    expect(proposal.people[0]!.existing).toEqual({
      employeeId: existingPop.id,
      matchedBy: 'name_birth_date',
    });
  });

  it('flags a former employee, and a rehire when the sheet’s hire date is after they left', () => {
    const former = { ...existingPop, terminatedAt: '2018-12-31' };
    const propose = (hiredAt: string) =>
      toEmployeeProposal({
        pages: pagesOf(page({ ...popFront, fields: { ...popFront.fields, hiredAt } })),
        client: { ...client, employees: [former] },
        themes,
        today,
      }).people[0]!;

    expect(propose('2015-04-03').flags).toEqual([
      { code: 'former_employee', detail: '2018-12-31' },
    ]);
    expect(propose('2024-02-01').flags).toEqual([
      { code: 'former_employee', detail: '2018-12-31' },
      { code: 'rehire', field: 'hiredAt', detail: '2018-12-31' },
    ]);
  });

  it('proposes the employee of the same name for a page with no CNP and no birth date', () => {
    const proposal = toEmployeeProposal({
      pages: pagesOf(
        page({
          pageKind: 'ssm_periodic',
          person: { lastName: 'Pop', firstName: 'Elena' },
          trainings: [row({ heldOn: '2026-01-12' })],
        })
      ),
      client,
      themes,
      today,
    });

    expect(proposal.people[0]!.existing).toEqual({
      employeeId: existingPop.id,
      matchedBy: 'name_only',
    });
  });

  it('completes an existing employee: the app’s values beside the sheet’s, its trainings hidden', () => {
    const proposal = propose();
    const pop = personNamed(proposal, 'Pop');
    const rows = rowsOf(proposal, pop.id);

    expect(pop.existing).toEqual({ employeeId: existingPop.id, matchedBy: 'cnp' });
    expect(pop.fields.homeAddress).toEqual({
      options: [{ value: 'Str. Fabricii nr. 21, Sibiu', pageIds: ['page-7'] }],
      app: 'Str. Viitorului nr. 3, Sibiu',
    });
    expect(pop.fields.bloodGroup.app).toBeNull();
    expect(pop.rowsInApp).toBe(1);
    expect(rows[0]).toMatchObject({ flags: ['in_app'], proposedIncluded: false });
    expect(rows[0]!.test).toMatchObject({ verified: false });
    expect(pop.flags).toEqual([]);
  });
});
