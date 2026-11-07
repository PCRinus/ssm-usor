import {
  type SetupField,
  type SetupLock,
  type SetupMemberStepId,
  setupMemberStepIds,
  type SetupStepId,
} from '@ssm-usor/contracts';
import { linkOptions } from '@tanstack/react-router';

import type {
  AuthorizationsFocus,
  OrganizationCompanyFocus,
  ProfileFocus,
} from '@/features/missing-data/focus';

export const totalSteps = 15;

export const countsAsDone = (step: { state: string }) =>
  step.state === 'done' || step.state === 'skipped';

// A specialist cannot do an organization step, so one still waiting for an owner would keep
// their guide open for good (ADR 031).
export const isComplete = (steps: readonly { state: string; canDo: boolean }[]) =>
  steps.every((step) => !step.canDo || countsAsDone(step));

const to = {
  company: (focus?: OrganizationCompanyFocus) =>
    linkOptions({ to: '/organizatie/date-firma', search: { focus } }),
  authorizations: (focus?: AuthorizationsFocus) =>
    linkOptions({ to: '/organizatie/abilitari', search: { focus } }),
  profile: (focus: ProfileFocus) => linkOptions({ to: '/profil', search: { focus } }),
  newClient: () => linkOptions({ to: '/clienti/nou' }),
  clients: () => linkOptions({ to: '/clienti' }),
  details: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/detalii', params: { clientId } }),
  positions: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/posturi', params: { clientId } }),
  newEmployee: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/angajati/nou', params: { clientId } }),
  training: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/instruire', params: { clientId } }),
  trainings: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/instruiri-tinute', params: { clientId } }),
  documents: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/documente-ssm', params: { clientId } }),
  fireSafetyDocuments: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/documente-su', params: { clientId } }),
  portal: (clientId: string) =>
    linkOptions({ to: '/clienti/$clientId/portal', params: { clientId } }),
  signatures: () => linkOptions({ to: '/semnaturi' }),
};

export type StepTarget = ReturnType<(typeof to)[keyof typeof to]>;

export type StepActionKind = 'form' | 'open';

export interface StepAction {
  label: string;
  kind: StepActionKind;
  target: StepTarget;
}

export interface StepContext {
  clientId: string | null;
  missing: readonly SetupField[];
}

interface StepCopy {
  label: string;
  // Once the organization has a client, whoever added it.
  neutralLabel?: string;
  sentence: string;
  actions: (context: StepContext) => StepAction[];
}

export const fieldLabels: Record<SetupField, string> = {
  cui: 'CUI',
  'legal-name': 'denumirea juridică',
  address: 'adresa sediului',
  'representative-name': 'reprezentantul legal',
  'representative-role': 'funcția reprezentantului legal',
  certificate: 'certificatul de abilitare SSM',
  'fire-safety-technician': 'cadrul tehnic PSI',
};

export function fieldTarget(field: SetupField): StepTarget {
  return field === 'certificate' || field === 'fire-safety-technician'
    ? to.authorizations(field)
    : to.company(field);
}

// Steps 6 to 15 unlock only once the organization has a client, so the list is the way out
// when the furthest client has just been archived.
const onClient = (clientId: string | null, target: (clientId: string) => StepTarget) =>
  clientId ? target(clientId) : to.clients();

const documentsActions = ({ clientId }: StepContext): StepAction[] => [
  { label: 'Documente SSM', kind: 'open', target: onClient(clientId, to.documents) },
  { label: 'Documente SU', kind: 'open', target: onClient(clientId, to.fireSafetyDocuments) },
];

