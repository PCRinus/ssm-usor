import {
  type MissingDocumentData,
  missingDocumentData,
  type MissingServiceContractData,
  missingServiceContractData,
  missingSheetData,
} from '@ssm-usor/contracts';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { createAppRouter } from '@/app/router';

import {
  contractMissingGroups,
  documentMissingGroups,
  missingCountLabel,
  type MissingGroup,
  trainingSheetMissingGroups,
} from './missing-rows';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const router = createAppRouter({} as never, createMemoryHistory());

const hrefs = (groups: MissingGroup[]) =>
  groups.flatMap((group) =>
    group.rows.map((row) => (row.target ? router.buildLocation(row.target).href : null))
  );

const details = `/clienti/${clientId}/detalii?focus=`;
const training = `/clienti/${clientId}/instruire?focus=`;

const documentTargets: Record<MissingDocumentData, string> = {
  'provider.legalName': '/organizatie/date-firma?focus=legal-name',
  'provider.representativeName': '/organizatie/date-firma?focus=representative-name',
  'provider.representativeRole': '/organizatie/date-firma?focus=representative-role',
  'provider.fireSafetyTechnician': '/organizatie/abilitari?focus=fire-safety-technician',
  'provider.fireSafetyTechnicianCertificate': '/organizatie/abilitari?focus=fire-safety-technician',
  'specialist.name': '/profil?focus=full-name',
  'specialist.professionalTitle': '/profil?focus=professional-title',
  'client.representativeName': `${details}legal-representative-name`,
  'client.representativeRole': `${details}legal-representative-role`,
  'client.trainingSchedule': `${training}training-schedule`,
  'responsible.workplace_manager': `${training}workplace-manager`,
  'responsible.first_aid': `${training}first-aid`,
  'responsible.risk_evaluation_team': `${training}risk-evaluation-team`,
  'responsible.imminent_danger': `${training}imminent-danger`,
  'responsible.workers_representative': `${training}workers-representative`,
  'responsible.workers_representatives_two': `${training}workers-representative`,
  'responsible.workers_representative_is_legal_representative': `${training}workers-representative-clash`,
  'positions.any': `/clienti/${clientId}/posturi?focus=add-position`,
  'positions.equipment': `/clienti/${clientId}/posturi`,
  'positions.instructions': `/clienti/${clientId}/posturi`,
  'positions.risk_evaluation': `/clienti/${clientId}/posturi`,
  'risk_evaluations.sensitive_groups': `/clienti/${clientId}/posturi#client-risk-evaluations`,
  'risk_evaluations.measures': `/clienti/${clientId}/posturi`,
  'risk_evaluations.plan': `/clienti/${clientId}/posturi`,
  'documents.own_instructions': `/clienti/${clientId}/documente-ssm?section=own-instructions`,
  'responsible.fire_safety_coordinator': `${training}fire-safety-coordinator`,
  'responsible.fire_intervention_leader': `${training}fire-intervention-leader`,
  'fire.trainingSchedule': `${training}fire-training-schedule`,
  'fire.smokingPolicy': `${training}fire-smoking`,
  'fire.waste': `${training}fire-waste`,
  'fire.workplaces': `${details}workplace-fire-data`,
  'fire.equipment': `/clienti/${clientId}/mijloace-de-aparare?focus=fire-equipment`,
  'fire.substances': `/clienti/${clientId}/mijloace-de-aparare?focus=fire-substances`,
  'fire.instructions': `/clienti/${clientId}/posturi`,
  'documents.fire_own_instructions': `/clienti/${clientId}/documente-su?section=own-instructions`,
};

