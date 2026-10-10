import {
  type JobPositionDecision,
  type MissingDocumentData,
  type MissingServiceContractData,
  requiredWorkersRepresentatives,
  type ResponsiblePersonRole,
  type RiskEvaluationGap,
  type RiskEvaluationKind,
} from '@ssm-usor/contracts';
import { linkOptions } from '@tanstack/react-router';

import type { DocumentSectionId } from '@/features/documents/document-sections';
import { positionSections } from '@/features/job-positions/position-sections';
import {
  clientEvaluationsSection,
  evaluationSections,
} from '@/features/risk-evaluations/risk-evaluation-schema';
import { responsibleRoleLabels } from '@/features/training/responsible-person-schema';

import type {
  AuthorizationsFocus,
  ClientDetailsFocus,
  CompanyFocus,
  ContractFocus,
  OrganizationCompanyFocus,
  ProfileFocus,
  TrainingFocus,
} from './focus';

const to = {
  clientDetails: (clientId: string, focus: ClientDetailsFocus) =>
    linkOptions({ to: '/clients/$clientId/details', params: { clientId }, search: { focus } }),
  training: (clientId: string, focus: TrainingFocus) =>
    linkOptions({ to: '/clients/$clientId/training', params: { clientId }, search: { focus } }),
  fireSafetyMeans: (clientId: string) =>
    linkOptions({
      to: '/clients/$clientId/fire-safety-means',
      params: { clientId },
      search: { focus: 'fire-equipment' as const },
    }),
  clientEvaluations: (clientId: string) =>
    linkOptions({
      to: '/clients/$clientId/job-positions',
      params: { clientId },
      hash: clientEvaluationsSection,
    }),
  clientEvaluation: (clientId: string, evaluationId: string) =>
    linkOptions({
      to: '/clients/$clientId/job-positions/risk-evaluations/$evaluationId',
      params: { clientId, evaluationId },
      hash: evaluationSections.factors,
    }),
  addPosition: (clientId: string) =>
    linkOptions({
      to: '/clients/$clientId/job-positions',
      params: { clientId },
      search: { focus: 'add-position' as const },
    }),
  positions: (clientId: string) =>
    linkOptions({ to: '/clients/$clientId/job-positions', params: { clientId } }),
  documentSection: (clientId: string, section: DocumentSectionId) =>
    linkOptions({ to: '/clients/$clientId/documents', params: { clientId }, search: { section } }),
  position: (clientId: string, jobPositionId: string, decision: JobPositionDecision) =>
    linkOptions({
      to: '/clients/$clientId/job-positions/$jobPositionId',
      params: { clientId, jobPositionId },
      hash: positionSections[decision],
    }),
  // Before the position is evaluated, the page offers to start.
  positionEvaluation: (clientId: string, jobPositionId: string) =>
    linkOptions({
      to: '/clients/$clientId/job-positions/$jobPositionId/risk-evaluation',
      params: { clientId, jobPositionId },
      hash: evaluationSections.factors,
    }),
  clientContract: (clientId: string) =>
    linkOptions({
      to: '/clients/$clientId/contract',
      params: { clientId },
      search: { focus: 'contract-details' as const },
      replace: true,
      resetScroll: false,
    }),
  // Only the contract card on the same page links here, so it stays one entry of the history.
  lead: (leadId: string, focus: CompanyFocus | ContractFocus) =>
    linkOptions({
      to: '/leads/$leadId',
      params: { leadId },
      search: { focus },
      replace: true,
      resetScroll: false,
    }),
  organizationCompany: (focus: OrganizationCompanyFocus) =>
    linkOptions({ to: '/organization/company', search: { focus } }),
  authorizations: (focus: AuthorizationsFocus) =>
    linkOptions({ to: '/organization/authorizations', search: { focus } }),
  profile: (focus: ProfileFocus) => linkOptions({ to: '/profile', search: { focus } }),
};

export type MissingTarget = ReturnType<(typeof to)[keyof typeof to]>;

export type MissingRow = {
  key: string;
  label: string;
  detail?: string;
  // Null when the person looking cannot fix it, such as a specialist and the organization's data.
  target: MissingTarget | null;
};

export type MissingGroup = {
  place: string;
  heading: string;
  hint?: string;
  rows: MissingRow[];
};

// Romanian puts "de" between a number and its noun from 20 on, except 101 to 119 and the like.
export function missingCountLabel(count: number) {
  const tens = count % 100;
  if (count === 1) return '1 dată de completat';
  return tens === 0 || tens >= 20 ? `${count} de date de completat` : `${count} date de completat`;
}