export const stepCopy: Record<SetupStepId, StepCopy> = {
  account: {
    label: 'Creează contul',
    sentence: '',
    actions: () => [],
  },
  company: {
    label: 'Completează datele firmei',
    sentence: 'Apar pe documentele SSM și pe contractul de servicii.',
    actions: ({ missing }) => [
      {
        label: 'Completează datele',
        kind: 'open',
        target: missing[0] ? fieldTarget(missing[0]) : to.company(),
      },
    ],
  },
  authorizations: {
    label: 'Adaugă abilitările și cadrul tehnic PSI',
    sentence: 'Documentele SU tipăresc cadrul tehnic, iar contractul citează certificatul.',
    actions: ({ missing }) => [
      {
        label: 'Completează abilitările',
        kind: 'open',
        target: missing[0] ? fieldTarget(missing[0]) : to.authorizations(),
      },
    ],
  },
  'professional-title': {
    label: 'Completează-ți titlul profesional',
    sentence: 'Apare lângă numele tău pe documentele pe care le întocmești.',
    actions: () => [
      { label: 'Completează titlul', kind: 'open', target: to.profile('professional-title') },
    ],
  },
  client: {
    label: 'Adaugă primul client',
    neutralLabel: 'Adaugă un client',
    sentence: 'Completezi datele firmei pornind de la CUI.',
    actions: () => [{ label: 'Adaugă client', kind: 'form', target: to.newClient() }],
  },
  'workplaces-positions': {
    label: 'Adaugă punctele de lucru și posturile',
    neutralLabel: 'Adaugă puncte de lucru și posturi',
    sentence: 'Punctele de lucru sunt la Detalii, posturile la Posturi de lucru.',
    actions: ({ clientId }) => [
      { label: 'Puncte de lucru', kind: 'open', target: onClient(clientId, to.details) },
      { label: 'Posturi', kind: 'open', target: onClient(clientId, to.positions) },
    ],
  },
  employees: {
    label: 'Adaugă lucrătorii',
    neutralLabel: 'Adaugă lucrători',
    sentence: 'Îi adaugi pe rând, fiecare cu postul și punctul lui de lucru.',
    actions: ({ clientId }) => [
      { label: 'Adaugă lucrător', kind: 'form', target: onClient(clientId, to.newEmployee) },
    ],
  },
  'responsible-persons': {
    label: 'Numește persoanele responsabile',
    sentence:
      'Conducătorul locului de muncă, primul ajutor și ceilalți pe care îi cer documentele.',
    actions: ({ clientId }) => [
      { label: 'Numește persoanele', kind: 'open', target: onClient(clientId, to.training) },
    ],
  },
  'risk-evaluation': {
    label: 'Evaluează riscurile posturilor',
    neutralLabel: 'Evaluează riscurile unui post',
    sentence: 'Alegi factorii de risc ai fiecărui post și măsurile pentru ei.',
    actions: ({ clientId }) => [
      { label: 'Deschide posturile', kind: 'open', target: onClient(clientId, to.positions) },
    ],
  },
  'fire-safety-data': {
    label: 'Completează datele SU ale clientului',
    neutralLabel: 'Completează datele SU ale unui client',
    sentence: 'Programul instruirii SU, fumatul și deșeurile, pe care le tipăresc documentele SU.',
    actions: ({ clientId }) => [
      { label: 'Completează datele SU', kind: 'open', target: onClient(clientId, to.training) },
    ],
  },
  'generate-sets': {
    label: 'Generează documentația SSM și SU',
    sentence: 'Din datele adăugate generezi setul de documente SSM și pe cel SU.',
    actions: documentsActions,
  },
  'issue-document': {
    label: 'Emite primul document',
    neutralLabel: 'Emite un document',
    sentence: 'Verifici un document generat și îl emiți, ca să-l poți tipări și semna.',
    actions: documentsActions,
  },
  'portal-invitation': {
    label: 'Invită lucrătorii în portal',
    neutralLabel: 'Invită lucrători în portal',
    sentence: 'În portal lucrătorii își văd instruirile și documentele și semnează.',
    actions: ({ clientId }) => [
      { label: 'Deschide Portalul', kind: 'open', target: onClient(clientId, to.portal) },
    ],
  },
  training: {
    label: 'Înregistrează prima instruire',
    neutralLabel: 'Înregistrează o instruire',
    sentence: 'Notezi instruirea ținută și cine a participat; scadențele le ține aplicația.',
    actions: ({ clientId }) => [
      {
        label: 'Deschide Instruiri ținute',
        kind: 'open',
        target: onClient(clientId, to.trainings),
      },
    ],
  },
  signature: {
    label: 'Strânge prima semnătură electronică',
    neutralLabel: 'Strânge o semnătură electronică',
    sentence: 'Trimiți fișa de instruire la semnat, iar lucrătorul o semnează din portal.',
    actions: () => [{ label: 'Deschide Semnături', kind: 'open', target: to.signatures() }],
  },
};

