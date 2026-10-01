import {
  type MissingDocumentData,
  missingDocumentData,
  type MissingServiceContractData,
  missingServiceContractData,
} from '@ssm-usor/contracts';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { createAppRouter } from '@/app/router';

import {
  contractMissingGroups,
  documentMissingGroups,
  missingCountLabel,
  type MissingGroup,
} from './missing-rows';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const router = createAppRouter({} as never, createMemoryHistory());

const hrefs = (groups: MissingGroup[]) =>
  groups.flatMap((group) =>
    group.rows.map((row) => (row.target ? router.buildLocation(row.target).href : null))
  );

const details = `/clients/${clientId}/details?focus=`;
const training = `/clients/${clientId}/training?focus=`;

const documentTargets: Record<MissingDocumentData, string> = {
  'provider.legalName': '/organization/company?focus=legal-name',
  'provider.representativeName': '/organization/company?focus=representative-name',
  'provider.representativeRole': '/organization/company?focus=representative-role',
  'specialist.name': '/profile?focus=full-name',
  'specialist.professionalTitle': '/profile?focus=professional-title',
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
  'positions.any': `/clients/${clientId}/job-positions?focus=add-position`,
  'positions.equipment': `/clients/${clientId}/job-positions`,
  'positions.instructions': `/clients/${clientId}/job-positions`,
  'positions.risk_evaluation': `/clients/${clientId}/job-positions`,
  'risk_evaluations.sensitive_groups': `/clients/${clientId}/job-positions#client-risk-evaluations`,
  'risk_evaluations.measures': `/clients/${clientId}/job-positions`,
  'risk_evaluations.plan': `/clients/${clientId}/job-positions`,
  'documents.own_instructions': `/clients/${clientId}/documents?section=own-instructions`,
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
      `/clients/${clientId}/job-positions/p-contabil#protective-equipment`,
      `/clients/${clientId}/job-positions/p-contabil#instructions`,
      `/clients/${clientId}/job-positions/p-sudor#instructions`,
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
      `/clients/${clientId}/job-positions/p-contabil`,
      `/clients/${clientId}/job-positions/p-sudor`,
      `/clients/${clientId}/job-positions/p-sudor`,
      `/clients/${clientId}/job-positions#client-risk-evaluations`,
      `/clients/${clientId}/job-positions#client-risk-evaluations`,
    ]);
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
});

const organizationCompany = '/organization/company?focus=';

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
    client: '/organization/authorizations?focus=certificate',
    lead: '/organization/authorizations?focus=certificate',
  },
  'provider.fireSafetyTechnician': {
    client: '/organization/authorizations?focus=fire-safety-technician',
    lead: '/organization/authorizations?focus=fire-safety-technician',
  },
  'client.tradeRegisterNumber': {
    client: `${details}company-trade-register`,
    lead: `/leads/${clientId}?focus=company-trade-register`,
  },
  'client.address': {
    client: `${details}company-address`,
    lead: `/leads/${clientId}?focus=company-address`,
  },
  'client.representativeName': {
    client: `${details}legal-representative-name`,
    lead: `/leads/${clientId}?focus=contract-representative-name`,
  },
  'client.representativeRole': {
    client: `${details}legal-representative-role`,
    lead: `/leads/${clientId}?focus=contract-representative-role`,
  },
  'contract.details': {
    client: `/clients/${clientId}/contract?focus=contract-details`,
    lead: `/leads/${clientId}?focus=contract-details`,
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