export const countRows = (groups: readonly MissingGroup[]) =>
  groups.reduce((total, group) => total + group.rows.length, 0);

// The order of the keys is the order of the groups in the form.
export const documentPlaces = {
  organization: 'Datele organizației',
  profile: 'Profilul tău',
  clientDetails: 'Detaliile clientului',
  fireSafetyMeans: 'Mijloacele PSI',
  training: 'Instruire și responsabili',
  jobPositions: 'Posturile de lucru',
  riskEvaluations: 'Evaluarea riscurilor',
  documents: 'Documentația SSM',
} as const;

type DocumentPlace = keyof typeof documentPlaces;

type Clash = { representativeName: string; legalRepresentativeName: string } | null;

type DocumentContext = { clientId: string; clash: Clash; currentEmployeeCount?: number };

const responsible = (role: ResponsiblePersonRole, focus: TrainingFocus) => ({
  place: 'training' as const,
  label: responsibleRoleLabels[role].label,
  detail: 'Nicio persoană responsabilă nu are încă acest rol.',
  target: ({ clientId }: DocumentContext) => to.training(clientId, focus),
});

export const documentMissingData: Record<
  MissingDocumentData,
  {
    place: DocumentPlace;
    label: string;
    detail?: string | ((context: DocumentContext) => string);
    target: (context: DocumentContext) => MissingTarget;
  }