describe('the rows of the generation form', () => {
  it.each(missingDocumentData)('lead %s to where it is filled in', (code) => {
    const groups = documentMissingGroups({
      missing: [code],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      canEditOrganization: true,
    });
    expect(hrefs(groups)).toEqual([documentTargets[code]]);
  });

  it('group the fire-safety codes by the page that fills them in', () => {
    const groups = documentMissingGroups({
      missing: [
        'provider.fireSafetyTechnician',
        'provider.fireSafetyTechnicianCertificate',
        'fire.trainingSchedule',
        'fire.smokingPolicy',
        'fire.waste',
        'fire.workplaces',
        'fire.equipment',
        'responsible.fire_safety_coordinator',
        'responsible.fire_intervention_leader',
      ],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      canEditOrganization: true,
    });
    expect(groups.map((group) => [group.heading, group.rows.map((row) => row.label)])).toEqual([
      ['Datele organizației', ['Cadrul tehnic PSI', 'Certificatul cadrului tehnic PSI']],
      ['Detaliile clientului', ['Datele SU ale locurilor de muncă']],
      ['Mijloacele de apărare', ['Stingătoarele locurilor de muncă']],
      [
        'Instruire și responsabili',
        [
          'Programul instruirii SU',
          'Regula privind fumatul',
          'Deșeurile colectate',
          'Coordonator privind apărarea împotriva incendiilor',
          'Șef echipă de primă intervenție',
        ],
      ],
    ]);
  });

  it('name the listed substances and what each lacks', () => {
    const both = ['classification', 'quantity'] as const;
    const rowWith = (
      incompleteFireSubstances: {
        id: string;
        name: string;
        missing: readonly ('classification' | 'quantity')[];
      }[]
    ) =>
      documentMissingGroups({
        missing: ['fire.substances'],
        clientId,
        clash: null,
        undecidedJobPositions: [],
        incompleteFireSubstances,
        canEditOrganization: true,
        set: 'fire_safety',
      })[0]!.rows[0]!;
    expect(rowWith([]).detail).toMatch(/^Dacă clientul utilizează substanțe periculoase/);
    expect(rowWith([{ id: 's1', name: 'Diluant', missing: both }]).detail).toBe(
      'Clasificarea și cantitatea substanței „Diluant”.'
    );
    expect(rowWith([{ id: 's1', name: 'Diluant', missing: ['quantity'] }]).detail).toBe(
      'Cantitatea substanței „Diluant”.'
    );
    const many = rowWith([
      { id: 's1', name: 'Diluant', missing: both },
      { id: 's2', name: 'Propan', missing: ['quantity'] },
      { id: 's3', name: 'Motorină', missing: ['quantity'] },
      { id: 's4', name: 'Vopsea', missing: ['classification'] },
    ]);
    expect(many.detail).toBe(
      'Clasificarea și cantitatea substanței „Diluant”; clasificarea substanței „Vopsea”; cantitatea substanțelor „Propan” și „Motorină”.'
    );
    expect(hrefs([{ place: '', heading: '', rows: [many] }])).toEqual([
      documentTargets['fire.substances'],
    ]);
  });

  it('are one per position and per section still undecided, each to that section', () => {
    const groups = documentMissingGroups({
      missing: ['positions.equipment', 'positions.instructions'],
      clientId,
      clash: null,
      undecidedJobPositions: [
        { id: 'p-contabil', name: 'Contabil', undecided: ['equipment', 'instructions'] },
        { id: 'p-sudor', name: 'Sudor', undecided: ['instructions'] },
      ],
      canEditOrganization: true,
    });
    expect(groups.map((group) => group.heading)).toEqual(['Posturile de lucru']);
    expect(groups[0]!.rows.map((row) => row.label)).toEqual([
      'Contabil · echipament de protecție',
      'Contabil · instrucțiuni',
      'Sudor · instrucțiuni',
    ]);
    expect(hrefs(groups)).toEqual([
      `/clienti/${clientId}/posturi/p-contabil#protective-equipment`,
      `/clienti/${clientId}/posturi/p-contabil#instructions`,
      `/clienti/${clientId}/posturi/p-sudor#instructions`,
    ]);
  });

  it('lead each position undecided about the fire-safety modules to its SU card', () => {
    const groups = documentMissingGroups({
      missing: ['fire.instructions', 'documents.fire_own_instructions'],
      clientId,
      clash: null,
      undecidedJobPositions: [
        { id: 'p-contabil', name: 'Contabil', undecided: ['fire_instructions'] },
        { id: 'p-sudor', name: 'Sudor', undecided: ['fire_instructions'] },
      ],
      canEditOrganization: true,
      set: 'fire_safety',
    });
    expect(groups.map((group) => [group.heading, group.rows.map((row) => row.label)])).toEqual([
      ['Posturile de lucru', ['Contabil · instrucțiuni SU', 'Sudor · instrucțiuni SU']],
      ['Documentația SU', ['Instrucțiunile proprii SU, generate înaintea tematicii']],
    ]);
    expect(hrefs(groups)).toEqual([
      `/clienti/${clientId}/posturi/p-contabil#fire-instructions`,
      `/clienti/${clientId}/posturi/p-sudor#fire-instructions`,
      `/clienti/${clientId}/documente-su?section=own-instructions`,
    ]);
  });

  it('are one per evaluation and per gap, each to where the evaluation is', () => {
    const groups = documentMissingGroups({
      missing: [
        'positions.risk_evaluation',
        'risk_evaluations.sensitive_groups',
        'risk_evaluations.measures',
        'risk_evaluations.plan',
      ],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      incompleteRiskEvaluations: [
        {
          evaluationId: null,
          kind: 'job_position',
          jobPositionId: 'p-contabil',
          name: 'Contabil',
          missing: ['factors'],
        },
        {
          evaluationId: 'e-sudor',
          kind: 'job_position',
          jobPositionId: 'p-sudor',
          name: 'Sudor',
          missing: ['measures', 'plan'],
        },
        {
          evaluationId: null,
          kind: 'sensitive_groups',
          jobPositionId: null,
          name: 'Grupuri sensibile la riscuri specifice',
          missing: ['factors'],
        },
        {
          evaluationId: 'e-vizitatori',
          kind: 'other',
          jobPositionId: null,
          name: 'Vizitatori',
          missing: ['plan'],
        },
      ],
      canEditOrganization: true,
    });
    expect(groups.map((group) => group.heading)).toEqual(['Evaluarea riscurilor']);
    expect(groups[0]!.rows.map((row) => [row.key, row.label])).toEqual([
      ['p-contabil:factors', 'Contabil · evaluarea riscurilor'],
      ['e-sudor:measures', 'Sudor · măsuri de prevenire'],
      ['e-sudor:plan', 'Sudor · termene și responsabili'],
      ['sensitive_groups:factors', 'Evaluarea grupurilor sensibile'],
      ['e-vizitatori:plan', 'Vizitatori · termene și responsabili'],
    ]);
    expect(hrefs(groups)).toEqual([
      `/clienti/${clientId}/posturi/p-contabil/fisa-de-evaluare#factors`,
      `/clienti/${clientId}/posturi/p-sudor/fisa-de-evaluare#factors`,
      `/clienti/${clientId}/posturi/p-sudor/fisa-de-evaluare#factors`,
      `/clienti/${clientId}/posturi#client-risk-evaluations`,
      `/clienti/${clientId}/posturi/fise-de-evaluare/e-vizitatori#factors`,
    ]);
    const sensitiveGroups = groups
      .flatMap((group) => group.rows)
      .find((row) => row.key === 'sensitive_groups:factors');
    expect(sensitiveGroups).toMatchObject({
      detail: 'Evaluează-le sau declară că clientul nu are lucrători din grupurile sensibile.',
      action: 'declare_no_sensitive_groups',
    });
  });

  it('leads to the sensitive groups evaluation once it exists, without the declaration', () => {
    const groups = documentMissingGroups({
      missing: ['risk_evaluations.sensitive_groups'],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      incompleteRiskEvaluations: [
        {
          evaluationId: 'e-grupuri',
          kind: 'sensitive_groups',
          jobPositionId: null,
          name: 'Grupuri sensibile la riscuri specifice',
          missing: ['factors'],
        },
      ],
      canEditOrganization: true,
    });
    expect(groups[0]!.rows.map((row) => [row.key, row.label])).toEqual([
      ['e-grupuri:factors', 'Evaluarea grupurilor sensibile'],
    ]);
    expect(hrefs(groups)).toEqual([
      `/clienti/${clientId}/posturi/fise-de-evaluare/e-grupuri#factors`,
    ]);
    expect(groups[0]!.rows[0]!.action).toBeUndefined();
  });

  it('are grouped by place, in the order of the form', () => {
    const groups = documentMissingGroups({
      missing: ['positions.any', 'responsible.first_aid', 'specialist.name', 'provider.legalName'],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      canEditOrganization: true,
    });
    expect(groups.map((group) => group.heading)).toEqual([
      'Datele organizației',
      'Profilul tău',
      'Instruire și responsabili',
      'Posturile de lucru',
    ]);
  });

  it("are not links to the organization's data for a specialist, who is told who fills it in", () => {
    const [organization, profile] = documentMissingGroups({
      missing: ['provider.legalName', 'provider.representativeRole', 'specialist.name'],
      clientId,
      clash: null,
      undecidedJobPositions: [],
      canEditOrganization: false,
    });
    expect(organization!.hint).toBe('Le completează proprietarul organizației.');
    expect(organization!.rows.map((row) => row.target)).toEqual([null, null]);
    expect(profile!.rows[0]!.target).not.toBeNull();
  });

  it('name the two people behind a clash with the legal representative', () => {
    const [group] = documentMissingGroups({
      missing: ['responsible.workers_representative_is_legal_representative'],
      clientId,
      clash: { representativeName: 'Talos Florin', legalRepresentativeName: 'Florin TALOȘ' },
      undecidedJobPositions: [],
      canEditOrganization: true,
    });
    expect(group!.rows[0]!.detail).toBe(
      '„Talos Florin” are același nume ca reprezentantul legal al clientului, „Florin TALOȘ”.'
    );
  });

  it('say why a post is needed in the words of the set that asks for it', () => {
    const detailFor = (set?: 'occupational_safety' | 'fire_safety') =>
      documentMissingGroups({
        missing: ['positions.any'],
        clientId,
        clash: null,
        undecidedJobPositions: [],
        canEditOrganization: true,
        set,
      })[0]!.rows[0]!.detail;
    expect(detailFor()).toBe(
      'Echipamentul de protecție și instrucțiunile se stabilesc pe posturi.'
    );
    expect(detailFor('fire_safety')).toBe(
      'Decizia privind instruirea în domeniul situațiilor de urgență enumeră posturile de lucru ale clientului.'
    );
  });

  it('say why a representative is needed under 10 employees, which only a decision 1.5 kept asks for', () => {
    const detailFor = (currentEmployeeCount?: number) =>
      documentMissingGroups({
        missing: ['responsible.workers_representative'],
        clientId,
        clash: null,
        undecidedJobPositions: [],
        currentEmployeeCount,
        canEditOrganization: true,
      })[0]!.rows[0]!.detail;
    expect(detailFor(9)).toBe(
      'Ales dintre lucrătorii actuali. Decizia îl numește și când clientul are sub 10 lucrători.'
    );
    expect(detailFor(10)).toBe('Ales dintre lucrători. Clientul are cel puțin 10 lucrători.');
    expect(detailFor()).toBe('Ales dintre lucrători. Clientul are cel puțin 10 lucrători.');
  });
});