export interface StepGroup {
  id: 'firma' | 'client' | 'documentatie' | 'instruire';
  title: string;
  neutralTitle?: string;
  steps: readonly SetupStepId[];
}

export const stepGroups: readonly StepGroup[] = [
  {
    id: 'firma',
    title: 'Contul și firma',
    steps: ['account', 'company', 'authorizations', 'professional-title'],
  },
  {
    id: 'client',
    title: 'Primul client',
    neutralTitle: 'Primul tău client',
    steps: ['client', 'workplaces-positions', 'employees', 'responsible-persons'],
  },
  {
    id: 'documentatie',
    title: 'Prima documentație',
    neutralTitle: 'Prima ta documentație',
    steps: ['risk-evaluation', 'fire-safety-data', 'generate-sets', 'issue-document'],
  },
  {
    id: 'instruire',
    title: 'Instruire și semnături',
    steps: ['portal-invitation', 'training', 'signature'],
  },
];

export const stepLabel = (id: SetupStepId, neutral: boolean) => {
  const copy = stepCopy[id];
  return (neutral && copy.neutralLabel) || copy.label;
};

export const groupTitle = (group: StepGroup, neutral: boolean) =>
  (neutral && group.neutralTitle) || group.title;

const memberSteps = new Set<SetupStepId>(setupMemberStepIds);

export const isMemberStep = (id: SetupStepId): id is SetupMemberStepId => memberSteps.has(id);

export const organizationSteps = new Set<SetupStepId>(['company', 'authorizations']);

const lockReasons: Record<Exclude<SetupLock, 'needs-organization-data'>, string> = {
  'needs-client': 'Adaugă întâi primul client ca să deblochezi pasul.',
  'needs-workplace-and-position': 'Adaugă întâi punctele de lucru și posturile.',
  'needs-position': 'Se deblochează după ce clientul are posturi.',
  'needs-professional-title': 'Completează-ți întâi titlul profesional.',
  'needs-basic-data': 'Se deblochează când clientul are toate datele de bază.',
  'needs-draft': 'Generează întâi documentația.',
  'needs-employee': 'Adaugă întâi lucrătorii clientului.',
  'needs-training-record': 'Se deblochează după prima instruire.',
};

export function lockReason(
  lock: SetupLock,
  { ownerName, isOwner }: { ownerName: string | null; isOwner: boolean }
) {
  if (lock !== 'needs-organization-data') return lockReasons[lock];
  if (isOwner) return 'Completează întâi datele firmei și cadrul tehnic PSI.';
  return ownerName
    ? `Așteaptă datele firmei de la administrator, ${ownerName}.`
    : 'Așteaptă datele firmei de la un administrator.';
}

export const ownerOnlyNote = (ownerName: string | null) =>
  ownerName
    ? `Doar administratorul poate completa · ${ownerName}`
    : 'Doar un administrator poate completa';

export function doneNote(
  id: SetupStepId,
  { ownerName, canDo }: { ownerName: string | null; canDo: boolean }
) {
  if (id === 'professional-title') return 'Apare pe documente';
  if (organizationSteps.has(id) && !canDo && ownerName) return `Făcut de ${ownerName}`;
  return 'Gata';
}

export const missingSentence = (missing: readonly SetupField[]) =>
  missing.length === 1 ? 'Lipsește:' : 'Lipsesc:';