> = {
  'provider.legalName': {
    place: 'organization',
    label: 'Denumirea legală',
    target: () => to.organizationCompany('legal-name'),
  },
  'provider.representativeName': {
    place: 'organization',
    label: 'Numele reprezentantului legal',
    target: () => to.organizationCompany('representative-name'),
  },
  'provider.representativeRole': {
    place: 'organization',
    label: 'Funcția reprezentantului legal',
    target: () => to.organizationCompany('representative-role'),
  },
  'provider.fireSafetyTechnician': {
    place: 'organization',
    label: 'Cadrul tehnic PSI',
    detail: 'Numele lui apare pe documentele PSI.',
    target: () => to.authorizations('fire-safety-technician'),
  },
  'specialist.name': {
    place: 'profile',
    label: 'Numele tău',
    target: () => to.profile('full-name'),
  },
  'specialist.professionalTitle': {
    place: 'profile',
    label: 'Titlul profesional',
    detail: 'Apare lângă numele tău în documente.',
    target: () => to.profile('professional-title'),
  },
  'client.representativeName': {
    place: 'clientDetails',
    label: 'Numele reprezentantului legal',
    target: ({ clientId }) => to.clientDetails(clientId, 'legal-representative-name'),
  },
  'client.representativeRole': {
    place: 'clientDetails',
    label: 'Funcția reprezentantului legal',
    target: ({ clientId }) => to.clientDetails(clientId, 'legal-representative-role'),
  },
  'client.trainingSchedule': {
    place: 'training',
    label: 'Programul instruirii periodice',
    detail: 'Intervalele pe categorii, prima lună, durata și zilele.',
    target: ({ clientId }) => to.training(clientId, 'training-schedule'),
  },
  'responsible.workplace_manager': responsible('workplace_manager', 'workplace-manager'),
  'responsible.first_aid': responsible('first_aid', 'first-aid'),
  'responsible.risk_evaluation_team': responsible('risk_evaluation_team', 'risk-evaluation-team'),
  'responsible.imminent_danger': responsible('imminent_danger', 'imminent-danger'),
  'responsible.workers_representative': {
    place: 'training',
    label: 'Reprezentantul lucrătorilor',
    // Below 10 employees only a decision 1.5 generated earlier asks for one (ADR 010).
    detail: ({ currentEmployeeCount }) =>
      currentEmployeeCount !== undefined &&
      requiredWorkersRepresentatives(currentEmployeeCount) === 0
        ? 'Ales dintre angajații actuali. Decizia îl numește și când clientul are sub 10 angajați.'
        : 'Ales dintre angajați. Clientul are cel puțin 10 angajați.',
    target: ({ clientId }) => to.training(clientId, 'workers-representative'),
  },
  'responsible.workers_representatives_two': {
    place: 'training',
    label: 'Al doilea reprezentant al lucrătorilor',
    detail: 'Clientul are cel puțin 50 de angajați.',
    target: ({ clientId }) => to.training(clientId, 'workers-representative'),
  },
  'responsible.workers_representative_is_legal_representative': {
    place: 'training',
    label: 'Alt reprezentant al lucrătorilor',
    detail: ({ clash }) =>
      clash
        ? `„${clash.representativeName}” are același nume ca reprezentantul legal al clientului, „${clash.legalRepresentativeName}”.`
        : 'Reprezentantul legal al clientului nu îi poate reprezenta și pe lucrători.',
    target: ({ clientId }) => to.training(clientId, 'workers-representative-clash'),
  },
  'positions.any': {
    place: 'jobPositions',
    label: 'Cel puțin un post de lucru',
    detail: 'Echipamentul de protecție și instrucțiunile se stabilesc pe posturi.',
    target: ({ clientId }) => to.addPosition(clientId),
  },
  // One row per position replaces these two whenever readiness names the positions.
  'positions.equipment': {
    place: 'jobPositions',
    label: 'Echipamentul de protecție al posturilor',
    target: ({ clientId }) => to.positions(clientId),
  },
  'positions.instructions': {
    place: 'jobPositions',
    label: 'Instrucțiunile specifice ale posturilor',
    target: ({ clientId }) => to.positions(clientId),
  },
  // One row per evaluation replaces these whenever readiness names the evaluations.
  'positions.risk_evaluation': {
    place: 'riskEvaluations',
    label: 'Evaluarea riscurilor pe posturi',
    detail: 'Fiecare post are nevoie de o evaluare cu cel puțin un factor de risc.',
    target: ({ clientId }) => to.positions(clientId),
  },
  'risk_evaluations.sensitive_groups': {
    place: 'riskEvaluations',
    label: 'Evaluarea grupurilor sensibile',
    detail: 'Legea o cere pentru fiecare client, cu cel puțin un factor de risc.',
    target: ({ clientId }) => to.clientEvaluations(clientId),
  },
  'risk_evaluations.measures': {
    place: 'riskEvaluations',
    label: 'Măsurile pentru riscurile inacceptabile',
    detail: 'Fiecare factor peste nivelul 3 are nevoie de cel puțin o măsură de prevenire.',
    target: ({ clientId }) => to.positions(clientId),
  },
  'risk_evaluations.plan': {
    place: 'riskEvaluations',
    label: 'Termenele și responsabilii din planul de prevenire',
    detail: 'Fiecare factor cu măsuri are nevoie de un termen și de o persoană care răspunde.',
    target: ({ clientId }) => to.positions(clientId),
  },
  'documents.own_instructions': {
    place: 'documents',
    label: 'Instrucțiunile proprii, generate înaintea tematicii',
    detail: 'Tematica citează modulele pe care le anexează instrucțiunile proprii.',
    target: ({ clientId }) => to.documentSection(clientId, 'own-instructions'),
  },
  'responsible.fire_safety_coordinator': responsible(
    'fire_safety_coordinator',
    'fire-safety-coordinator'
  ),
  'responsible.fire_intervention_leader': responsible(
    'fire_intervention_leader',
    'fire-intervention-leader'
  ),
  'fire.trainingSchedule': {
    place: 'training',
    label: 'Programul instruirii PSI',
    detail: 'Durata, intervalele pe categorii, prima lună și zilele.',
    target: ({ clientId }) => to.training(clientId, 'fire-training-schedule'),
  },
  'fire.waste': {
    place: 'training',
    label: 'Deșeurile colectate',
    detail: 'Cel puțin un tip de deșeu, pentru decizia privind colectarea deșeurilor.',
    target: ({ clientId }) => to.training(clientId, 'fire-waste'),
  },
  'fire.workplaces': {
    place: 'clientDetails',
    label: 'Datele PSI ale locurilor de muncă',
    detail:
      'Activitatea, suprafața, norma de dotare, punctul de adunare și textele fișei de la locul de muncă.',
    target: ({ clientId }) => to.clientDetails(clientId, 'workplace-fire-data'),
  },
  'fire.equipment': {
    place: 'fireSafetyMeans',
    label: 'Stingătoarele locurilor de muncă',
    detail: 'Fiecare loc de muncă activ are nevoie de cel puțin un stingător.',
    target: ({ clientId }) => to.fireSafetyMeans(clientId),
  },
};

const decisionRows: Record<
  JobPositionDecision,
  { code: MissingDocumentData; section: string; detail: string }
