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
          reference: 'nr. 5 PSI din 19.01.2026',
        },
        {
          title: 'Decizia privind instruirea în domeniul situațiilor de urgență',
          reference: 'nr. 6 PSI din 19.01.2026',
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
      'Administrator, cu coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic'
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
      'Raportul anual de evaluare a nivelului de apărare împotriva incendiilor'
    );
    expect(report.documents.some((document) => document.title.startsWith('Copertă'))).toBe(false);
    expect(report.documents).toHaveLength(22);
    expect(report).toMatchObject({ missingCount: 19, allGenerated: false });
    expect(reportOf({ currentEmployeeCount: 4 }).documents).toHaveLength(17);
  });
});