const organizationCompany = '/organizatie/date-firma?focus=';

const contractTargets: Record<MissingServiceContractData, { client: string; lead: string }> = {
  'provider.legalName': {
    client: `${organizationCompany}legal-name`,
    lead: `${organizationCompany}legal-name`,
  },
  'provider.cui': { client: `${organizationCompany}cui`, lead: `${organizationCompany}cui` },
  'provider.tradeRegisterNumber': {
    client: `${organizationCompany}trade-register`,
    lead: `${organizationCompany}trade-register`,
  },
  'provider.address': {
    client: `${organizationCompany}address`,
    lead: `${organizationCompany}address`,
  },
  'provider.representativeName': {
    client: `${organizationCompany}representative-name`,
    lead: `${organizationCompany}representative-name`,
  },
  'provider.representativeRole': {
    client: `${organizationCompany}representative-role`,
    lead: `${organizationCompany}representative-role`,
  },
  'provider.phone': { client: `${organizationCompany}phone`, lead: `${organizationCompany}phone` },
  'provider.bankAccount': {
    client: `${organizationCompany}bank-account`,
    lead: `${organizationCompany}bank-account`,
  },
  'provider.authorizationCertificate': {
    client: '/organizatie/abilitari?focus=certificate',
    lead: '/organizatie/abilitari?focus=certificate',
  },
  'provider.fireSafetyTechnician': {
    client: '/organizatie/abilitari?focus=fire-safety-technician',
    lead: '/organizatie/abilitari?focus=fire-safety-technician',
  },
  'client.tradeRegisterNumber': {
    client: `${details}company-trade-register`,
    lead: `/oferte/${clientId}?focus=company-trade-register`,
  },
  'client.address': {
    client: `${details}company-address`,
    lead: `/oferte/${clientId}?focus=company-address`,
  },
  'client.representativeName': {
    client: `${details}legal-representative-name`,
    lead: `/oferte/${clientId}?focus=contract-representative-name`,
  },
  'client.representativeRole': {
    client: `${details}legal-representative-role`,
    lead: `/oferte/${clientId}?focus=contract-representative-role`,
  },
  'contract.details': {
    client: `/clienti/${clientId}/contract?focus=contract-details`,
    lead: `/oferte/${clientId}?focus=contract-details`,
  },
};