> = {
  equipment: {
    code: 'positions.equipment',
    section: 'echipament de protecție',
    detail: 'Articolele postului, sau că nu are nevoie de echipament.',
  },
  instructions: {
    code: 'positions.instructions',
    section: 'instrucțiuni',
    detail: 'Instrucțiunile specifice ale postului, sau că nu are nevoie de ele.',
  },
};

type UndecidedJobPosition = { id: string; name: string; undecided: JobPositionDecision[] };

type IncompleteRiskEvaluation = {
  evaluationId: string | null;
  kind: RiskEvaluationKind;
  jobPositionId: string | null;
  name: string;
  missing: RiskEvaluationGap[];
};

const evaluationGaps: Record<RiskEvaluationGap, { section: string; detail: string }> = {
  factors: {
    section: 'evaluarea riscurilor',
    detail: 'Cel puțin un factor de risc, cu clasele lui.',
  },
  measures: {
    section: 'măsuri de prevenire',
    detail: 'Fiecare factor peste nivelul 3 are nevoie de cel puțin o măsură.',
  },
  plan: {
    section: 'termene și responsabili',
    detail: 'Fiecare factor cu măsuri are nevoie de un termen și de o persoană care răspunde.',
  },
};

const gapCode = (kind: RiskEvaluationKind, gap: RiskEvaluationGap): MissingDocumentData =>
  gap === 'measures'
    ? 'risk_evaluations.measures'
    : gap === 'plan'
      ? 'risk_evaluations.plan'
      : kind === 'job_position'
        ? 'positions.risk_evaluation'
        : 'risk_evaluations.sensitive_groups';

export function documentMissingGroups({
  missing,
  clientId,
  clash,
  undecidedJobPositions,
  incompleteRiskEvaluations = [],
  currentEmployeeCount,
  canEditOrganization,
}: {
  missing: readonly MissingDocumentData[];
  clientId: string;
  clash: Clash;
  currentEmployeeCount?: number;
  undecidedJobPositions: readonly UndecidedJobPosition[];
  incompleteRiskEvaluations?: readonly IncompleteRiskEvaluation[];
  canEditOrganization: boolean;
}): MissingGroup[] {
  const context = { clientId, clash, currentEmployeeCount };
  const rowOf = (code: MissingDocumentData): MissingRow => {
    const entry = documentMissingData[code];
    return {
      key: code,
      label: entry.label,
      detail: typeof entry.detail === 'function' ? entry.detail(context) : entry.detail,
      target: entry.place === 'organization' && !canEditOrganization ? null : entry.target(context),
    };
  };
  const positionRows = undecidedJobPositions.flatMap((position) =>
    position.undecided
      .filter((decision) => missing.includes(decisionRows[decision].code))
      .map((decision): MissingRow => ({
        key: `${position.id}:${decision}`,
        label: `${position.name} · ${decisionRows[decision].section}`,
        detail: decisionRows[decision].detail,
        target: to.position(clientId, position.id, decision),
      }))
  );
  const evaluationRows = incompleteRiskEvaluations.flatMap((evaluation) =>
    evaluation.missing
      .filter((gap) => missing.includes(gapCode(evaluation.kind, gap)))
      .map((gap): MissingRow => {
        const code = gapCode(evaluation.kind, gap);
        return {
          key: `${evaluation.evaluationId ?? evaluation.jobPositionId ?? evaluation.kind}:${gap}`,
          label:
            code === 'risk_evaluations.sensitive_groups'
              ? documentMissingData[code].label
              : `${evaluation.name} · ${evaluationGaps[gap].section}`,
          detail: evaluationGaps[gap].detail,
          target: evaluation.jobPositionId
            ? to.positionEvaluation(clientId, evaluation.jobPositionId)
            : evaluation.evaluationId
              ? to.clientEvaluation(clientId, evaluation.evaluationId)
              : to.clientEvaluations(clientId),
        };
      })
  );
  const listed = new Set([
    ...undecidedJobPositions.flatMap((position) =>
      position.undecided.map((decision) => decisionRows[decision].code)
    ),
    ...incompleteRiskEvaluations.flatMap((evaluation) =>
      evaluation.missing.map((gap) => gapCode(evaluation.kind, gap))
    ),
  ]);
  return (Object.keys(documentPlaces) as DocumentPlace[])
    .map((place) => ({
      place,
      heading: documentPlaces[place],
      hint:
        place === 'organization' && !canEditOrganization
          ? 'Le completează proprietarul organizației.'
          : undefined,
      rows: [
        ...missing
          .filter((code) => documentMissingData[code].place === place && !listed.has(code))
          .map(rowOf),
        ...(place === 'jobPositions' ? positionRows : []),
        ...(place === 'riskEvaluations' ? evaluationRows : []),
      ],
    }))
    .filter((group) => group.rows.length > 0);
}

