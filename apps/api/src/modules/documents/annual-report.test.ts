import { fireSafetyDocumentTitles } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import type { DocumentFacts } from './context';
import { facts } from './context.fixture';
import { buildFireSafetyContext } from './fire-safety';

const reportOf = (variant: Partial<DocumentFacts> = {}) =>
  buildFireSafetyContext({ ...facts, currentEmployeeCount: 12, period: 2026, ...variant }).fire
    .annualReport!;

describe('the annual report', () => {
  it("is in a dated document's data only, for its year", () => {
    expect(buildFireSafetyContext({ ...facts, currentEmployeeCount: 12 }).fire).not.toHaveProperty(
      'annualReport'
    );
    expect(reportOf()).toMatchObject({ year: 2026, nextYear: 2027 });
  });

  it('names the decisions of the set with their numbers and dates, and the people who hold the roles', () => {
    expect(reportOf()).toMatchObject({
      decisions: [
        {
          title: 'Decizia privind organizarea apărării împotriva incendiilor',
          reference: 'nr. 5 SU din 19.01.2026',
        },
        {
          title: 'Decizia privind instruirea în domeniul situațiilor de urgență',
          reference: 'nr. 6 SU din 19.01.2026',
        },
      ],
      coordinator: 'Florin Cristian TALOȘ, Administrator',
      interventionLeader: 'Ioana PETRE, Șef de echipă',
      workplaceManagers: 'Florin Cristian TALOȘ și Ioana PETRE',
      staff: [
        { label: 'Personal administrativ', posts: 'Contabil', headcount: '1 angajat' },
        { label: 'Personal de execuție', posts: 'Sudor', headcount: '5 angajați' },
      ],
      headcount: '12 angajați',
    });
  });

  it('counts the means of each workplace by kind, with the next dates of their checks', () => {
    const [workshop, office] = reportOf().workplaces;
    expect(workshop).toEqual({
      name: 'Atelier Ghiroda',
      place: 'Atelier Ghiroda, Ghiroda, județul Timiș, Str. Industriilor 4',
      rows: [
        {
          what: 'Stingător P6 – pulbere, 6 kg',
          quantity: '2 buc.',
          next: '15.01.2027, 12.03.2027',
        },
        { what: 'Stingător P50 carosabil – pulbere, 50 kg', quantity: '1 buc.', next: '—' },
        {
          what: 'Stingător G5 – dioxid de carbon (CO₂), 5 kg',
          quantity: '1 buc.',
          next: '—',
        },
        { what: 'Ladă cu nisip', quantity: '1 buc.', next: '—' },
        { what: 'Hidranți exteriori – Doi hidranți în curte', quantity: '1 instalație', next: '—' },
      ],
    });
    expect(office!.rows.at(-1)).toEqual({
      what: 'Hidranți interiori – Câte unul pe nivel',
      quantity: '1 instalație',
      next: '12.03.2027',
    });
  });

  it('plans the training of each staff category as decision 2 does', () => {
    expect(reportOf()).toMatchObject({
      periodicLabel: '2 ore',
      training: [
        {
          label: 'Personal administrativ',
          posts: 'Contabil',
          interval: 'la 6 luni',
          months: 'februarie, august',
        },
        {
          label: 'Personal de execuție',
          posts: 'Sudor',
          interval: 'la 3 luni',
          months: 'februarie, mai, august, noiembrie',
        },
      ],
    });
  });

  it("plans the controls of decision 9, the third parties' and the weighing only where they apply", () => {
    const scopes = (report: ReturnType<typeof reportOf>) =>
      report.controls.map((control) => control.scope);
    expect(scopes(reportOf())).toEqual([
      'pe tot perimetrul',
      'la persoanele juridice care desfășoară activități în spațiile operatorului',
      'fiecare stingător de incendiu',
      'stingătoarele cu CO₂ sau agent curat, prin cântărire',
      'locul de muncă condus',
      'zona de lucru, la terminarea programului',
      'pe tot perimetrul',
    ]);
    const plain = reportOf({
      fireSafety: {
        ...facts.fireSafety,
        card: { ...facts.fireSafety.card!, hasThirdParties: false },
        equipment: facts.fireSafety.equipment.filter((unit) => unit.agent !== 'co2'),
      },
    });
    expect(scopes(plain)).toHaveLength(5);
    expect(plain.controls.at(-1)!.who).toBe(
      'Administratorul, cu coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic'
    );
    const chaired = reportOf({ client: { ...facts.client, representativeRole: 'Președinte' } });
    expect(chaired.controls.at(-1)!.who).toBe(
      'Conducerea, cu coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic'
    );
  });

  it('plans no control while the set does not hold decision 9', () => {
    expect(reportOf({ currentEmployeeCount: 4 })).toMatchObject({
      controls: [],
      hasControls: false,
      noControls: true,
    });
  });

  it('states every document of the set but the covers and the dated ones, and counts those missing', () => {
    const report = reportOf();
    expect(report.documents.slice(0, 3)).toEqual([
      {
        title: 'Decizia privind organizarea apărării împotriva incendiilor',
        state: 'emis, rev. 1 din 19.01.2026',
      },
      {
        title: 'Decizia privind instruirea în domeniul situațiilor de urgență',
        state: 'emis, rev. 1 din 19.01.2026; ciornă, rev. 2 din 02.06.2026',
      },
      { title: 'Decizia privind lucrul cu foc deschis', state: 'negenerat' },
    ]);
    expect(report.documents).toContainEqual({
      title: 'Lista mijloacelor de apărare împotriva incendiilor',
      state: 'ciornă, rev. 1',
    });
    expect(report.documents.map((document) => document.title)).not.toContain(
      'Raportul anual de evaluare a capacității de apărare împotriva incendiilor'
    );
    expect(report.documents.some((document) => document.title.startsWith('Copertă'))).toBe(false);
    expect(report.documents).toHaveLength(22);
    expect(report).toMatchObject({
      missingCount: 19,
      allGenerated: false,
      documentsSummary: 'Documente neîntocmite încă: 19.',
    });
    expect(reportOf({ currentEmployeeCount: 4 }).documents).toHaveLength(17);
  });

  it('says the documents are issued only when every one is, and drawn up otherwise', () => {
    const issued = { revision: 1, issueDate: '2026-01-19' };
    const listedTitles = reportOf().documents.map((document) => document.title);
    const everyDocument = (draft: { revision: number; issueDate: string } | null) =>
      reportOf({
        fireSafety: {
          ...facts.fireSafety,
          documents: Object.entries(fireSafetyDocumentTitles)
            .filter(([, title]) => listedTitles.includes(title))
            .map(([typeKey, title]) => ({
              typeKey,
              title,
              decisionNumber: null,
              period: null,
              draft,
              issued,
              issuedRevisions: [],
            })),
        },
      });
    expect(everyDocument(null)).toMatchObject({
      missingCount: 0,
      allGenerated: true,
      documentsSummary: 'Toate documentele cerute operatorului sunt emise.',
    });
    expect(everyDocument({ revision: 2, issueDate: '2026-06-02' })).toMatchObject({
      allGenerated: true,
      documentsSummary:
        'Documentele cerute operatorului sunt întocmite; starea fiecăruia este cea din tabel.',
    });
  });

  describe('lists the decisions issued in its year', () => {
    const decisionsOf = (variant: Partial<DocumentFacts> = {}, period = 2026) =>
      reportOf({ period, ...variant });

    it('each revision issued in the year, with its number and date, the revision after the first', () => {
      const [organization, training] = facts.fireSafety.documents;
      const report = decisionsOf({
        fireSafety: {
          ...facts.fireSafety,
          documents: [
            organization!,
            {
              ...training!,
              issuedRevisions: [
                { revision: 1, issueDate: '2025-12-20', issuedOn: '2025-12-20' },
                { revision: 2, issueDate: '2026-06-02', issuedOn: '2026-06-03' },
              ],
            },
          ],
        },
      });
      expect(report.yearDecisions).toEqual([
        {
          text: 'Decizia privind organizarea apărării împotriva incendiilor, nr.\u00a05\u00a0SU din 19.01.2026',
        },
        {
          text: 'Decizia privind instruirea în domeniul situațiilor de urgență, nr.\u00a06\u00a0SU din 02.06.2026, revizia 2',
        },
      ]);
      expect(report).toMatchObject({ hasYearDecisions: true, noYearDecisions: false });
    });

    it('by the day an uploaded revision was issued, which prints no date', () => {
      const [organization] = facts.fireSafety.documents;
      const report = decisionsOf({
        fireSafety: {
          ...facts.fireSafety,
          documents: [
            {
              ...organization!,
              issuedRevisions: [{ revision: 3, issueDate: null, issuedOn: '2026-09-01' }],
            },
          ],
        },
      });
      expect(report.yearDecisions).toEqual([
        {
          text: 'Decizia privind organizarea apărării împotriva incendiilor, nr.\u00a05\u00a0SU, revizia 3',
        },
      ]);
    });

    it('none for a year with no decision issued, nor for a document that is no decision', () => {
      expect(decisionsOf({}, 2027)).toMatchObject({
        yearDecisions: [],
        hasYearDecisions: false,
        noYearDecisions: true,
      });
      const listOnly = decisionsOf({
        fireSafety: {
          ...facts.fireSafety,
          documents: facts.fireSafety.documents.map((document) =>
            document.typeKey === 'fire_means_list'
              ? {
                  ...document,
                  issuedRevisions: [
                    { revision: 1, issueDate: '2026-03-01', issuedOn: '2026-03-01' },
                  ],
                }
              : document
          ),
        },
      });
      expect(listOnly.yearDecisions.map((decision) => decision.text)).not.toContain(
        expect.stringContaining('Lista mijloacelor')
      );
    });
  });

  describe('states the trainings held in its year from the training records', () => {
    const [ana, bogdan, carmen, dan] = [1, 2, 3, 4].map(
      (index) => `e1e1e1e1-0000-4000-8000-00000000010${index}`
    ) as [string, string, string, string];
    type Training = DocumentFacts['fireSafety']['trainings'][number];
    type Test = DocumentFacts['fireSafety']['tests'][number];
    const recordsOf = (trainings: Training[], tests: Test[] = []) =>
      reportOf(withRecords(trainings, tests)).trainingRecords.map((paragraph) => paragraph.text);
    const withRecords = (trainings: Training[], tests: Test[]): Partial<DocumentFacts> => ({
      fireSafety: { ...facts.fireSafety, trainings, tests },
    });
    const held = (phase: Training['phase'], heldOn: string, employeeIds: string[]): Training => ({
      phase,
      heldOn,
      employeeIds,
    });

    it('per phase held, with the trainings, the employees who attended and the months of the periodic ones', () => {
      expect(
        recordsOf([
          held('introductory_general', '2026-02-02', [ana]),
          held('introductory_general', '2026-07-01', [bogdan, carmen]),
          held('workplace', '2026-02-02', [ana]),
          held('periodic', '2026-03-10', [ana, bogdan, carmen, dan]),
          held('periodic', '2026-09-15', [ana, bogdan, carmen]),
          held('periodic', '2026-09-16', [dan]),
          held('supplementary', '2026-10-05', [dan]),
          held('periodic', '2025-12-10', [ana, bogdan]),
        ])
      ).toEqual([
        'Potrivit evidenței instruirilor, în anul 2026 s-au efectuat: 2 instruiri introductiv-generale, la care au participat 3 angajați; 1 instruire specifică locului de muncă, la care a participat 1 angajat; 3 instruiri periodice, în lunile martie și septembrie, la care au participat 4 angajați; 1 instruire suplimentară, la care a participat 1 angajat.',
      ]);
    });

    it('in the singular for one training, and only for the phases held', () => {
      expect(recordsOf([held('periodic', '2026-03-10', [ana, bogdan])])).toEqual([
        'Potrivit evidenței instruirilor, în anul 2026 s-a efectuat: 1 instruire periodică, în luna martie, la care au participat 2 angajați.',
      ]);
    });

    it('then the tests finished in the year: who took each one and who passed it', () => {
      const test = (
        employeeId: string,
        kind: Test['test'],
        takenOn: string,
        passed: boolean
      ): Test => ({ employeeId, test: kind, takenOn, passed });
      const [, tests] = recordsOf(
        [held('periodic', '2026-03-10', [ana, bogdan, carmen, dan])],
        [
          test(ana, 'hiring', '2026-02-02', true),
          test(ana, 'annual', '2026-03-10', false),
          test(ana, 'annual', '2026-03-11', true),
          test(bogdan, 'annual', '2026-03-10', true),
          test(carmen, 'annual', '2026-03-10', false),
          test(dan, 'annual', '2025-11-20', true),
        ]
      );
      expect(tests).toBe(
        'În același an, testul la angajare a fost susținut de 1 angajat, care l-a promovat, iar testul anual a fost susținut de 3 angajați, dintre care 2 l-au promovat.'
      );
      const [, annualOnly] = recordsOf(
        [held('periodic', '2026-03-10', [ana, bogdan])],
        [test(ana, 'annual', '2026-03-10', false), test(bogdan, 'annual', '2026-03-10', false)]
      );
      expect(annualOnly).toBe(
        'În același an, testul anual a fost susținut de 2 angajați, dintre care niciunul nu l-a promovat.'
      );
    });

    it('says nothing of the tests when none was taken in the year', () => {
      expect(recordsOf([held('periodic', '2026-03-10', [ana])])).toHaveLength(1);
    });

    it('stays a gap when no training was recorded in the year, whatever the tests', () => {
      const report = reportOf(
        withRecords(
          [held('periodic', '2025-12-10', [ana])],
          [{ employeeId: ana, test: 'annual', takenOn: '2026-01-10', passed: true }]
        )
      );
      expect(report).toMatchObject({ trainingRecords: [], noTrainingRecords: true });
    });
  });
});