describe("the rows of the contract's missing data", () => {
  it.each(
    missingServiceContractData.flatMap((code) => [
      [code, 'client'] as const,
      [code, 'lead'] as const,
    ])
  )('lead %s of a %s to where it is filled in', (code, stage) => {
    const groups = contractMissingGroups([code], {
      id: clientId,
      stage,
      legalName: 'VELOCITA URBANA SRL',
    });
    expect(hrefs(groups)).toEqual([contractTargets[code][stage]]);
  });

  it("are grouped by place, the company's under its name", () => {
    const groups = contractMissingGroups(
      ['provider.bankAccount', 'provider.authorizationCertificate', 'client.address'],
      { id: clientId, stage: 'lead', legalName: 'VELOCITA URBANA SRL' }
    );
    expect(groups.map((group) => group.heading)).toEqual([
      'Datele organizației tale',
      'Abilitările organizației',
      'VELOCITA URBANA SRL',
    ]);
  });
});

describe("the rows of a training sheet's missing data", () => {
  const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const edit = `/clienti/${clientId}/angajati/${employeeId}/editare?focus=`;

  it('lead each code to its field on the edit form, under the employee', () => {
    const groups = trainingSheetMissingGroups({ missing: missingSheetData, clientId, employeeId });
    expect(groups.map((group) => [group.place, group.heading])).toEqual([
      ['employee', 'Datele lucrătorului'],
    ]);
    expect(groups[0]!.rows.map((row) => row.label)).toEqual([
      'Traseul de deplasare',
      'Punctul de lucru',
    ]);
    expect(hrefs(groups)).toEqual([`${edit}commute-route`, `${edit}workplace`]);
  });

  it('are none for a sheet that can be drawn up', () => {
    expect(trainingSheetMissingGroups({ missing: [], clientId, employeeId })).toEqual([]);
  });
});

describe('the count of what is missing', () => {
  it.each([
    [1, '1 dată de completat'],
    [2, '2 date de completat'],
    [19, '19 date de completat'],
    [20, '20 de date de completat'],
    [101, '101 date de completat'],
    [120, '120 de date de completat'],
  ])('says %i as "%s"', (count, label) => {
    expect(missingCountLabel(count)).toBe(label);
  });
});