type ContractPlace = 'organization' | 'authorizations' | 'company' | 'contract';

export const contractMissingData: Record<
  MissingServiceContractData,
  {
    label: string;
    detail?: string;
    place: ContractPlace;
    target: (company: { id: string; stage: 'lead' | 'client' }) => MissingTarget;
  }
> = {
  'provider.legalName': {
    place: 'organization',
    label: 'Denumirea juridică',
    target: () => to.organizationCompany('legal-name'),
  },
  'provider.cui': {
    place: 'organization',
    label: 'CUI',
    target: () => to.organizationCompany('cui'),
  },
  'provider.tradeRegisterNumber': {
    place: 'organization',
    label: 'Numărul din Registrul Comerțului',
    target: () => to.organizationCompany('trade-register'),
  },
  'provider.address': {
    place: 'organization',
    label: 'Adresa sediului',
    detail: 'Județ, localitate și adresă.',
    target: () => to.organizationCompany('address'),
  },
  'provider.representativeName': {
    place: 'organization',
    label: 'Reprezentantul legal',
    target: () => to.organizationCompany('representative-name'),
  },
  'provider.representativeRole': {
    place: 'organization',
    label: 'Funcția reprezentantului legal',
    target: () => to.organizationCompany('representative-role'),
  },
  'provider.phone': {
    place: 'organization',
    label: 'Telefonul',
    target: () => to.organizationCompany('phone'),
  },
  'provider.bankAccount': {
    place: 'organization',
    label: 'Contul bancar și banca',
    target: () => to.organizationCompany('bank-account'),
  },
  'provider.authorizationCertificate': {
    place: 'authorizations',
    label: 'Certificatul de abilitare SSM',
    detail: 'Număr, dată și emitent.',
    target: () => to.authorizations('certificate'),
  },
  'provider.fireSafetyTechnician': {
    place: 'authorizations',
    label: 'Cadrul tehnic PSI',
    detail: 'Numele și certificatul lui, pentru un contract care cuprinde și PSI.',
    target: () => to.authorizations('fire-safety-technician'),
  },
  'client.tradeRegisterNumber': {
    place: 'company',
    label: 'Numărul din Registrul Comerțului',
    target: ({ id, stage }) =>
      stage === 'lead'
        ? to.lead(id, 'company-trade-register')
        : to.clientDetails(id, 'company-trade-register'),
  },
  'client.address': {
    place: 'company',
    label: 'Adresa sediului',
    detail: 'Județ, localitate și adresă.',
    target: ({ id, stage }) =>
      stage === 'lead' ? to.lead(id, 'company-address') : to.clientDetails(id, 'company-address'),
  },
  'client.representativeName': {
    place: 'company',
    label: 'Reprezentantul legal',
    target: ({ id, stage }) =>
      stage === 'lead'
        ? to.lead(id, 'contract-representative-name')
        : to.clientDetails(id, 'legal-representative-name'),
  },
  'client.representativeRole': {
    place: 'company',
    label: 'Funcția reprezentantului legal',
    target: ({ id, stage }) =>
      stage === 'lead'
        ? to.lead(id, 'contract-representative-role')
        : to.clientDetails(id, 'legal-representative-role'),
  },
  'contract.details': {
    place: 'contract',
    label: 'Numărul și datele contractului',
    target: ({ id, stage }) =>
      stage === 'lead' ? to.lead(id, 'contract-details') : to.clientContract(id),
  },
};

export function contractMissingGroups(
  missing: readonly MissingServiceContractData[],
  company: { id: string; stage: 'lead' | 'client'; legalName: string }
): MissingGroup[] {
  const headings: Record<ContractPlace, string> = {
    organization: 'Datele organizației tale',
    authorizations: 'Abilitările organizației',
    company: company.legalName,
    contract: 'Detaliile contractului',
  };
  return (Object.keys(headings) as ContractPlace[])
    .map((place) => ({
      place,
      heading: headings[place],
      rows: missing
        .filter((code) => contractMissingData[code].place === place)
        .map((code) => ({
          key: code,
          label: contractMissingData[code].label,
          detail: contractMissingData[code].detail,
          target: contractMissingData[code].target(company),
        })),
    }))
    .filter((group) => group.rows.length > 0);
}
